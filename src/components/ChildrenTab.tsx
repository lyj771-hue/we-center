'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { askConfirm, showAlert } from '@/lib/dialog';
import type { Center, Child } from '@/lib/timetable';
import { balanceOf, type BalanceKey, deleteChild, getChildren, getFixedByChild, getPaymentCounts, linkChild, methodInCenter, saveChild, setChildUses, setChildBalance, type UsesKey, type LessonKind, kindLabel } from '@/lib/timetable';
import type { Member } from '@/lib/types';
import { saveMemberProfile } from '@/lib/store';
import { downloadCsv, downloadXlsx, type Sheet } from '@/lib/exportFile';
import { addCharge } from '@/lib/prepaid';

// 회원 관리 — "아이 명단" 탭. 센터에 다니는 아이마다 회원 코드(W0001 …)가 있고,
// 카카오로 가입한 보호자 계정과 1:1로 잇는다(보호자 계정 하나 = 아이 한 명). 고정 수업은 시간표 관리에서 고친다.

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
// 고정 자리 결제 글자 → 이름 (표에는 영어 글자 대신 이름으로)
const PAY_LABEL: Record<string, string> = { b: '바우처', e: '굳센', 장: '장맞춤', c: '꿈이든', 외: '우진학교외부', 자: '우진학교자율', 선: '선결제', 카: '신용카드', 현: '현금' };

type Fixed = { weekday: number; time: string; teacher: string; payment: string; oral: boolean; kind: LessonKind };
const emptyForm = { center: 'eunpyeong' as Center, name: '', number: '', memo: '', guardian: '', phone: '',   // phone = 한 줄에 "번호 관계"
  vl: '0', gl: '0', kl: '0', pt: '0' };

// 결제 칸 — 쓰는 결제 체크(바우처·굳센/장맞춤·꿈이든·우진학교외부·우진학교자율·지원금·선결제), 선결제 남은 횟수, 우진학교외부·자율·지원금 남은 금액.
// 우진학교외부·자율 남은 금액은 [결제 완료]로 확정될 때마다 6만원씩 저절로 빠진다(supabase/woojin-split.sql).
// 선결제 남은 횟수를 고치면 지금 잔여와의 차이를 선결제 카드에 [수정] 기록으로 남긴다(충전 내역은 결제내역 탭에서)
// 굳센은 수색, 장맞춤은 의정부에서만 보인다
const ALL_USES: { key: UsesKey; label: string }[] = [
  { key: 'voucher', label: '바우처' }, { key: 'gusen', label: '굳센' }, { key: 'jangmatchum', label: '장맞춤' }, { key: 'kkumideun', label: '꿈이든' },
  { key: 'woojin_ext', label: '우진학교외부' }, { key: 'woojin_self', label: '우진학교자율' }, { key: 'subsidy', label: '지원금' }, { key: 'prepaid', label: '선결제' },
];
type ProfileKey = 'voucher' | 'gusen' | 'kkumideun' | 'woojin' | 'subsidy';
// 우진학교외부·자율·지원금 — 횟수가 아니라 남은 금액(원)을 적는다
const BALANCES: { key: BalanceKey; label: string }[] = [{ key: 'woojin_ext', label: '우진학교외부' }, { key: 'woojin_self', label: '우진학교자율' }, { key: 'subsidy', label: '지원금' }];
// 회원 관리(승인 탭)의 지원 항목과 같은 것 — 둘 중 어디서 체크해도 양쪽이 같이 바뀐다
// 장맞춤·우진학교외부·자율은 보호자 계정 칸이 없어 아이 명단에만 둔다
const PROFILE_KEYS: ProfileKey[] = ['voucher', 'gusen', 'kkumideun', 'subsidy'];

/** 전화번호 숫자 → 010-1234-5678 */
const fmtPhone = (p: string) => (p.length === 11 ? `${p.slice(0, 3)}-${p.slice(3, 7)}-${p.slice(7)}` : p.length === 10 ? `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}` : p);
/** 수정 칸 글 — 한 줄에 "010-1234-5678 맘" (전체 번호가 없으면 빈칸) */
const phonesText = (k: Child) => (k.phones?.length ? k.phones.map((p, i) => `${fmtPhone(p)} ${k.phoneRelations?.[i] ?? ''}`.trim()).join('\n') : '');
/** 수정 칸 글 → 번호들·관계들. 4자리만 적으면 예전처럼 뒷번호 */
const parsePhones = (text: string): { phones?: string[]; phoneRelations?: string[]; phoneLast4?: string } => {
  const lines = text.split(/[\n,]/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 1 && /^\d{4}$/.test(lines[0])) return { phones: [], phoneLast4: lines[0] };
  const items = lines.map(l => { const m = l.match(/^([\d\s-]+)(.*)$/); const d = (m?.[1] ?? '').replace(/\D/g, ''); return { d, rel: (m?.[2] ?? '').trim() }; }).filter(x => x.d.length >= 10);
  return { phones: items.map(x => x.d), phoneRelations: items.map(x => x.rel) };
};

export default function ChildrenTab({ members, center, onLinked, onMembersChanged }: { members: Member[]; center: Center; onLinked: () => void; onMembersChanged: () => void }) {
  const [kids, setKids] = useState<Child[]>([]);
  const [fixed, setFixed] = useState<Map<string, Fixed[]>>(new Map());
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<string | null>(null);   // 아이 id, 'new' = 새 아이
  const [form, setForm] = useState(emptyForm);
  const [failed, setFailed] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  // 선결제 쓴 횟수(확정된 것, 처음부터) — 아이 id → 횟수
  const [prepaidUsed, setPrepaidUsed] = useState<Map<string, number>>(new Map());
  const USES = ALL_USES.filter(u => methodInCenter(u.key, center));

  const load = useCallback(async () => {
    try {
      const [k, f, c] = await Promise.all([getChildren(), getFixedByChild(), getPaymentCounts('2000-01-01', '2999-12-31').catch(() => new Map())]);
      k.sort((a, b) => (a.memberCode ?? '').localeCompare(b.memberCode ?? ''));
      setKids(k);
      setFixed(f);
      setPrepaidUsed(new Map([...c].map(([id, v]) => [id, (v as { prepaid?: number }).prepaid ?? 0])));
      setFailed('');
    } catch (e) {
      setFailed((e as Error).message);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const memberOf = useMemo(() => new Map(members.map(m => [m.userId, m])), [members]);
  const balOf = balanceOf;
  const saveBalance = async (k: Child, key: BalanceKey, text: string) => {
    const won = Number(text.replace(/[^\d]/g, '')) || 0;
    if (won === balOf(k, key)) return;
    setKids(list => list.map(x => (x.id === k.id ? { ...x, [key === 'woojin_ext' ? 'woojinExtBalance' : key === 'woojin_self' ? 'woojinSelfBalance' : 'subsidyBalance']: won } : x)));
    try { await setChildBalance(k.id, key, won); }
    catch (e) { showAlert(`저장하지 못했어요 — SQL(supabase/payment-balance.sql)을 실행했는지 확인해 주세요.\n${(e as Error).message}`); load(); }
  };
  // 선결제 남은 횟수 = 충전 합 − 쓴 횟수
  const prepaidLeftOf = (k: Child) => (k.prepaidTotal ?? 0) - (prepaidUsed.get(k.id) ?? 0);
  const savePrepaidLeft = async (k: Child, text: string) => {
    const t = text.trim();
    if (!/^-?\d+$/.test(t)) return;
    try {
      const used = (await getPaymentCounts('2000-01-01', '2999-12-31')).get(k.id)?.prepaid ?? 0;
      const fresh = (await getChildren()).find(x => x.id === k.id) ?? k;
      const diff = Number(t) - ((fresh.prepaidTotal ?? 0) - used);
      if (!diff) return;
      const d = new Date();
      await addCharge(k.id, `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, diff, '아이 명단에서 남은 횟수 수정', true);
      load(); onLinked();
    } catch (e) { showAlert(`선결제 남은 횟수를 저장하지 못했어요.\n${(e as Error).message}`); load(); }
  };
  const toggleUses = async (k: Child, key: UsesKey, on: boolean) => {
    setKids(list => list.map(x => (x.id === k.id ? { ...x, uses: { ...(x.uses ?? { voucher: false, gusen: false, jangmatchum: false, kkumideun: false, woojin: false, woojin_ext: false, woojin_self: false, subsidy: false, prepaid: false }), [key]: on } } : x)));
    try {
      await setChildUses(k.id, key, on);
      // 연결된 보호자 계정의 지원 항목도 같이
      const g = k.guardianUserId ? memberOf.get(k.guardianUserId) : undefined;
      if (g && (PROFILE_KEYS as UsesKey[]).includes(key) && g[key as ProfileKey] !== on) {
        await saveMemberProfile({ userId: g.userId, nickname: g.nickname, memo: g.memo, approvedAt: g.approvedAt, [key]: on });
        onMembersChanged();
      }
      onLinked();   // 회원 관리 화면이 들고 있는 아이 명단도 새로 — 승인 탭 체크가 이걸 보여 준다
    }
    catch (e) { showAlert(`저장하지 못했어요 — SQL(supabase/child-payment-flags.sql)을 실행했는지 확인해 주세요.\n${(e as Error).message}`); load(); }
  };
  // 승인 여부 — 연결된 보호자 계정이 없으면 미가입
  const approvalOf = (k: Child) => !k.guardianUserId ? '미가입' : memberOf.get(k.guardianUserId)?.approvedAt ? '승인' : '미승인';

  // 내려받기 — 지금 화면의 명단(찾기 적용) 그대로
  const exportSheet = (): Sheet => {
    const head = ['회원 코드', '이름', '번호', '전화번호(관계)', '승인 여부', ...USES.map(u => u.label), '선결제 남은 횟수', '우진학교외부 남은 금액', '우진학교자율 남은 금액', '지원금 남은 금액', '고정 수업', '메모'];
    const rows = list.map(k => {
      const ck = (key: UsesKey) => (k.uses?.[key] ? 'O' : '');
      return [
        k.memberCode ?? '', k.name, k.number ?? 1, phonesText(k).replace(/\n/g, ', '), approvalOf(k),
        ...USES.map(u => ck(u.key)),
        prepaidLeftOf(k), balOf(k, 'woojin_ext'), balOf(k, 'woojin_self'), balOf(k, 'subsidy'),
        (fixed.get(k.id) ?? []).map(f => `${DOW[f.weekday]} ${f.time} ${f.teacher}${PAY_LABEL[f.payment.replace(/x/gi, '').charAt(0)] ? ` ${PAY_LABEL[f.payment.replace(/x/gi, '').charAt(0)]}` : ''}`).join(', '),
        k.memo ?? '',
      ];
    });
    return { name: '아이 명단', rows: [head, ...rows], cols: [9, 10, 5, 7, 8, ...USES.map(() => 7), 12, 14, 14, 12, 40, 20] };
  };
  const stamp = () => { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; };
  // 정렬 — 머리글을 누르면 오름차순 → 내림차순 → 원래대로(회원 코드 순)
  const sortVal = (k: Child, key: string): string | number => {
    if (key === 'name') return `${k.name}${String(k.number ?? 1).padStart(3, '0')}`;
    if (key.startsWith('uses:')) return k.uses?.[key.slice(5) as UsesKey] ? 1 : 0;
    if (key === 'prepaidLeft') return prepaidLeftOf(k);
    if (key.startsWith('bal:')) return balOf(k, key.slice(4) as BalanceKey);
    return k.memberCode ?? '';
  };
  // 이 센터 아이만
  const filtered = kids.filter(k => (k.center ?? 'eunpyeong') === center).filter(k => !q.trim() || `${k.memberCode} ${k.name}${k.number ?? ''}`.includes(q.trim()));
  const list = sort ? [...filtered].sort((a, b) => {
    const x = sortVal(a, sort.key), y = sortVal(b, sort.key);
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'ko');
    return (sort.dir === 'asc' ? c : -c) || (a.memberCode ?? '').localeCompare(b.memberCode ?? '');
  }) : filtered;
  const sortBy = (key: string) => setSort(cur => (!cur || cur.key !== key ? { key, dir: 'asc' } : cur.dir === 'asc' ? { key, dir: 'desc' } : null));
  const arrow = (key: string) => <span className={`ml-0.5 text-[9px] ${sort?.key === key ? 'text-[var(--brand)]' : 'text-[#ddd]'}`}>{sort?.key === key ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>;
  const sortTh = 'cursor-pointer select-none hover:text-[#555]';

  const start = (k?: Child) => {
    setEditing(k ? k.id : 'new');
    setForm(k ? { center: k.center ?? 'eunpyeong', name: k.name, number: k.number?.toString() ?? '', memo: k.memo ?? '', guardian: k.guardianUserId ?? '', phone: phonesText(k),
      vl: String(k.voucherLimit ?? 0), gl: String(k.gusenLimit ?? 0), kl: String(k.kkumideunLimit ?? 0), pt: String(k.prepaidTotal ?? 0) } : { ...emptyForm, center });   // 새 아이는 이 센터로
  };

  const save = async (k?: Child) => {
    if (!form.name.trim()) { showAlert('이름을 적어 주세요.'); return; }
    try {
      // 번호 빈칸 = 번호 없음(1로 보임, 시간표엔 숫자가 안 붙는다)
      await saveChild({ id: k?.id, center: form.center, name: form.name, number: form.number ? Number(form.number) : undefined, oral: k?.oral, memo: form.memo, ...parsePhones(form.phone),
        voucherLimit: Number(form.vl) || 0, gusenLimit: Number(form.gl) || 0, kkumideunLimit: Number(form.kl) || 0 });   // 선결제는 [충전] 기록으로만
      if (k && form.guardian !== (k.guardianUserId ?? '')) {
        await linkChild(k.id, form.guardian || null);
        onLinked();
      }
      setEditing(null);
      load();
    } catch (e) {
      showAlert(`저장하지 못했어요.\n${(e as Error).message}`);
    }
  };

  const remove = async (k: Child) => {
    if (!(await askConfirm(`${k.memberCode} ${k.name}${k.number ?? ''}을(를) 명단에서 지울까요?\n고정 수업 칸의 이름은 남고, 명단 연결만 끊겨요.`))) return;
    try { await deleteChild(k.id); load(); } catch { showAlert('지우지 못했어요.'); }
  };

  const input = 'border-b border-[var(--brand)] py-1 text-[14px] outline-none bg-transparent';
  const th = 'text-left font-normal text-[12px] text-[#999] px-3 py-3 whitespace-nowrap';
  const td = 'px-3 py-2.5 align-middle';
  const btn = 'text-[12px] border px-2.5 py-1 transition-colors whitespace-nowrap';
  const approved = members.filter(m => m.nickname);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="이름·회원 코드 찾기"
          className="border border-[#e5e5e5] px-3 py-1.5 text-[13px] w-56 outline-none focus:border-[var(--brand)]" />
        <span className="text-[12px] text-[#aaa]">{list.length}명</span>
        <button onClick={() => downloadXlsx([exportSheet()], `아이명단_${stamp()}`).catch(e => showAlert(`내려받지 못했어요.\n${(e as Error).message}`))}
          className={`${btn} ml-auto border-[#16a34a] text-[#16a34a] hover:bg-[#f0fdf4]`} title="엑셀 파일(.xlsx) — 맥 Numbers 에서도 열려요">엑셀 다운로드</button>
        <button onClick={() => downloadCsv([exportSheet()], `아이명단_${stamp()}`)}
          className={`${btn} border-[#ddd] text-[#555] hover:bg-[#f8f8f8]`} title="CSV 파일 — 어떤 프로그램에서도 열려요">CSV 다운로드</button>
        <button onClick={() => start()} className={`${btn} border-[#0a0a0a] hover:bg-[#0a0a0a] hover:text-white`}>+ 아이 추가</button>
      </div>
      {failed && <p className="text-[13px] text-red-400 mb-3">불러오지 못했어요 — 회원 코드 SQL(supabase/children-code.sql)을 실행했는지 확인해 주세요. ({failed})</p>}

      <div className="overflow-x-auto border-t border-[#e5e5e5]">
        <table className="w-full text-[14px] text-[#333] border-collapse">
          <thead>
            <tr className="border-b border-[#e5e5e5]">
              <th className={th}>카카오계정번호</th>
              <th className={th}>회원 코드</th>
              <th className={`${th} ${sortTh}`} onClick={() => sortBy('name')} title="이름순 정렬">이름{arrow('name')}</th>
              <th className={`${th} text-center`} title="같은 이름 구분 번호 — 없으면 1">번호</th>
              <th className={th}>전화번호</th>
              <th className={th}>관계</th>
              {USES.map(c => <th key={c.key} className={`${th} text-center ${sortTh}`} onClick={() => sortBy(`uses:${c.key}`)} title={`${c.label}를 쓰는 아이면 체크 · 눌러서 정렬`}>{c.label}{arrow(`uses:${c.key}`)}</th>)}
              <th className={`${th} text-center ${sortTh}`} onClick={() => sortBy('prepaidLeft')} title="선결제 남은 횟수 — 고치면 선결제 카드에 [수정] 기록 · 눌러서 정렬">선결제{arrow('prepaidLeft')}<span className="block text-[10px] text-[#bbb]">남은 횟수</span></th>
              {BALANCES.map(b => <th key={b.key} className={`${th} text-center ${sortTh}`} onClick={() => sortBy(`bal:${b.key}`)} title={`${b.label} 남은 금액 — 직접 적어요(원)`}>{b.label}{arrow(`bal:${b.key}`)}<span className="block text-[10px] text-[#bbb]">남은 금액(원)</span></th>)}
              <th className={th}>고정 수업</th>
              <th className={th}>승인 여부</th>
              <th className={th}>메모</th>
              <th className={`${th} sticky right-0 bg-white`}><span className="sr-only">관리</span></th>
            </tr>
          </thead>
          <tbody>
            {editing === 'new' && (
              <EditRow form={form} setForm={setForm} input={input} td={td} btn={btn} approved={approved} usesCount={USES.length} code="새 코드" fixed={[]}
                onSave={() => save()} onCancel={() => setEditing(null)} />
            )}
            {list.map(k => editing === k.id ? (
              <EditRow key={k.id} form={form} setForm={setForm} input={input} td={td} btn={btn} approved={approved} usesCount={USES.length} code={k.memberCode ?? ''} fixed={fixed.get(k.id) ?? []}
                onSave={() => save(k)} onCancel={() => setEditing(null)} />
            ) : (
              <tr key={k.id} className="border-b border-[#f0f0f0]">
                <td className={`${td} text-[12px] text-[#999] whitespace-nowrap tabular-nums`}>{k.guardianUserId ? memberOf.get(k.guardianUserId)?.kakaoId || '-' : <span className="text-[#ddd]">-</span>}</td>
                <td className={`${td} text-[12px] text-[#888] whitespace-nowrap tabular-nums`}>{k.memberCode}</td>
                <td className={`${td} whitespace-nowrap`}>{k.name}</td>
                {/* 같은 이름 구분 번호 — 비어 있으면 1 (시간표에는 번호가 있는 아이만 이름 앞에 붙는다) */}
                <td className={`${td} text-center text-[13px] tabular-nums ${k.number ? '' : 'text-[#aaa]'}`}>{k.number ?? 1}</td>
                {/* 보호자 전화번호들 · 같은 순서의 관계 (번호가 없으면 빈칸) */}
                <td className={`${td} text-[12px] whitespace-nowrap tabular-nums`}>
                  {k.phones?.length ? k.phones.map((p, i) => <div key={i}>{fmtPhone(p)}</div>) : null}
                </td>
                <td className={`${td} text-[12px] whitespace-nowrap text-[#666]`}>
                  {k.phones?.length ? k.phones.map((_, i) => <div key={i}>{k.phoneRelations?.[i] || <span className="text-[#ccc]">-</span>}</div>) : null}
                </td>
                {USES.map(c => (
                  <td key={c.key} className={`${td} text-center`}>
                    <input type="checkbox" checked={!!k.uses?.[c.key]} onChange={e => toggleUses(k, c.key, e.target.checked)} aria-label={`${k.name} ${c.label} 사용`} />
                  </td>
                ))}
                <td className={`${td} text-center`}>
                  <input key={`${k.id}-prepaid-${prepaidLeftOf(k)}`} defaultValue={String(prepaidLeftOf(k))} inputMode="numeric" aria-label={`${k.name} 선결제 남은 횟수`}
                    onBlur={e => savePrepaidLeft(k, e.target.value)} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    className={`w-12 text-center text-[12px] tabular-nums border-b border-[#e5e5e5] outline-none bg-transparent focus:border-[var(--brand)] ${prepaidLeftOf(k) < 0 ? 'text-[#e11d48]' : ''} ${k.uses?.prepaid ? '' : 'opacity-40'}`} />
                </td>
                {BALANCES.map(b => (
                  <td key={b.key} className={`${td} text-center`}>
                    <input key={`${k.id}-${b.key}-${balOf(k, b.key)}`} defaultValue={balOf(k, b.key) ? balOf(k, b.key).toLocaleString('ko-KR') : ''} inputMode="numeric" placeholder="0"
                      onBlur={e => saveBalance(k, b.key, e.target.value)} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      className={`w-20 text-right text-[12px] tabular-nums border-b border-[#e5e5e5] outline-none bg-transparent focus:border-[var(--brand)] ${k.uses?.[b.key] ? '' : 'opacity-40'}`} />
                  </td>
                ))}
                <td className={`${td} text-[12px]`}><FixedList items={fixed.get(k.id) ?? []} /></td>
                <td className={`${td} text-[12px] whitespace-nowrap`}>
                  {(() => { const a = approvalOf(k); return <span className={a === '승인' ? 'text-[var(--brand)]' : a === '미승인' ? 'text-[#f59e0b]' : 'text-[#ccc]'}>{a}</span>; })()}
                </td>
                <td className={`${td} text-[12px] text-[#666] min-w-[120px]`}>{k.memo}</td>
                <td className={`${td} text-right whitespace-nowrap sticky right-0 bg-white shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.12)]`}>
                  <button onClick={() => start(k)} className={`${btn} border-[#e5e5e5] hover:bg-[#f8f8f8] mr-1`}>수정</button>
                  <button onClick={() => remove(k)} className={`${btn} border-[#e5e5e5] text-red-400 hover:bg-red-50`}>삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FixedList({ items }: { items: Fixed[] }) {
  if (!items.length) return <span className="text-[#ccc]">-</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {items.map((f, i) => (
        <span key={i} className="whitespace-nowrap border border-[#eee] rounded px-1.5 py-0.5">
          {DOW[f.weekday]} {f.time} {f.teacher}{kindLabel(f.kind) ? ` ${kindLabel(f.kind)}` : ''}{PAY_LABEL[f.payment.replace(/x/gi, '').charAt(0)] ? ` · ${PAY_LABEL[f.payment.replace(/x/gi, '').charAt(0)]}` : ''}
        </span>
      ))}
    </span>
  );
}

function EditRow({ form, setForm, input, td, btn, approved, usesCount, code, fixed, onSave, onCancel }: {
  form: typeof emptyForm;
  usesCount: number;
  setForm: React.Dispatch<React.SetStateAction<typeof emptyForm>>;
  input: string; td: string; btn: string;
  approved: Member[];
  code: string;
  fixed: Fixed[];
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <tr className="border-b border-[#f0f0f0] bg-[#f8fbff]">
      <td className={`${td} text-[12px] text-[#bbb]`}>{approved.find(m => m.userId === form.guardian)?.kakaoId ?? '-'}</td>
      <td className={`${td} text-[12px] text-[#888]`}>{code}</td>
      <td className={td}>
        <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="이름" className={`${input} w-24`} autoFocus />
        {/* 센터 — 다른 센터로 옮길 때 */}
        <select value={form.center} onChange={e => setForm(f => ({ ...f, center: e.target.value as Center }))} className="mt-1 block text-[11px] border border-[#ddd] bg-white px-1 py-0.5">
          <option value="eunpyeong">수색</option>
          <option value="uijeongbu">의정부</option>
        </select>
      </td>
      <td className={`${td} text-center`}>
        <input value={form.number} onChange={e => setForm(f => ({ ...f, number: e.target.value.replace(/\D/g, '') }))} placeholder="1" className={`${input} w-10 text-center`} />
      </td>
      <td className={td}>
        {/* 한 줄에 하나 — "010-1234-5678 맘" */}
        <textarea value={form.phone} rows={Math.max(2, form.phone.split('\n').length)} placeholder={'010-1234-5678 맘\n010-2345-6789 아버님'}
          onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className={`${input} w-44 text-[12px] leading-[1.6] resize-y`} />
      </td>
      <td className={`${td} text-[10px] text-[#aaa]`}>번호 뒤에<br />관계</td>
      {/* 쓰는 결제·이번 달 사용·선결제는 표에서 바로 고친다 */}
      {Array.from({ length: usesCount + 1 + BALANCES.length }, (_, i) => <td key={i} className={`${td} text-center text-[11px] text-[#ccc]`}>-</td>)}
      <td className={`${td} text-[12px]`}><FixedList items={fixed} /><p className="text-[10px] text-[#aaa] mt-1">고정 수업은 시간표 관리에서 고쳐요</p></td>
      <td className={`${td} text-[11px] text-[#aaa]`}>-</td>
      <td className={td}><input value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} placeholder="메모" className={`${input} w-full min-w-[120px]`} /></td>
      <td className={`${td} text-right whitespace-nowrap sticky right-0 bg-[#f8fbff] shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.12)]`}>
        <button onClick={onSave} className={`${btn} border-[var(--brand)] bg-[var(--brand)] text-white mr-1`}>저장</button>
        <button onClick={onCancel} className={`${btn} border-[#e5e5e5]`}>취소</button>
      </td>
    </tr>
  );
}
