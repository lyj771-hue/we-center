'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAdmin } from '@/components/AdminContext';
import { clearMemberBranch, deleteMemberCenter, getMemberCenterRequests, getMemberCenters, promoteMemberCenter, getMembers, saveMemberProfile, setMemberCenterApproved } from '@/lib/store';
import type { Member, MemberExtras } from '@/lib/types';
import { askConfirm, showAlert } from '@/lib/dialog';
import ChildrenTab from '@/components/ChildrenTab';
import PaymentsTab from '@/components/PaymentsTab';
import type { Center, Child } from '@/lib/timetable';
import { getChildren, getPaymentCounts, linkChild, methodInCenter, setChildBalance, setChildUses } from '@/lib/timetable';
import { addCharge } from '@/lib/prepaid';
import { notifyMemberApproved, sendSummary } from '@/lib/alimtalkNotify';

// 회원 관리 (관리자 전용) — 카카오로 로그인한 보호자 표.
// 이름(아이 이름)은 보호자가 가입할 때 입력한 것, 설명은 관리자가 적는다. 센터 닉네임(center_nickname)은 더 쓰지 않는다(있던 값만 남아 있음).
// "승인"을 누르면 승인일자가 찍히고 이름·뒷번호가 같은 명단 아이와 이어진다. 승인/미승인 탭으로 나눠 본다(승인 탭의 '가입일자'는 승인한 날, 미승인 탭의 '가입신청일자'는 처음 로그인한 날).
// 바우처~선결제 체크는 '결제방식 관리' 탭에서 승인된 회원만 따로 다룬다.
// 메뉴에는 없고 관리자 모드 띠의 "회원 관리"로 들어온다.

type Filter = 'waiting' | 'approved' | 'methods' | 'children' | 'payments';

// 선결제 칸 — 지금은 가려 둔다(DB에는 칸이 있다). 다시 보이려면 true
const SHOW_PREPAID = false;

// 지원 항목 — 받는지 체크(O/X). 누르면 바로 저장된다
// 굳센은 수색, 장맞춤은 의정부에서만. 장맞춤은 보호자 계정 칸이 없어 연결된 아이의 체크로만 (아이가 있어야 체크할 수 있다)
type SupportKey = keyof Pick<MemberExtras, 'voucher' | 'gusen' | 'kkumideun' | 'woojin' | 'subsidy'> | 'jangmatchum';
const ALL_SUPPORTS: { key: SupportKey; label: string }[] = [
  { key: 'voucher', label: '바우처' },
  { key: 'gusen', label: '굳센' },
  { key: 'jangmatchum', label: '장맞춤' },
  { key: 'kkumideun', label: '꿈이든' },
  { key: 'woojin', label: '우진학교' },
  { key: 'subsidy', label: '지원금' },
];

// 미승인 탭 — 승인할 때 꼭 적는 칸(없으면 0). 선결제는 남은 횟수, 우진학교·지원금은 남은 금액(원)
const APPROVE_FIELDS = [
  { key: 'prepaid', label: '선결제', unit: '회' },
  { key: 'woojin', label: '우진학교', unit: '원' },
  { key: 'subsidy', label: '지원금', unit: '원' },
] as const;
type ApproveField = (typeof APPROVE_FIELDS)[number]['key'];

const pad = (n: number) => String(n).padStart(2, '0');
const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
};
const fmtDateTime = (iso?: string) => {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${fmtDate(iso)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** 회원 관리 — 센터(수색/의정부)마다 따로. 보호자는 가입할 때 고른 센터, 아이는 아이 명단의 센터로 나눈다 */
export default function MembersView({ center }: { center: Center }) {
  const centerLabel = center === 'uijeongbu' ? '의정부' : '수색';
  const { isAdmin } = useAdmin();
  const [members, setMembers] = useState<Member[]>([]);
  const [filter, setFilter] = useState<Filter>('approved');
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ nickname: '', memo: '', prepaidEunpyeong: '0', prepaidUijeongbu: '0', code: '', phone: '', prepaidLeft: '' });
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const [kids, setKids] = useState<Child[]>([]);
  // 선결제 쓴 횟수(확정된 것, 처음부터) — 아이 id → 횟수. 남은 횟수 = 충전 합 − 쓴 횟수
  const [prepaidUsed, setPrepaidUsed] = useState<Map<string, number>>(new Map());
  const loadKids = useCallback(() => {
    getChildren().then(setKids).catch(() => {});
    getPaymentCounts('2000-01-01', '2999-12-31').then(c => setPrepaidUsed(new Map([...c].map(([id, v]) => [id, v.prepaid ?? 0])))).catch(() => {});
  }, []);
  useEffect(() => { if (isAdmin) loadKids(); }, [isAdmin, loadKids]);

  // 미승인 탭 — 승인할 때 적는 선결제·우진학교·지원금("회원|칸" → 적은 숫자). 하나라도 비어 있으면 승인할 수 없다
  const [approveInput, setApproveInput] = useState<Map<string, string>>(new Map());
  const inputOf = (m: Member, f: ApproveField) => approveInput.get(`${m.userId}|${f}`) ?? '';
  const filled = (m: Member) => APPROVE_FIELDS.every(f => inputOf(m, f.key) !== '');

  // 다른 지점 가입 신청 — "회원|지점" → 승인 시각(null = 대기)
  const [extraCenters, setExtraCenters] = useState<Map<string, string | null>>(new Map());
  // 다른 지점 가입 신청일 — "회원|지점" → 신청 시각
  const [requestedAt, setRequestedAt] = useState<Map<string, string>>(new Map());
  const load = useCallback(() => {
    getMemberCenters().then(setExtraCenters).catch(() => setExtraCenters(new Map()));
    getMemberCenterRequests().then(setRequestedAt).catch(() => setRequestedAt(new Map()));
    getMembers()
      .then(m => { setMembers(m); setFailed(false); })
      .catch(() => setFailed(true))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  // 이 지점 아이와 저절로 잇기(아래 autoLink.current) — 명단·회원을 새로 읽을 때마다
  const autoTried = useRef(new Set<string>());
  const autoLink = useRef<() => void>(() => {});
  useEffect(() => { autoLink.current(); }, [kids, members, extraCenters, center]);

  if (!isAdmin) {
    return <p className="text-center text-[14px] text-[#aaa] py-32">관리자만 볼 수 있는 화면이에요.</p>;
  }

  // 이 센터 명단에서 그 계정과 이어진 아이 (두 센터를 다니면 센터마다 따로 잇는다)
  const kidOf = (userId: string) => kids.find(k => k.guardianUserId === userId && (k.center ?? 'eunpyeong') === center);
  // 다른 지점 명단에서 이 계정과 이어진 아이 (예: 수색에 먼저 등록된 김유담)
  // [미연결 · 잇기] — 뒷번호가 달라 저절로 못 이었을 때, 이름이 같은 이 지점 아이를 보여 주고 확인받아 잇는다
  const linkByName = async (m: Member) => {
    const others = kids.filter(k => k.guardianUserId === m.userId && (k.center ?? 'eunpyeong') !== center);
    const names = new Set([m.nickname, ...others.flatMap(k => [k.name, `${k.name}${k.number ?? ''}`])].map(x => x.trim()).filter(Boolean));
    const hits = kids.filter(k => (k.center ?? 'eunpyeong') === center && (names.has(k.name) || names.has(`${k.name}${k.number ?? ''}`)));
    const label = [...names][0] ?? m.nickname;
    if (!hits.length) { await showAlert(`${centerLabel} 아이 명단에 "${label}"이(가) 없어요.\n아이 명단에 먼저 넣은 뒤 다시 눌러 주세요.`); return; }
    if (hits.length > 1) { await showAlert(`${centerLabel} 아이 명단에 같은 이름이 ${hits.length}명 있어요 (${hits.map(k => `${k.memberCode} ${k.name}${k.number ?? ''}`).join(', ')}).\n[수정]에서 회원 코드를 적어 이어 주세요.`); return; }
    const k = hits[0];
    const phone = m.phoneLast4 ?? others.find(o => o.phoneLast4)?.phoneLast4;
    const why = k.guardianUserId && k.guardianUserId !== m.userId ? `\n※ 지금 다른 계정(${members.find(x => x.userId === k.guardianUserId)?.nickname ?? '알 수 없음'})에 이어져 있어요 — 이 계정으로 옮겨요.`
      : !k.phoneLast4 ? '\n(명단 아이의 뒷번호가 비어 있어서 저절로 잇지 못했어요)'
      : k.phoneLast4 !== phone ? `\n(뒷번호가 달라서 저절로 잇지 못했어요: 명단 ${k.phoneLast4} / 보호자 ${phone ?? '없음'})` : '';
    if (!(await askConfirm(`${centerLabel} ${k.memberCode} ${k.name}${k.number ?? ''} 와(과) 이 계정을 이을까요?${why}`))) return;
    try { await linkChild(k.id, m.userId); loadKids(); await showAlert(`이었어요. ${centerLabel} ${k.memberCode} ${k.name}${k.number ?? ''}`); }
    catch (e) { showAlert(`잇지 못했어요.\n${(e as Error).message}`); }
  };
  const otherKidsOf = (userId: string) => kids.filter(k => k.guardianUserId === userId && (k.center ?? 'eunpyeong') !== center);
  // 이 지점 명단에서 같은 아이 찾기 — 이름(가입할 때 쓴 이름, 다른 지점에 이어진 아이 이름)과 뒷번호 4자리가 둘 다 같고, 다른 계정에 안 이어진 아이
  const sameKidsHere = (m: Member, list: Child[]) => {
    const others = list.filter(k => k.guardianUserId === m.userId && (k.center ?? 'eunpyeong') !== center);
    const names = [m.nickname, ...others.flatMap(k => [k.name, `${k.name}${k.number ?? ''}`])].map(x => x.trim()).filter(Boolean);
    const phones = [m.phoneLast4, ...others.map(k => k.phoneLast4)].filter((x): x is string => !!x);
    return list.filter(k => (k.center ?? 'eunpyeong') === center && (!k.guardianUserId || k.guardianUserId === m.userId)
      && !!k.phoneLast4 && phones.includes(k.phoneLast4)
      && names.some(n => n === k.name || n === `${k.name}${k.number ?? ''}` || n === `${k.number ?? ''}${k.name}`));
  };

  const startEdit = (m: Member) => {
    setEditing(m.userId);
    setForm({
      nickname: m.nickname, memo: m.memo ?? '',
      prepaidEunpyeong: String(m.prepaidEunpyeong), prepaidUijeongbu: String(m.prepaidUijeongbu),
      code: kidOf(m.userId)?.memberCode ?? '',
      phone: m.phoneLast4 ?? '',
      prepaidLeft: (() => { const k = kidOf(m.userId); return k ? String(prepaidLeftOf(k)) : ''; })(),
    });
  };
  /** 선결제 남은 횟수 (이 지점 아이) */
  const prepaidLeftOf = (k: Child) => (k.prepaidTotal ?? 0) - (prepaidUsed.get(k.id) ?? 0);

  const save = async (m: Member) => {
    if (!form.nickname.trim()) { alert('이름을 입력해 주세요.'); return; }
    try {
      const r = await saveMemberProfile({
        userId: m.userId, nickname: form.nickname, memo: form.memo, approvedAt: m.approvedAt, phoneLast4: form.phone,
        prepaidEunpyeong: Number(form.prepaidEunpyeong) || 0, prepaidUijeongbu: Number(form.prepaidUijeongbu) || 0,
      });
      if (r === 'taken') { alert('이미 다른 회원이 쓰는 이름이에요.'); return; }
      // 회원 코드로 아이와 잇기 (계정 하나 = 센터마다 아이 한 명)
      const code = form.code.trim().toUpperCase();
      const current = kidOf(m.userId);
      if (code !== (current?.memberCode ?? '')) {
        if (!code) {
          if (current) await linkChild(current.id, null);
        } else {
          const kid = kids.find(k => k.memberCode === code);
          if (!kid) { await showAlert(`회원 코드 ${code}인 아이가 명단에 없어요.`); return; }
          if (kid.guardianUserId && kid.guardianUserId !== m.userId && !(await askConfirm(`${code} ${kid.name}은(는) 다른 계정에 이어져 있어요.\n이 계정으로 옮길까요?`))) return;
          await linkChild(kid.id, m.userId);
        }
        loadKids();
      }
      // 선결제 남은 횟수 — 고쳤으면 지금 잔여와의 차이를 선결제 카드에 [수정] 기록으로
      const k = kidOf(m.userId);
      if (k && form.prepaidLeft.trim() !== '' && code === (current?.memberCode ?? '')) {
        const used = (await getPaymentCounts('2000-01-01', '2999-12-31')).get(k.id)?.prepaid ?? 0;
        const fresh = (await getChildren()).find(x => x.id === k.id) ?? k;
        const diff = (Number(form.prepaidLeft) || 0) - ((fresh.prepaidTotal ?? 0) - used);
        if (diff) {
          const d = new Date();
          await addCharge(k.id, `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, diff, '회원목록에서 남은 횟수 수정', true);
        }
        loadKids();
      }
      setEditing(null);
      load();
    } catch { alert('저장하지 못했어요. 다시 시도해 주세요.'); }
  };

  // 지원 항목 체크 — 아이 명단과 연결된 계정은 아이의 "쓰는 결제" 체크와 같이 바뀐다(둘 중 어디서 바꿔도)
  const SUPPORTS = ALL_SUPPORTS.filter(x => methodInCenter(x.key, center));
  const supportOf = (m: Member, key: SupportKey) => {
    const k = kidOf(m.userId);
    return k?.uses ? k.uses[key] : key === 'jangmatchum' ? false : m[key];
  };
  const toggleSupport = async (m: Member, key: SupportKey) => {
    const on = !supportOf(m, key);
    try {
      if (key !== 'jangmatchum') {
        await saveMemberProfile({ userId: m.userId, nickname: m.nickname, memo: m.memo, approvedAt: m.approvedAt, [key]: on });
        setMembers(ms => ms.map(x => (x.userId === m.userId ? { ...x, [key]: on } : x)));
      }
      const k = kidOf(m.userId);
      if (k) {
        await setChildUses(k.id, key, on);
        setKids(list => list.map(x => (x.id === k.id && x.uses ? { ...x, uses: { ...x.uses, [key]: on } } : x)));
      }
    } catch { showAlert('저장하지 못했어요. 다시 시도해 주세요.'); }
  };

  // 승인할 때 아이 명단과 자동 연결 — 이름(보호자 닉네임 또는 관리자 닉네임, 앞 숫자 포함 가능)과 뒷번호 4자리가 둘 다 같은 아이가 딱 하나면 잇는다
  const matchChild = async (m: Member): Promise<Child | undefined> => {
    if (kidOf(m.userId)) return kidOf(m.userId);   // 이미 연결됨
    // 화면을 연 뒤에 명단(뒷번호 등)이 바뀌었을 수 있으니 새로 읽어서 맞춘다
    const fresh = await getChildren().catch(() => kids);
    const already = fresh.find(k => k.guardianUserId === m.userId && (k.center ?? 'eunpyeong') === center);
    if (already) { setKids(fresh); return already; }
    if (!m.phoneLast4 && !fresh.some(k => k.guardianUserId === m.userId && k.phoneLast4)) { await showAlert('승인했어요.\n뒷번호가 없어서 아이 명단과는 연결하지 않았어요.'); return; }
    const hits = sameKidsHere(m, fresh);
    if (hits.length !== 1) {
      await showAlert(hits.length
        ? `승인했어요.\n이름·뒷번호가 같은 아이가 ${hits.length}명이라 자동 연결하지 않았어요. 회원 코드로 직접 연결해 주세요.`
        : '승인했어요.\n이름·뒷번호가 같은 아이가 명단에 없어서 연결하지 않았어요.');
      return;
    }
    const k = hits[0];
    if (k.guardianUserId && k.guardianUserId !== m.userId) {
      if (!(await askConfirm(`${k.memberCode} ${k.name}${k.number ?? ''}은(는) 다른 계정에 연결돼 있어요.\n이 계정으로 옮길까요?`))) return;
    }
    await linkChild(k.id, m.userId);
    loadKids();
    await showAlert(`승인하고 아이 명단과 연결했어요.\n${k.memberCode} ${k.name}${k.number ?? ''} ↔ 카카오 ${m.kakaoId}`);
    return k;
  };

  // 승인할 때 적은 값을 이어진 아이에게 — 선결제는 지금 잔여(충전 합 − 확정된 사용)와의 차이를 카드의 [수정] 기록으로, 우진학교·지원금은 남은 금액 그대로
  const saveApproveInput = async (m: Member, k?: Child) => {
    if (!filled(m)) return;
    const prepaid = Number(inputOf(m, 'prepaid')), woojin = Number(inputOf(m, 'woojin')), subsidy = Number(inputOf(m, 'subsidy'));
    if (!k) { await showAlert(`아이 명단과 연결되지 않아 선결제(${prepaid}회)·우진학교(${woojin.toLocaleString('ko-KR')}원)·지원금(${subsidy.toLocaleString('ko-KR')}원)은 저장하지 못했어요.\n연결한 뒤 결제내역·기존아이명단 탭에서 맞춰 주세요.`); return; }
    try {
      const used = (await getPaymentCounts('2000-01-01', '2999-12-31')).get(k.id)?.prepaid ?? 0;
      const fresh = (await getChildren()).find(x => x.id === k.id) ?? k;
      const diff = prepaid - ((fresh.prepaidTotal ?? 0) - used);
      if (diff) {
        const d = new Date();
        await addCharge(k.id, `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, diff, '승인할 때 잔여 입력', true);
      }
      await setChildBalance(k.id, 'woojin', woojin);
      await setChildBalance(k.id, 'subsidy', subsidy);
      setApproveInput(mp => { const n = new Map(mp); APPROVE_FIELDS.forEach(f => n.delete(`${m.userId}|${f.key}`)); return n; });
      loadKids();
    } catch (e) { await showAlert(`선결제·우진학교·지원금을 저장하지 못했어요.\n${(e as Error).message}`); }
  };

  // 승인 — 승인 버튼만 누르면 된다(같은 이름이어도 뒷번호·회원 코드로 아이를 구분해서 잇는다)
  const setApproved = async (m: Member, approve: boolean) => {
    if (!approve && !(await askConfirm(`"${m.nickname}" 회원의 승인을 취소할까요?\n${centerLabel} 아이 명단과의 연결도 끊어요.`))) return;
    const approvedAt = approve ? new Date().toISOString() : undefined;
    try {
      const r = await saveMemberProfile({
        userId: m.userId,
        nickname: m.nickname,
        memo: m.memo,
        approvedAt: approvedAt,
      });
      if (r === 'taken') { await showAlert('저장하지 못했어요. 다시 시도해 주세요.'); return; }
      // 승인 취소 — 이 지점 아이와의 연결도 끊는다 (다른 지점 연결은 그대로)
      const here = kidOf(m.userId);
      if (!approve && here) { await linkChild(here.id, null); loadKids(); autoTried.current.add(`${m.userId}|${center}`); }
      if (approve) {
        // 아이 명단의 같은 아이(이름·뒷번호)와 잇고, 적은 선결제·우진학교·지원금을 그 아이에게 맞춘다
        await saveApproveInput(m, await matchChild(m));
        await sendApproved(m);
      }
      load();
    } catch { showAlert('저장하지 못했어요. 다시 시도해 주세요.'); }
  };
  // 승인하면 그 보호자에게 '회원가입 승인' 알림톡
  const sendApproved = async (m: Member) => {
    try {
      const r = await notifyMemberApproved(m, center, isExtra(m) ? requestedAt.get(`${m.userId}|${center}`) : m.joinedAt);
      await showAlert(`회원가입 승인 알림톡 — ${sendSummary(r)}`);
    } catch (e) { await showAlert(`승인했지만 알림톡을 보내지 못했어요.\n${(e as Error).message}`); }
  };

  const remove = async (m: Member) => {
    // 처음 가입한 지점이 다른 지점이면 — 이 지점에서만 빠진다(처음 지점 가입·프로필·다른 지점 아이 연결은 그대로)
    if (isExtra(m)) {
      if (!(await askConfirm(`"${m.nickname}" 회원을 ${centerLabel}에서만 뺄까요?\n${(m.center ?? 'eunpyeong') === 'uijeongbu' ? '의정부' : '수색'} 가입은 그대로예요. ${centerLabel} 아이 명단과의 연결은 끊어요.`))) return;
      try {
        const here = kidOf(m.userId);
        if (here) await linkChild(here.id, null);
        autoTried.current.add(`${m.userId}|${center}`);
        await deleteMemberCenter(m.userId, center);
        loadKids(); load();
      } catch (e) { showAlert(`지우지 못했어요.\n${(e as Error).message}`); }
      return;
    }
    // 처음 가입한 지점에서 지울 때 — 다른 지점에도 가입돼 있으면 그 지점이 기본 지점이 되고 이 지점에서만 빠진다
    const other = (['eunpyeong', 'uijeongbu'] as const).find(c => c !== center && extraCenters.has(`${m.userId}|${c}`));
    if (other) {
      const otherLabel = other === 'uijeongbu' ? '의정부' : '수색';
      if (!(await askConfirm(`"${m.nickname}" 회원을 ${centerLabel}에서만 뺄까요?\n${otherLabel} 가입은 그대로예요. ${centerLabel} 아이 명단과의 연결은 끊어요.`))) return;
      try {
        const here = kidOf(m.userId);
        if (here) await linkChild(here.id, null);
        autoTried.current.add(`${m.userId}|${center}`);
        await promoteMemberCenter(m.userId, other);
        loadKids(); load();
      } catch (e) { showAlert(`지우지 못했어요.\n${(e as Error).message}`); }
      return;
    }
    // 마지막 지점 — 계정은 지우지 않고 가입한 지점 없음으로(아이 연결만 끊는다). 완전히 그만두는 건 보호자가 마이페이지 [회원 탈퇴]로
    if (!(await askConfirm(`"${m.nickname}" 회원을 ${centerLabel}에서 뺄까요?\n다른 지점 가입이 없어서 가입한 지점이 없는 회원이 돼요(계정은 남아요). ${centerLabel} 아이 명단과의 연결은 끊어요.\n(결제 기록은 아이 명단에 남아서, 다시 가입해 같은 아이와 이어지면 그대로 보여요)`))) return;
    try {
      const here = kidOf(m.userId);
      if (here) await linkChild(here.id, null);
      autoTried.current.add(`${m.userId}|${center}`);
      await clearMemberBranch(m.userId);
      loadKids(); load();
    }
    catch (e) { showAlert(`지우지 못했어요.\n${(e as Error).message}`); }
  };
  // 이 회원이 가입한 지점들 — 처음 지점(프로필) + 다른 지점 가입 기록. 승인 전이면 (대기)
  const branchesOf = (m: Member) => (['eunpyeong', 'uijeongbu'] as const)
    .map(c => ({ c, label: c === 'uijeongbu' ? '의정부' : '수색', at: c === (m.center ?? 'eunpyeong') ? m.approvedAt ?? null : extraCenters.get(`${m.userId}|${c}`) }))
    .filter(b => b.at !== undefined);

  // 카카오 로그인만 하고 가입 창(아이 이름·뒷번호)을 안 채운 계정은 숨긴다
  // 이 센터 보호자만 (가입할 때 고른 센터, 없으면 수색)
  //  + 다른 지점이 처음 지점인데 이 지점에도 가입 신청한 보호자(추가 지점)
  const isExtra = (m: Member) => (m.center ?? 'eunpyeong') !== center;
  const mine = members.filter(m => !isExtra(m) || extraCenters.has(`${m.userId}|${center}`));
  // 이 지점 승인 시각 — 처음 지점이면 프로필, 추가 지점이면 그 지점 신청 기록
  const approvedHere = (m: Member) => (isExtra(m) ? extraCenters.get(`${m.userId}|${center}`) ?? undefined : m.approvedAt);
  const waiting = mine.filter(m => !approvedHere(m) && m.nickname);
  const approved = mine.filter(m => approvedHere(m));
  const setApprovedHere = async (m: Member, approve: boolean) => {
    if (!isExtra(m)) return setApproved(m, approve);
    if (!approve && !(await askConfirm(`"${m.nickname}" 회원의 ${centerLabel} 가입 승인을 취소할까요?\n${centerLabel} 아이 명단과의 연결도 끊어요.`))) return;
    try {
      await setMemberCenterApproved(m.userId, center, approve);
      // 승인 취소 — 이 지점 아이와의 연결도 끊는다 (다른 지점 연결은 그대로)
      const here = kidOf(m.userId);
      if (!approve && here) { await linkChild(here.id, null); loadKids(); autoTried.current.add(`${m.userId}|${center}`); }
      // 추가 지점 승인 — 이 지점 명단의 같은 아이(이름·뒷번호)와도 잇는다 (지점마다 회원 코드가 따로라서)
      if (approve) { await saveApproveInput(m, await matchChild(m)); await sendApproved(m); }
      load();
    }
    catch (e) { showAlert(`저장하지 못했어요. 다시 시도해 주세요.\n${(e as Error).message ?? ''}`); load(); loadKids(); }
  };
  // 이미 승인된 회원인데 이 지점 아이와 아직 안 이어졌으면 — 이름·뒷번호가 같은 아이가 딱 하나일 때 저절로 잇는다
  // (수색에 먼저 등록되고 나중에 의정부를 신청한 아이 등). 한 번 시도한 회원은 다시 하지 않는다
  autoLink.current = () => {
    if (!kids.length || !members.length) return;
    const todo = approved.filter(m => !kidOf(m.userId) && !autoTried.current.has(`${m.userId}|${center}`));
    if (!todo.length) return;
    (async () => {
      let linked = 0;
      for (const m of todo) {
        autoTried.current.add(`${m.userId}|${center}`);
        const hits = sameKidsHere(m, kids);
        if (hits.length === 1 && !hits[0].guardianUserId) {
          try { await linkChild(hits[0].id, m.userId); linked++; } catch { /* 다음에 수동으로 */ }
        }
      }
      if (linked) loadKids();
    })();
  };
  // 승인할 수 있는지 — 이미 이 지점 아이와 이어졌거나, 이름·뒷번호가 같은 아이가 딱 하나("승인 가능")여야 한다
  const canLink = (m: Member) => !!kidOf(m.userId) || sameKidsHere(m, kids).length === 1;
  // 승인 못 하는 까닭들 — 비어 있으면 승인 가능
  const blockers = (m: Member): string[] => {
    const why: string[] = [];
    if (!canLink(m)) {
      const n = sameKidsHere(m, kids).length;
      why.push(!m.phoneLast4 ? '뒷번호가 없어요' : n ? `이름·뒷번호가 같은 아이가 ${n}명이에요 (한 명이어야 해요)` : '이름·뒷번호가 같은 아이가 명단에 없어요');
    }
    const empty = APPROVE_FIELDS.filter(f => inputOf(m, f.key) === '').map(f => f.label);
    if (empty.length) why.push(`${empty.join('·')}을(를) 안 적었어요 (없으면 0)`);
    return why;
  };
  const approveBadge = (m: Member) => {
    const why = blockers(m);
    return why.length
      ? <span className="inline-block mb-0.5 text-[11px] text-[#e11d48] border border-[#fecdd3] bg-[#fff1f2] rounded px-1.5 ">승인 불가</span>
      : <span className="inline-block mb-0.5 text-[11px] text-[#16a34a] border border-[#86efac] bg-[#f0fdf4] rounded px-1.5">승인 가능</span>;
  };
  // 미승인 회원이 지금 아이 명단에 있는지 — 이미 연결된 아이, 아니면 이 센터에서 이름(닉네임·관리자 닉네임, 앞뒤 숫자 포함)이나 가입할 때 적은 회원 코드가 같은 아이
  const rosterOf = (m: Member): Child[] => {
    const linked = kidOf(m.userId);
    if (linked) return [linked];
    const names = [m.nickname].map(x => x.trim()).filter(Boolean);
    const code = m.requestedCode?.trim().toUpperCase();
    return kids.filter(k => (k.center ?? 'eunpyeong') === center && (
      (!!code && k.memberCode === code) ||
      names.some(n => n === k.name || n === `${k.name}${k.number ?? ''}` || n === `${k.number ?? ''}${k.name}`)
    ));
  };
  const list = filter === 'waiting' ? waiting : approved;
  // 승인·미승인 목록은 접기 없이 늘 펼친다(카카오계정번호·회원 코드·가입일자·마지막 로그인)
  const datesOn = filter === 'waiting' || filter === 'approved';
  const btn = 'text-[12px] border px-2.5 py-1 transition-colors whitespace-nowrap';
  const input = `w-full min-w-[90px] border-b border-[var(--brand)] py-1 ${filter === 'waiting' ? 'text-[12px]' : 'text-[14px]'} outline-none bg-transparent`;
  const th = 'text-left font-normal text-[12px] text-[#999] px-3 py-3 whitespace-nowrap';
  const td = 'px-3 py-3 align-middle';

  return (
    <div className="px-5 md:px-8 pt-8 pb-14 md:pt-14 fade-up">
      {/* 폭 제한 없음 — PC에서 화면을 축소하면 표도 옆으로 넓어진다 */}
      <h1 className="display-heading mb-6">회원 관리 <span className="text-[0.7em] text-[#888]">({centerLabel})</span></h1>

      <div role="tablist" className="flex gap-1.5 mb-5">
        {([['approved', `승인 ${approved.length}`], ['waiting', `미승인 ${waiting.length}`], ['methods', '결제방식 관리'], ['payments', '결제내역'], ['children', `기존아이명단 ${kids.filter(k => (k.center ?? 'eunpyeong') === center).length}`]] as const).map(([key, label]) => (
          <button key={key} role="tab" aria-selected={filter === key} onClick={() => setFilter(key)}
            className={[
              'text-[13px] px-4 py-2 border transition-colors',
              filter === key ? 'border-[var(--brand)] bg-[var(--brand)] text-white' : 'border-[#e5e5e5] text-[#555] hover:bg-[#f8f8f8]',
            ].join(' ')}>
            {label}
          </button>
        ))}
      </div>

      {failed && <p className="text-[14px] text-red-400 py-6">회원 목록을 불러오지 못했어요. (DB 설정 SQL을 실행했는지 확인해 주세요)</p>}

      <datalist id="member-codes">
        {kids.filter(k => (k.center ?? 'eunpyeong') === center).map(k => <option key={k.id} value={k.memberCode}>{`${k.name}${k.number ?? ''}`}</option>)}
      </datalist>
      {filter === 'payments' ? (
        <PaymentsTab members={members} center={center} />
      ) : filter === 'children' ? (
        <ChildrenTab members={members} center={center} onLinked={loadKids} onMembersChanged={load} />
      ) : (<>
      {filter === 'methods' && (
        <p className="mb-2 text-[12px] text-[#888]">승인된 회원이 쓰는 결제방식이에요. 체크하면 바로 저장되고, 아이 명단의 쓰는 결제와 같은 값이에요.</p>
      )}
      {filter === 'waiting' && (
        <p className="mb-2 text-[12px] text-[#888]">아이 명단에 <b className="font-normal text-[#555]">아이 이름 · 휴대전화 뒷번호</b>가 같은 아이가 딱 한 명 등록돼 있고, <b className="font-normal text-[#555]">선결제(남은 횟수) · 우진학교 · 지원금(남은 금액)</b>을 모두 적으면(없으면 0) <span className="text-[#16a34a]">승인 가능</span>이에요. 승인하면 그 아이와 자동으로 이어져요.</p>
      )}
      <div className="overflow-x-auto border-t border-[#e5e5e5]">
        <table className={`w-full ${filter === 'waiting' ? 'text-[12px]' : 'text-[14px]'} text-[#333] border-collapse`}>
          <thead>
            <tr className="border-b border-[#e5e5e5]">
              {filter === 'approved' && <th className={th}>카카오계정번호</th>}
              {datesOn && filter !== 'waiting' && <th className={th}>회원 코드</th>}
              {datesOn && <th className={th}>{filter === 'waiting' ? '가입신청일자' : '가입일자'}</th>}
              {datesOn && filter !== 'waiting' && <th className={th}>마지막 로그인</th>}
              <th className={th}>이름</th>
              <th className={`${th} text-center`}>수색점</th>
              <th className={`${th} text-center`}>의정부점</th>
              <th className={th}>뒷번호</th>
              {filter !== 'waiting' && <th className={th}>전화번호</th>}
              {filter === 'waiting' && <th className={th}>아이 명단</th>}
              {filter === 'waiting' && APPROVE_FIELDS.map(f => <th key={f.key} className={`${th} text-center`} title={`승인하려면 꼭 적어야 해요 — 없으면 0`}>{f.label}<span className="block text-[10px] text-[#bbb]">{f.unit === '회' ? '남은 횟수' : '남은 금액(원)'}</span></th>)}
              {filter === 'methods' && SUPPORTS.map(x => <th key={x.key} className={`${th} text-center`}>{x.label}</th>)}
              {filter === 'methods' && <th className={`${th} text-center`}>선결제</th>}
              {SHOW_PREPAID && <th className={th}>선결제 <span className="text-[11px] text-[#bbb]">은평 | 의정부</span></th>}
              {filter === 'approved' && <th className={`${th} text-center whitespace-nowrap`}>선결제<span className="block text-[10px] text-[#bbb]">남은 횟수</span></th>}
              <th className={th}>설명</th>
              {filter !== 'methods' && <th className={th}><span className="sr-only">관리</span></th>}
            </tr>
          </thead>
          <tbody>
            {list.map(m => {
              const on = editing === m.userId && filter !== 'methods';
              return (
                <tr key={m.userId} className="border-b border-[#f0f0f0]">
                  {filter === 'approved' && <td className={`${td} text-[12px] text-[#999] whitespace-nowrap`} title={`카카오 회원번호 ${m.kakaoId}`}>{m.kakaoId || '-'}</td>}
                  {datesOn && filter !== 'waiting' && (<td className={`${td} whitespace-nowrap`}>
                    {on ? (
                      <input className={`${input} w-20 uppercase`} value={form.code} placeholder="W0001" list="member-codes"
                        onChange={e => setForm(f => ({ ...f, code: e.target.value }))} />
                    ) : kidOf(m.userId) ? (
                      <span className="text-[12px]"><span className="text-[#888] tabular-nums">{kidOf(m.userId)!.memberCode}</span> {kidOf(m.userId)!.name}{kidOf(m.userId)!.number ?? ''}</span>
                    ) : otherKidsOf(m.userId).length ? (
                      <button type="button" onClick={() => linkByName(m)} className="text-[12px] text-[#f59e0b] underline underline-offset-2 hover:text-[#b45309]"
                        title={`${centerLabel} 아이 명단과 아직 안 이어졌어요 — 눌러서 같은 이름 아이와 잇기`}>{centerLabel} 미연결 · 잇기</button>
                    ) : m.requestedCode ? <span className="text-[12px] text-[#f59e0b]" title="가입할 때 적은 회원 코드 — 아직 연결 안 됨">요청 {m.requestedCode}</span> : <span className="text-[#ccc]">-</span>}
                    {/* 다른 지점 회원 코드 — 두 지점을 다니면 지점마다 코드가 있다 */}
                    {!on && otherKidsOf(m.userId).map(k => (
                      <span key={k.id} className="block text-[11px] text-[#aaa] tabular-nums">{(k.center ?? 'eunpyeong') === 'uijeongbu' ? '의정부' : '수색'} {k.memberCode}</span>
                    ))}
                  </td>)}
                  {datesOn && <td className={`${td} whitespace-nowrap`}>{fmtDate(approvedHere(m) ?? (isExtra(m) ? requestedAt.get(`${m.userId}|${center}`) : undefined) ?? m.joinedAt)}</td>}
                  {datesOn && filter !== 'waiting' && <td className={`${td} whitespace-nowrap`}>{fmtDateTime(m.lastSignInAt)}</td>}
                  <td className={td}>
                    {on ? <input className={input} value={form.nickname} maxLength={20} onChange={e => setForm(f => ({ ...f, nickname: e.target.value }))} />
                      : <>{m.nickname || <span className="text-[#ccc]">아직 안 정함</span>}</>}
                  </td>
                  {/* 지점별 가입 — 승인(파랑) / 대기(노랑) / - */}
                  {(['eunpyeong', 'uijeongbu'] as const).map(c => {
                    const b = branchesOf(m).find(x => x.c === c);
                    return (
                      <td key={c} className={`${td} text-center text-[12px] whitespace-nowrap`}>
                        {!b ? <span className="text-[#ddd]">-</span> : b.at ? <span className="text-[var(--brand)]">승인</span> : <span className="text-[#a16207] bg-[#fefce8] px-1.5 rounded">대기</span>}
                      </td>
                    );
                  })}
                  <td className={`${td} whitespace-nowrap tabular-nums`}>
                    {on ? <input className={`${input} w-14 text-center`} value={form.phone} inputMode="numeric" maxLength={4} placeholder="1234"
                      onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 4) }))} />
                      : m.phoneLast4 ?? <span className="text-[#ccc]">-</span>}
                  </td>
                  {/* 카카오계정 전화번호 — 다음 로그인 때 채워진다 */}
                  {filter !== 'waiting' && (
                    <td className={`${td} whitespace-nowrap tabular-nums text-[13px]`} title="카카오계정 전화번호">{m.phone ?? <span className="text-[#ccc]">-</span>}</td>
                  )}
                  {filter === 'waiting' && (
                    <td className={`${td} whitespace-nowrap text-[12px]`}>
                      {(() => {
                        const hits = rosterOf(m);
                        if (!hits.length) return <>{approveBadge(m)}<div className="text-[#f59e0b]">현재 명단에 없음</div></>;
                        // 이름·뒷번호가 같은 아이가 딱 하나면 승인 가능(승인하면 자동 연결)
                        return <>{approveBadge(m)}{hits.map(k => (
                          <div key={k.id}>
                            <span className="text-[#888] tabular-nums">{k.memberCode ?? '코드 없음'}</span> {k.name}{k.number ?? ''}
                            {m.phoneLast4 && k.phoneLast4 && k.phoneLast4 !== m.phoneLast4 && <span className="ml-1 text-[#bbb]">(뒷번호 {k.phoneLast4})</span>}
                            {k.guardianUserId === m.userId ? <span className="ml-1 text-[var(--brand)]">연결됨</span>
                              : k.guardianUserId ? <span className="ml-1 text-[#bbb]">다른 계정 연결</span>
                              : <span className="ml-1 text-[#bbb]" title="이름이 같은 명단 아이 — 승인하면 이어져요">(연결 안 됨)</span>}
                          </div>
                        ))}</>;
                      })()}
                    </td>
                  )}
                  {filter === 'waiting' && APPROVE_FIELDS.map(f => {
                    const v = inputOf(m, f.key);
                    return (
                      <td key={f.key} className={`${td} text-center`}>
                        <input value={v && f.unit === '원' ? Number(v).toLocaleString('ko-KR') : v} inputMode="numeric" placeholder="필수" aria-label={`${m.nickname} ${f.label}`}
                          onChange={e => { const n = e.target.value.replace(/\D/g, '').slice(0, f.unit === '원' ? 9 : 4); setApproveInput(mp => new Map(mp).set(`${m.userId}|${f.key}`, n)); }}
                          className={`${f.unit === '원' ? 'w-20 text-right' : 'w-12 text-center'} text-[12px] tabular-nums border-b outline-none bg-transparent focus:border-[var(--brand)] ${v ? 'border-[#e5e5e5]' : 'border-[#f59e0b] placeholder:text-[#f59e0b]'}`} />
                      </td>
                    );
                  })}
                  {filter === 'methods' && SUPPORTS.map(x => (
                    <td key={x.key} className={`${td} text-center`}>
                      <input type="checkbox" checked={supportOf(m, x.key)} disabled={!m.nickname || (x.key === 'jangmatchum' && !kidOf(m.userId))} aria-label={`${m.nickname} ${x.label}`}
                        title={x.key === 'jangmatchum' && !kidOf(m.userId) ? '아이 명단과 연결된 뒤에 체크할 수 있어요' : undefined}
                        onChange={() => toggleSupport(m, x.key)} className="w-4 h-4 accent-[var(--brand)] cursor-pointer disabled:cursor-not-allowed" />
                    </td>
                  ))}
                  {filter === 'methods' && (
                    <td className={`${td} text-center`}>
                      {/* 선결제 — 아이 명단의 체크와 같은 칸(연결된 아이가 있어야 체크할 수 있다) */}
                      <input type="checkbox" checked={!!kidOf(m.userId)?.uses?.prepaid} disabled={!kidOf(m.userId)}
                        title={kidOf(m.userId) ? '선결제를 쓰는 아이' : '아이 명단과 연결된 뒤에 체크할 수 있어요'}
                        onChange={async e => {
                          const k = kidOf(m.userId);
                          if (!k) return;
                          const on = e.target.checked;
                          try {
                            await setChildUses(k.id, 'prepaid', on);
                            setKids(list => list.map(x => (x.id === k.id && x.uses ? { ...x, uses: { ...x.uses, prepaid: on } } : x)));
                          } catch { showAlert('저장하지 못했어요. 다시 시도해 주세요.'); }
                        }}
                        className="w-4 h-4 accent-[var(--brand)] cursor-pointer disabled:cursor-not-allowed disabled:opacity-30" />
                    </td>
                  )}
                  {/* 선결제 남은 횟수 — 이 지점 아이와 이어져 있어야. [수정]에서 고치면 선결제 카드에 [수정] 기록 */}
                  {filter === 'approved' && (
                    <td className={`${td} text-center tabular-nums whitespace-nowrap`}>
                      {!kidOf(m.userId) ? <span className="text-[#ddd]" title="아이 명단과 연결된 뒤에 적을 수 있어요">-</span>
                        : on ? (
                          <input value={form.prepaidLeft} inputMode="numeric" aria-label={`${m.nickname} 선결제 남은 횟수`}
                            onChange={e => setForm(f => ({ ...f, prepaidLeft: e.target.value.replace(/[^\d-]/g, '').slice(0, 5) }))}
                            className="w-14 border-b border-[var(--brand)] py-1 text-center outline-none" />
                        ) : (() => {
                          const left = prepaidLeftOf(kidOf(m.userId)!);
                          return <span className={left < 0 ? 'text-[#e11d48]' : left === 0 ? 'text-[#ccc]' : 'text-[#27272a]'}>{left}회</span>;
                        })()}
                    </td>
                  )}
                  {SHOW_PREPAID && (
                  <td className={`${td} whitespace-nowrap`}>
                    {on ? (
                      <span className="inline-flex items-center gap-1 text-[13px]">
                        <input type="number" min={0} inputMode="numeric" value={form.prepaidEunpyeong} aria-label="선결제 은평"
                          onChange={e => setForm(f => ({ ...f, prepaidEunpyeong: e.target.value }))}
                          className="w-14 border-b border-[var(--brand)] py-1 text-center outline-none" />
                        <span className="text-[#ccc]">|</span>
                        <input type="number" min={0} inputMode="numeric" value={form.prepaidUijeongbu} aria-label="선결제 의정부"
                          onChange={e => setForm(f => ({ ...f, prepaidUijeongbu: e.target.value }))}
                          className="w-14 border-b border-[var(--brand)] py-1 text-center outline-none" />
                      </span>
                    ) : (
                      <span className="tabular-nums">{m.prepaidEunpyeong}<span className="mx-1.5 text-[#ccc]">|</span>{m.prepaidUijeongbu}</span>
                    )}
                  </td>
                  )}
                  {/* 설명 — 맨 오른쪽(버튼 왼쪽) */}
                  <td className={`${td} min-w-[160px]`}>
                    {on ? <input className={input} value={form.memo} placeholder="메모" onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} />
                      : <>
                        <span className="text-[#666] whitespace-pre-line">{m.memo || ''}</span>
                        {/* 미승인 — 승인 못 하는 까닭(안 된 조건) */}
                        {filter === 'waiting' && blockers(m).map(w => <div key={w} className="text-[11px] text-[#e11d48]">· {w}</div>)}
                      </>}
                  </td>
                  {filter !== 'methods' && <td className={`${td} text-right`}>
                    <div className="flex justify-end gap-1">
                      {on ? (
                        <>
                          <button onClick={() => save(m)} className={`${btn} border-[var(--brand)] bg-[var(--brand)] text-white hover:opacity-90`}>저장</button>
                          <button onClick={() => setEditing(null)} className={`${btn} border-[#e5e5e5] hover:bg-[#f8f8f8]`}>취소</button>
                        </>
                      ) : (
                        <>
                          {m.nickname && (approvedHere(m)
                            ? <button onClick={() => setApprovedHere(m, false)} className={`${btn} border-[#e5e5e5] text-[#888] hover:bg-[#f8f8f8]`}>승인 취소</button>
                            : <button onClick={() => setApprovedHere(m, true)} disabled={blockers(m).length > 0}
                                className={`${btn} border-[var(--brand)] bg-[var(--brand)] text-white hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed`}>승인</button>)}
                          <button onClick={() => startEdit(m)} className={`${btn} border-[#e5e5e5] hover:bg-[#f8f8f8]`}>수정</button>
                          {m.nickname && <button onClick={() => remove(m)} className={`${btn} border-[#e5e5e5] text-red-400 hover:bg-red-50`}>삭제</button>}
                        </>
                      )}
                    </div>
                  </td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {loaded && !failed && list.length === 0 && (
        <p className="text-[14px] text-[#bbb] py-16 text-center">아직 없어요.</p>
      )}
      </>)}
    </div>
  );
}
