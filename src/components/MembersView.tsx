'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAdmin } from '@/components/AdminContext';
import { deleteProfile, getMemberCenters, getMembers, saveMemberProfile, setMemberCenterApproved } from '@/lib/store';
import type { Member, MemberExtras } from '@/lib/types';
import { askConfirm, askPrompt, showAlert } from '@/lib/dialog';
import ChildrenTab from '@/components/ChildrenTab';
import PaymentsTab from '@/components/PaymentsTab';
import type { Center, Child } from '@/lib/timetable';
import { childLabel, getChildren, linkChild, setChildUses } from '@/lib/timetable';

// 회원 관리 (관리자 전용) — 카카오로 로그인한 보호자 표.
// 보호자 닉네임은 보호자가 처음 입력한 것, 관리자 닉네임(center_nickname)·설명은 관리자가 정한다. 보호자 화면엔 늘 보호자 닉네임.
// "승인"을 누르면 승인일자가 찍힌다(같은 닉네임 회원이 있을 때만 관리자 닉네임을 정해야 한다). 승인/미승인 탭으로 나눠 본다(승인 탭의 '가입일자'는 승인한 날, 미승인 탭의 '가입신청일자'는 처음 로그인한 날).
// 메뉴에는 없고 관리자 모드 띠의 "회원 관리"로 들어온다.

type Filter = 'waiting' | 'approved' | 'children' | 'payments';

// 선결제 칸 — 지금은 가려 둔다(DB에는 칸이 있다). 다시 보이려면 true
const SHOW_PREPAID = false;

// 지원 항목 — 받는지 체크(O/X). 누르면 바로 저장된다
const SUPPORTS: { key: keyof Pick<MemberExtras, 'voucher' | 'gusen' | 'kkumideun' | 'woojin' | 'subsidy'>; label: string }[] = [
  { key: 'voucher', label: '바우처' },
  { key: 'gusen', label: '굳센' },
  { key: 'kkumideun', label: '꿈이든' },
  { key: 'woojin', label: '우진학교' },
  { key: 'subsidy', label: '지원금' },
];

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
  const [form, setForm] = useState({ nickname: '', centerNickname: '', memo: '', prepaidEunpyeong: '0', prepaidUijeongbu: '0', code: '', phone: '' });
  const [showDates, setShowDates] = useState(false);   // 카카오계정번호·회원 코드·가입일자·마지막 로그인은 접어 둔다
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const [kids, setKids] = useState<Child[]>([]);
  const loadKids = useCallback(() => { getChildren().then(setKids).catch(() => {}); }, []);
  useEffect(() => { if (isAdmin) loadKids(); }, [isAdmin, loadKids]);

  // 다른 지점 가입 신청 — "회원|지점" → 승인 시각(null = 대기)
  const [extraCenters, setExtraCenters] = useState<Map<string, string | null>>(new Map());
  const load = useCallback(() => {
    getMemberCenters().then(setExtraCenters).catch(() => setExtraCenters(new Map()));
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
    const names = new Set([m.nickname, m.centerNickname ?? '', ...others.flatMap(k => [k.name, `${k.name}${k.number ?? ''}`])].map(x => x.trim()).filter(Boolean));
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
  // 이 지점 명단에서 같은 아이 찾기 — 이름(보호자·관리자 닉네임, 다른 지점에 이어진 아이 이름)과 뒷번호 4자리가 둘 다 같고, 다른 계정에 안 이어진 아이
  const sameKidsHere = (m: Member, list: Child[], centerNickname = m.centerNickname ?? '') => {
    const others = list.filter(k => k.guardianUserId === m.userId && (k.center ?? 'eunpyeong') !== center);
    const names = [m.nickname, centerNickname, ...others.flatMap(k => [k.name, `${k.name}${k.number ?? ''}`])].map(x => x.trim()).filter(Boolean);
    const phones = [m.phoneLast4, ...others.map(k => k.phoneLast4)].filter((x): x is string => !!x);
    return list.filter(k => (k.center ?? 'eunpyeong') === center && (!k.guardianUserId || k.guardianUserId === m.userId)
      && !!k.phoneLast4 && phones.includes(k.phoneLast4)
      && names.some(n => n === k.name || n === `${k.name}${k.number ?? ''}` || n === `${k.number ?? ''}${k.name}`));
  };

  const startEdit = (m: Member) => {
    setEditing(m.userId);
    setForm({
      nickname: m.nickname, centerNickname: m.centerNickname ?? '', memo: m.memo ?? '',
      prepaidEunpyeong: String(m.prepaidEunpyeong), prepaidUijeongbu: String(m.prepaidUijeongbu),
      code: kidOf(m.userId)?.memberCode ?? '',
      phone: m.phoneLast4 ?? '',
    });
  };

  const save = async (m: Member) => {
    if (!form.nickname.trim()) { alert('보호자 닉네임을 입력해 주세요.'); return; }
    try {
      const r = await saveMemberProfile({
        userId: m.userId, nickname: form.nickname, centerNickname: form.centerNickname, memo: form.memo, approvedAt: m.approvedAt, phoneLast4: form.phone,
        prepaidEunpyeong: Number(form.prepaidEunpyeong) || 0, prepaidUijeongbu: Number(form.prepaidUijeongbu) || 0,
      });
      if (r === 'taken') { alert('이미 다른 회원이 쓰는 관리자 닉네임이에요.'); return; }
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
      setEditing(null);
      load();
    } catch { alert('저장하지 못했어요. 다시 시도해 주세요.'); }
  };

  // 지원 항목 체크 — 아이 명단과 연결된 계정은 아이의 "쓰는 결제" 체크와 같이 바뀐다(둘 중 어디서 바꿔도)
  const supportOf = (m: Member, key: (typeof SUPPORTS)[number]['key']) => {
    const k = kidOf(m.userId);
    return k?.uses ? k.uses[key] : m[key];
  };
  const toggleSupport = async (m: Member, key: (typeof SUPPORTS)[number]['key']) => {
    const on = !supportOf(m, key);
    try {
      await saveMemberProfile({ userId: m.userId, nickname: m.nickname, centerNickname: m.centerNickname, memo: m.memo, approvedAt: m.approvedAt, [key]: on });
      setMembers(ms => ms.map(x => (x.userId === m.userId ? { ...x, [key]: on } : x)));
      const k = kidOf(m.userId);
      if (k) {
        await setChildUses(k.id, key, on);
        setKids(list => list.map(x => (x.id === k.id && x.uses ? { ...x, uses: { ...x.uses, [key]: on } } : x)));
      }
    } catch { showAlert('저장하지 못했어요. 다시 시도해 주세요.'); }
  };

  // 승인할 때 아이 명단과 자동 연결 — 이름(보호자 닉네임 또는 관리자 닉네임, 앞 숫자 포함 가능)과 뒷번호 4자리가 둘 다 같은 아이가 딱 하나면 잇는다
  const matchChild = async (m: Member, centerNickname: string): Promise<Child | undefined> => {
    if (kidOf(m.userId)) return kidOf(m.userId);   // 이미 연결됨
    // 화면을 연 뒤에 명단(뒷번호 등)이 바뀌었을 수 있으니 새로 읽어서 맞춘다
    const fresh = await getChildren().catch(() => kids);
    const already = fresh.find(k => k.guardianUserId === m.userId && (k.center ?? 'eunpyeong') === center);
    if (already) { setKids(fresh); return already; }
    if (!m.phoneLast4 && !fresh.some(k => k.guardianUserId === m.userId && k.phoneLast4)) { await showAlert('승인했어요.\n뒷번호가 없어서 아이 명단과는 연결하지 않았어요.'); return; }
    const hits = sameKidsHere(m, fresh, centerNickname);
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

  // 승인 — 승인 버튼만 누르면 된다. 다만 같은 닉네임을 쓰는 다른 회원이 있으면 관리자 닉네임을 정해야 승인된다
  const setApproved = async (m: Member, approve: boolean) => {
    let centerNickname = m.centerNickname ?? '';
    if (approve) {
      const same = (name: string) => members.some(o => o.userId !== m.userId && (o.nickname.trim() === name.trim() || (o.centerNickname ?? '').trim() === name.trim()));
      if (!centerNickname && same(m.nickname)) {
        while (true) {
          const input = await askPrompt(`"${m.nickname}" 닉네임을 쓰는 회원이 이미 있어요.\n구분할 관리자 닉네임을 정해야 승인돼요.`, '');
          if (input === null) return;
          const v = input.trim();
          if (!v) continue;
          if (same(v)) { await showAlert(`"${v}"도 이미 쓰고 있어요. 다른 이름으로 정해 주세요.`); continue; }
          centerNickname = v;
          break;
        }
      }
    } else if (!(await askConfirm(`"${m.nickname}" 회원의 승인을 취소할까요?\n${centerLabel} 아이 명단과의 연결도 끊어요.`))) {
      return;
    }
    const approvedAt = approve ? new Date().toISOString() : undefined;
    try {
      const r = await saveMemberProfile({
        userId: m.userId,
        nickname: m.nickname,
        centerNickname,
        memo: m.memo,
        approvedAt: approvedAt,
      });
      if (r === 'taken') { await showAlert('이미 다른 회원이 쓰는 관리자 닉네임이에요.'); return; }
      // 승인 취소 — 이 지점 아이와의 연결도 끊는다 (다른 지점 연결은 그대로)
      const here = kidOf(m.userId);
      if (!approve && here) { await linkChild(here.id, null); loadKids(); autoTried.current.add(`${m.userId}|${center}`); }
      if (approve) {
        // 아이 명단과 이어지면 관리자 닉네임 = 아이 이름+숫자 (예: 김채현3)
        const k = await matchChild(m, centerNickname);
        if (k && childLabel(k) !== centerNickname) {
          const r2 = await saveMemberProfile({ userId: m.userId, nickname: m.nickname, centerNickname: childLabel(k), memo: m.memo, approvedAt });
          if (r2 === 'taken') await showAlert(`관리자 닉네임 "${childLabel(k)}"을 이미 다른 회원이 쓰고 있어서 바꾸지 않았어요.`);
        }
      }
      load();
    } catch { showAlert('저장하지 못했어요. 다시 시도해 주세요.'); }
  };

  const remove = async (m: Member) => {
    if (!confirm(`"${m.nickname}" 회원의 닉네임·설명을 지울까요?\n다음에 로그인하면 보호자 닉네임을 다시 정하게 돼요.`)) return;
    try { await deleteProfile(m.userId); load(); }
    catch { alert('지우지 못했어요. 다시 시도해 주세요.'); }
  };

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
      if (approve) await matchChild(m, m.centerNickname ?? '');
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
  // 미승인 회원이 지금 아이 명단에 있는지 — 이미 연결된 아이, 아니면 이 센터에서 이름(닉네임·관리자 닉네임, 앞뒤 숫자 포함)이나 가입할 때 적은 회원 코드가 같은 아이
  const rosterOf = (m: Member): Child[] => {
    const linked = kidOf(m.userId);
    if (linked) return [linked];
    const names = [m.nickname, m.centerNickname ?? ''].map(x => x.trim()).filter(Boolean);
    const code = m.requestedCode?.trim().toUpperCase();
    return kids.filter(k => (k.center ?? 'eunpyeong') === center && (
      (!!code && k.memberCode === code) ||
      names.some(n => n === k.name || n === `${k.name}${k.number ?? ''}` || n === `${k.number ?? ''}${k.name}`)
    ));
  };
  const list = filter === 'waiting' ? waiting : approved;
  const btn = 'text-[12px] border px-2.5 py-1 transition-colors whitespace-nowrap';
  const input = 'w-full min-w-[90px] border-b border-[var(--brand)] py-1 text-[14px] outline-none bg-transparent';
  const th = 'text-left font-normal text-[12px] text-[#999] px-3 py-3 whitespace-nowrap';
  const td = 'px-3 py-3 align-middle';

  return (
    <div className="max-w-[1400px] mx-auto px-5 md:px-8 pt-8 pb-14 md:pt-14 fade-up">
      <h1 className="display-heading mb-3">회원 관리 <span className="text-[0.7em] text-[#888]">({centerLabel})</span></h1>
      <p className="text-[14px] text-[#666] leading-[2] mb-8">
        카카오로 로그인한 보호자예요. 승인한 회원만 수업 신청 등을 할 수 있어요.
      </p>

      <div role="tablist" className="flex gap-1.5 mb-5">
        {([['approved', `승인 ${approved.length}`], ['waiting', `미승인 ${waiting.length}`], ['children', `아이 명단 ${kids.filter(k => (k.center ?? 'eunpyeong') === center).length}`], ['payments', '결제내역']] as const).map(([key, label]) => (
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
      <div className="overflow-x-auto border-t border-[#e5e5e5]">
        <table className="w-full text-[14px] text-[#333] border-collapse">
          <thead>
            <tr className="border-b border-[#e5e5e5]">
              <th className={`${th} w-8 pr-0`}>
                <button type="button" onClick={() => setShowDates(v => !v)}
                  aria-label={showDates ? '카카오계정번호·회원 코드·가입일자·마지막 로그인 접기' : '카카오계정번호·회원 코드·가입일자·마지막 로그인 펼치기'} aria-expanded={showDates}
                  title={showDates ? '접기' : '카카오계정번호·회원 코드·가입일자·마지막 로그인 펼치기'}
                  className="w-5 h-5 inline-flex items-center justify-center rounded border border-[#ddd] text-[#888] hover:border-[var(--brand)] hover:text-[var(--brand)]">
                  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className={`transition-transform ${showDates ? 'rotate-180' : ''}`}>
                    <path d="M3.5 1.5 7 5l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </th>
              {showDates && <th className={th}>카카오계정번호</th>}
              {showDates && <th className={th}>회원 코드</th>}
              {showDates && <th className={th}>{filter === 'waiting' ? '가입신청일자' : '가입일자'}</th>}
              {showDates && filter !== 'waiting' && <th className={th}>마지막 로그인</th>}
              <th className={th}>보호자 닉네임</th>
              <th className={th}>관리자 닉네임</th>
              <th className={th}>뒷번호</th>
              <th className={th}>설명</th>
              {filter === 'waiting' && <th className={th}>아이 명단</th>}
              {filter !== 'waiting' && SUPPORTS.map(x => <th key={x.key} className={`${th} text-center`}>{x.label}</th>)}
              {filter !== 'waiting' && <th className={`${th} text-center`}>선결제</th>}
              {SHOW_PREPAID && <th className={th}>선결제 <span className="text-[11px] text-[#bbb]">은평 | 의정부</span></th>}
              <th className={th}><span className="sr-only">관리</span></th>
            </tr>
          </thead>
          <tbody>
            {list.map(m => {
              const on = editing === m.userId;
              return (
                <tr key={m.userId} className="border-b border-[#f0f0f0]">
                  <td className={`${td} w-8 pr-0`} />
                  {showDates && <td className={`${td} text-[12px] text-[#999] whitespace-nowrap`} title={`카카오 회원번호 ${m.kakaoId}`}>{m.kakaoId || '-'}</td>}
                  {showDates && (<td className={`${td} whitespace-nowrap`}>
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
                  {showDates && <td className={`${td} whitespace-nowrap`}>{fmtDate(approvedHere(m) ?? m.joinedAt)}</td>}
                  {showDates && filter !== 'waiting' && <td className={`${td} whitespace-nowrap`}>{fmtDateTime(m.lastSignInAt)}</td>}
                  <td className={td}>
                    {on ? <input className={input} value={form.nickname} maxLength={20} onChange={e => setForm(f => ({ ...f, nickname: e.target.value }))} />
                      : <>{m.nickname || <span className="text-[#ccc]">아직 안 정함</span>}
                        {isExtra(m) && <span className="ml-1.5 text-[10px] text-[#b45309] border border-[#fcd34d] rounded px-1" title={`처음 가입한 지점은 ${(m.center ?? 'eunpyeong') === 'uijeongbu' ? '의정부' : '수색'}`}>추가 지점</span>}</>}
                  </td>
                  <td className={td}>
                    {on ? <input className={input} value={form.centerNickname} maxLength={20} placeholder="예: 김민준" onChange={e => setForm(f => ({ ...f, centerNickname: e.target.value }))} />
                      : m.centerNickname ? <span className="text-[var(--brand)]">{m.centerNickname}</span> : <span className="text-[#ccc]">-</span>}
                  </td>
                  <td className={`${td} whitespace-nowrap tabular-nums`}>
                    {on ? <input className={`${input} w-14 text-center`} value={form.phone} inputMode="numeric" maxLength={4} placeholder="1234"
                      onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 4) }))} />
                      : m.phoneLast4 ?? <span className="text-[#ccc]">-</span>}
                  </td>
                  <td className={`${td} min-w-[160px]`}>
                    {on ? <input className={input} value={form.memo} placeholder="메모" onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} />
                      : <span className="text-[#666] whitespace-pre-line">{m.memo || ''}</span>}
                  </td>
                  {filter === 'waiting' && (
                    <td className={`${td} whitespace-nowrap text-[12px]`}>
                      {(() => {
                        const hits = rosterOf(m);
                        if (!hits.length) return <span className="text-[#f59e0b]">현재 명단에 없음</span>;
                        return hits.map(k => (
                          <div key={k.id}>
                            <span className="text-[#888] tabular-nums">{k.memberCode ?? '코드 없음'}</span> {k.name}{k.number ?? ''}
                            {m.phoneLast4 && k.phoneLast4 && k.phoneLast4 !== m.phoneLast4 && <span className="ml-1 text-[#bbb]">(뒷번호 {k.phoneLast4})</span>}
                            {k.guardianUserId === m.userId ? <>
                              <span className="ml-1 text-[var(--brand)]">연결됨</span>
                              {/* 승인 전인데 이어져 있으면 끊을 수 있게 (가입할 때 회원 코드로 이었거나, 승인 취소 전에 이어진 것) */}
                              <button type="button" className="ml-1 text-[11px] text-[#aaa] underline underline-offset-2 hover:text-red-400"
                                onClick={async () => {
                                  if (!(await askConfirm(`${centerLabel} ${k.memberCode} ${k.name}${k.number ?? ''}와(과)의 연결을 끊을까요?`))) return;
                                  try { await linkChild(k.id, null); autoTried.current.add(`${m.userId}|${center}`); loadKids(); }
                                  catch (e) { showAlert(`끊지 못했어요.\n${(e as Error).message}`); }
                                }}>끊기</button>
                            </>
                              : k.guardianUserId ? <span className="ml-1 text-[#bbb]">다른 계정 연결</span>
                              : <span className="ml-1 text-[#bbb]" title="이름이 같은 명단 아이 — 승인하면 이어져요">(연결 안 됨)</span>}
                          </div>
                        ));
                      })()}
                    </td>
                  )}
                  {filter !== 'waiting' && SUPPORTS.map(x => (
                    <td key={x.key} className={`${td} text-center`}>
                      <input type="checkbox" checked={supportOf(m, x.key)} disabled={!m.nickname} aria-label={`${m.centerNickname || m.nickname} ${x.label}`}
                        onChange={() => toggleSupport(m, x.key)} className="w-4 h-4 accent-[var(--brand)] cursor-pointer disabled:cursor-not-allowed" />
                    </td>
                  ))}
                  {filter !== 'waiting' && (
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
                  <td className={`${td} text-right`}>
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
                            : <button onClick={() => setApprovedHere(m, true)} className={`${btn} border-[var(--brand)] bg-[var(--brand)] text-white hover:opacity-90`}>승인</button>)}
                          <button onClick={() => startEdit(m)} className={`${btn} border-[#e5e5e5] hover:bg-[#f8f8f8]`}>수정</button>
                          {m.nickname && <button onClick={() => remove(m)} className={`${btn} border-[#e5e5e5] text-red-400 hover:bg-red-50`}>삭제</button>}
                        </>
                      )}
                    </div>
                  </td>
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
