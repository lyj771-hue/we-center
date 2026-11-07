'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { showAlert } from '@/lib/dialog';
import type { BalanceKey, Center, Child, MonthUse, PayCount, PrepaidKey, UsesKey } from '@/lib/timetable';
import { balanceOf, getChildren, getMonthNotes, getMonthUses, getPaymentCounts, isPrepaid, methodInCenter, PREPAID_KINDS, prepaidTotalOf, setChildUses, setMonthNote } from '@/lib/timetable';
import type { Member } from '@/lib/types';
import { downloadCsv, downloadXlsx, type Sheet } from '@/lib/exportFile';
import Portal from '@/components/Portal';
import PrepaidModal from '@/components/PrepaidModal';
import BalanceModal from '@/components/BalanceModal';
import MonthUseModal from '@/components/MonthUseModal';

// 회원 관리 — "결제정보" 탭 (예전 결제방식 관리 + 결제내역).
// 아이마다 결제 칸 하나에 ☑ 쓰는 결제(바로 저장, 아이 명단의 체크와 같은 값)와 숫자.
// 숫자를 누르면: 바우처·굳센·장맞춤·꿈이든 = 그 달 사용 내역 / 선결제A·B·C = 카드(내역 + 충전·차감·수정) / 우진학교외부·자율·지원금 = 내역 + 남은 금액 수정.
// 사용은 시간표 [결제 완료]로 저절로 들어온다. 선결제는 센터(아이)마다 따로.

type Kind = 'month' | 'prepaid' | 'balance';
export type PayInfoCol = { key: UsesKey & keyof MonthUse; label: string; kind: Kind };
// 굳센은 수색, 장맞춤은 의정부에서만 — 아이명단 탭도 같은 칸을 쓴다
export const ALL_COLS: PayInfoCol[] = [
  { key: 'voucher', label: '바우처', kind: 'month' }, { key: 'gusen', label: '굳센', kind: 'month' }, { key: 'jangmatchum', label: '장맞춤', kind: 'month' },
  { key: 'kkumideun', label: '꿈이든', kind: 'month' },
  ...PREPAID_KINDS.map(x => ({ key: x.key, label: x.label, kind: 'prepaid' as const })),
  { key: 'woojin_ext', label: '우진학교외부', kind: 'balance' }, { key: 'woojin_self', label: '우진학교자율', kind: 'balance' }, { key: 'subsidy', label: '지원금', kind: 'balance' },
];

const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const shiftMonth = (ym: string, n: number) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const fmtDate = (iso?: string) => { if (!iso) return ''; const d = new Date(iso); return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`; };
const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;
const fmtPhone = (p: string) => (p.length === 11 ? `${p.slice(0, 3)}-${p.slice(3, 7)}-${p.slice(7)}` : p.length === 10 ? `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}` : p);

/** 결제 칸 하나 — ☑ 쓰는 결제 + 숫자(누르면 내역 창). 결제정보·아이명단 탭이 같이 쓴다 */
export function PayInfoCell({ col, on, main, used, monthNo, low, childName, onToggle, onOpen }: {
  col: PayInfoCol; on: boolean; main: string; used: number; monthNo: number; low?: boolean; childName: string;
  onToggle: (on: boolean) => void; onOpen: () => void;
}) {
  return (
    <td className={`px-3 py-2.5 align-middle text-center whitespace-nowrap ${on ? '' : 'bg-[#fcfcfc]'}`}>
      <span className="inline-flex items-center gap-1.5">
        <input type="checkbox" checked={on} onChange={e => onToggle(e.target.checked)} aria-label={`${childName} ${col.label} 쓰는 결제`}
          title={`${col.label}를 쓰는 아이면 체크`} className="w-4 h-4 accent-[var(--brand)] cursor-pointer" />
        {/* 누르면 내역 (0이어도 빈 표로) */}
        <button type="button" onClick={onOpen} title={col.kind === 'month' ? `${monthNo}월 ${col.label} 사용 내역` : `${col.label} 내역 · ${col.kind === 'prepaid' ? '충전 · 차감 · 수정' : '남은 금액 수정'}`}
          className={`tabular-nums text-[13px] underline-offset-2 hover:underline ${low ? 'text-[#e11d48]' : on || used ? 'text-[var(--brand)]' : 'text-[#ccc]'}`}>
          {main}
        </button>
      </span>
      {col.kind !== 'month' && <span className={`block text-[10px] tabular-nums ${used ? 'text-[#888]' : 'text-[#ddd]'}`}>{monthNo}월 {used}회</span>}
    </td>
  );
}
/** 결제 칸 머리글 아래 작은 글씨 */
export const payInfoSub = (c: PayInfoCol, monthNo: number) => (c.kind === 'month' ? `${monthNo}월 사용` : c.kind === 'prepaid' ? `남은 횟수 · ${monthNo}월` : `남은 금액 · ${monthNo}월`);

export default function PaymentsTab({ members, center, q }: { members: Member[]; center: Center; /** 찾기 — 위 회원 관리 칸 */ q: string }) {
  const [month, setMonth] = useState(thisMonth);
  const [kids, setKids] = useState<Child[]>([]);
  const [uses, setUses] = useState<Map<string, MonthUse>>(new Map());
  const [allTime, setAllTime] = useState<Map<string, PayCount>>(new Map());
  const [notes, setNotes] = useState<Map<string, string>>(new Map());
  const [showAll, setShowAll] = useState(false);
  const [failed, setFailed] = useState('');
  const [cardFor, setCardFor] = useState<{ child: Child; method: PrepaidKey } | null>(null);    // 선결제 카드 창을 연 아이·종류
  const [balanceFor, setBalanceFor] = useState<{ child: Child; method: BalanceKey } | null>(null);   // 남은 금액 상세를 연 아이·종류
  const [useFor, setUseFor] = useState<{ child: Child; method: keyof MonthUse; label: string } | null>(null);   // 그 달 사용 내역을 연 아이·결제
  const COLS = ALL_COLS.filter(c => methodInCenter(c.key, center));

  const load = useCallback(async () => {
    try {
      const [k, u, a, n] = await Promise.all([
        getChildren(), getMonthUses(month), getPaymentCounts('2000-01-01', '2999-12-31').catch(() => new Map<string, PayCount>()),
        getMonthNotes(month).catch(() => new Map<string, string>()),
      ]);
      k.sort((x, y) => `${x.name}${String(x.number ?? 1).padStart(3, '0')}`.localeCompare(`${y.name}${String(y.number ?? 1).padStart(3, '0')}`, 'ko'));   // 이름순
      setKids(k); setUses(u); setAllTime(a); setNotes(n); setFailed('');
    } catch (e) {
      setFailed((e as Error).message);
    }
  }, [month]);
  useEffect(() => { load(); }, [load]);

  const memberOf = useMemo(() => new Map(members.map(m => [m.userId, m])), [members]);
  const prepaidLeft = (k: Child, key: PrepaidKey) => prepaidTotalOf(k, key) - (allTime.get(k.id)?.[key] ?? 0);
  // 기본은 결제를 쓰는 아이(체크·사용·잔액·메모가 있는 아이)만, [모두 보기]면 전부
  const active = (k: Child) => Object.values(k.uses ?? {}).some(Boolean) || COLS.some(c => (uses.get(k.id)?.[c.key] ?? 0) > 0)
    || PREPAID_KINDS.some(x => prepaidTotalOf(k, x.key) > 0) || !!k.woojinExtBalance || !!k.woojinSelfBalance || !!k.subsidyBalance || !!notes.get(k.id);
  const list = kids.filter(k => (k.center ?? 'eunpyeong') === center && (showAll || active(k)) && (!q.trim() || `${k.memberCode} ${k.name}${k.number ?? ''}`.includes(q.trim())));

  // 쓰는 결제 체크 — 바로 저장 (아이 명단의 체크와 같은 값)
  const toggleUse = async (k: Child, key: UsesKey, on: boolean) => {
    setKids(list => list.map(x => (x.id === k.id && x.uses ? { ...x, uses: { ...x.uses, [key]: on } } : x)));
    try { await setChildUses(k.id, key, on); }
    catch (e) { showAlert(`저장하지 못했어요. 다시 시도해 주세요.\n${(e as Error).message}`); load(); }
  };

  const saveNote = async (k: Child, text: string) => {
    if (text.trim() === (notes.get(k.id) ?? '')) return;
    try {
      await setMonthNote(k.id, month, text);
      setNotes(n => { const m = new Map(n); if (text.trim()) m.set(k.id, text.trim()); else m.delete(k.id); return m; });
    } catch (e) {
      showAlert(`메모를 저장하지 못했어요 — SQL(supabase/month-notes.sql)을 실행했는지 확인해 주세요.\n${(e as Error).message}`);
    }
  };

  // 칸의 큰 숫자 — 월 결제는 그 달 사용, 선결제는 남은 횟수, 우진학교·지원금은 남은 금액
  const mainOf = (k: Child, c: PayInfoCol) =>
    c.kind === 'month' ? `${uses.get(k.id)?.[c.key] ?? 0}회`
    : c.kind === 'prepaid' ? `${prepaidLeft(k, c.key as PrepaidKey)}회`
    : won(balanceOf(k, c.key as BalanceKey));
  const open = (k: Child, c: PayInfoCol) =>
    c.kind === 'month' ? setUseFor({ child: k, method: c.key, label: c.label })
    : isPrepaid(c.key) ? setCardFor({ child: k, method: c.key })
    : setBalanceFor({ child: k, method: c.key as BalanceKey });

  const [y, m] = month.split('-').map(Number);
  const sheet = (): Sheet => ({
    name: `${y}년 ${m}월 결제정보`,
    rows: [
      ['이름', '번호', '전화번호(관계)', ...COLS.flatMap(c => c.kind === 'month' ? [`${c.label} 쓰는지`, `${c.label} ${m}월 사용`] : [`${c.label} 쓰는지`, `${c.label} ${c.kind === 'prepaid' ? '남은 횟수' : '남은 금액'}`, `${c.label} ${m}월 사용`]), '메모', '승인 날짜'],
      ...list.map(k => [
        k.name, k.number ?? 1, k.phones?.length ? k.phones.map((p, i) => `${fmtPhone(p)} ${k.phoneRelations?.[i] ?? ''}`.trim()).join(', ') : (k.phoneLast4 ?? ''),
        ...COLS.flatMap(c => {
          const on = k.uses?.[c.key] ? 'O' : '';
          const used = uses.get(k.id)?.[c.key] ?? 0;
          return c.kind === 'month' ? [on, used] : [on, c.kind === 'prepaid' ? prepaidLeft(k, c.key as PrepaidKey) : balanceOf(k, c.key as BalanceKey), used];
        }),
        notes.get(k.id) ?? '', fmtDate(k.guardianUserId ? memberOf.get(k.guardianUserId)?.approvedAt : undefined),
      ]),
    ],
    cols: [10, 5, 18, ...COLS.flatMap(c => c.kind === 'month' ? [6, 8] : [6, 12, 8]), 30, 11],
  });

  // 머리글 행은 표 칸 안에서 위에 고정 — 표가 자기 칸에서 위아래로도 스크롤된다
  const th = 'sticky top-0 z-10 bg-white shadow-[inset_0_-1px_0_#e5e5e5] text-left font-normal text-[12px] text-[#999] px-3 py-3 whitespace-nowrap';
  const td = 'px-3 py-2.5 align-middle';
  const btn = 'text-[12px] border px-2.5 py-1 transition-colors whitespace-nowrap';

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button onClick={() => setMonth(x => shiftMonth(x, -1))} className="text-[13px] border border-[#e5e5e5] w-8 h-8 hover:bg-[#f8f8f8]" aria-label="지난달">‹</button>
        <input type="month" value={month} onChange={e => e.target.value && setMonth(e.target.value)} className="text-[13px] border border-[#ddd] px-2 h-8" />
        <button onClick={() => setMonth(x => shiftMonth(x, 1))} className="text-[13px] border border-[#e5e5e5] w-8 h-8 hover:bg-[#f8f8f8]" aria-label="다음달">›</button>
        {month !== thisMonth() && <button onClick={() => setMonth(thisMonth())} className="text-[12px] text-[#888] underline underline-offset-2">이번 달</button>}
        <label className="flex items-center gap-1 text-[12px] text-[#888]"><input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />모두 보기</label>
        <span className="text-[12px] text-[#aaa]">{list.length}명</span>
        <button onClick={() => downloadXlsx([sheet()], `결제정보_${month.replace('-', '')}`).catch(e => showAlert(`내려받지 못했어요.\n${(e as Error).message}`))}
          className={`${btn} ml-auto border-[#16a34a] text-[#16a34a] hover:bg-[#f0fdf4]`}>엑셀 다운로드</button>
        <button onClick={() => downloadCsv([sheet()], `결제정보_${month.replace('-', '')}`)} className={`${btn} border-[#ddd] text-[#555] hover:bg-[#f8f8f8]`}>CSV 다운로드</button>
      </div>
      <p className="text-[11px] text-[#aaa] mb-3">☑ = 쓰는 결제(누르면 바로 저장). 숫자를 누르면 내역이 뜨고, 선결제는 충전·차감·수정, 우진학교·지원금은 남은 금액 수정을 그 창에서 해요. 사용은 시간표 [결제 완료]로 저절로 들어와요. 메모는 달마다 따로 저장돼요.</p>
      {failed && <p className="text-[13px] text-red-400 mb-3">불러오지 못했어요. ({failed})</p>}

      <div className="max-h-[calc(100dvh-140px)] overflow-auto border-t border-[#e5e5e5]">
        <table className="w-full text-[14px] text-[#333] border-collapse">
          <thead>
            <tr className="border-b border-[#e5e5e5]">
              <th className={th}>이름</th>
              <th className={`${th} text-center`}>번호</th>
              <th className={th}>전화번호</th>
              {COLS.map(c => (
                <th key={c.key} className={`${th} text-center`}>{c.label}
                  <span className="block text-[10px] text-[#bbb]">{payInfoSub(c, m)}</span>
                </th>
              ))}
              <th className={th}>{m}월 메모</th>
              <th className={th}>승인 날짜</th>
            </tr>
          </thead>
          <tbody>
            {list.map(k => {
              const approved = k.guardianUserId ? memberOf.get(k.guardianUserId)?.approvedAt : undefined;
              return (
                <tr key={k.id} className="border-b border-[#f0f0f0] hover:bg-[#fafafa]">
                  <td className={`${td} whitespace-nowrap`}>{k.name}</td>
                  <td className={`${td} text-center text-[13px] tabular-nums ${k.number ? '' : 'text-[#aaa]'}`}>{k.number ?? 1}</td>
                  {/* 보호자 전화번호(관계) — 아이 명단과 같게, 여러 개면 줄마다. 없으면 예전 뒷번호 */}
                  <td className={`${td} text-[12px] tabular-nums whitespace-nowrap`}>
                    {k.phones?.length ? k.phones.map((p, i) => <div key={i}>{fmtPhone(p)}{k.phoneRelations?.[i] && <span className="ml-1 text-[#999]">{k.phoneRelations[i]}</span>}</div>)
                      : k.phoneLast4 ? <span className="text-[#888]">뒷번호 {k.phoneLast4}</span> : <span className="text-[#ccc]">-</span>}
                  </td>
                  {COLS.map(c => {
                    const used = uses.get(k.id)?.[c.key] ?? 0;
                    const low = c.kind === 'prepaid' && prepaidLeft(k, c.key as PrepaidKey) <= 0 && (prepaidTotalOf(k, c.key as PrepaidKey) > 0 || used > 0);
                    return <PayInfoCell key={c.key} col={c} on={!!k.uses?.[c.key]} main={mainOf(k, c)} used={used} monthNo={m} low={low} childName={k.name}
                      onToggle={on => toggleUse(k, c.key, on)} onOpen={() => open(k, c)} />;
                  })}
                  <td className={`${td} min-w-[180px]`}>
                    <input key={`${k.id}-${month}-${notes.get(k.id) ?? ''}`} defaultValue={notes.get(k.id) ?? ''} placeholder="메모"
                      onBlur={e => saveNote(k, e.target.value)} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      className="w-full border-b border-[#eee] py-1 text-[13px] outline-none bg-transparent focus:border-[var(--brand)]" />
                  </td>
                  <td className={`${td} text-[12px] whitespace-nowrap tabular-nums`}>{fmtDate(approved) || <span className="text-[#ccc]">-</span>}</td>
                </tr>
              );
            })}
            {!list.length && <tr><td colSpan={20} className="py-10 text-center text-[13px] text-[#bbb]">보여 줄 아이가 없어요. [모두 보기]를 켜 보세요.</td></tr>}
          </tbody>
        </table>
      </div>
      {cardFor && <Portal><PrepaidModal child={cardFor.child} method={cardFor.method} onClose={() => { setCardFor(null); load(); }} /></Portal>}
      {useFor && <Portal><MonthUseModal child={useFor.child} method={useFor.method} label={useFor.label} month={month} onClose={() => setUseFor(null)} /></Portal>}
      {balanceFor && <Portal><BalanceModal child={balanceFor.child} method={balanceFor.method} onClose={() => { setBalanceFor(null); load(); }} /></Portal>}
    </div>
  );
}
