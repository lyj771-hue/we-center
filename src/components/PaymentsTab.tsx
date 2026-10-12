'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { showAlert } from '@/lib/dialog';
import type { Child, MonthUse, PayCount } from '@/lib/timetable';
import { getChildren, getMonthNotes, getMonthUses, getPaymentCounts, setMonthNote } from '@/lib/timetable';
import type { Member } from '@/lib/types';
import { downloadCsv, downloadXlsx, type Sheet } from '@/lib/exportFile';

// 회원 관리 — "결제내역" 탭. 달을 골라 아이마다 그 달 결제별 사용 횟수(시간표 [결제 완료]로 확정된 것),
// 선결제 잔여, 우진학교·지원금 남은 금액, 그 달 메모, 보호자 승인 날짜를 본다.

const USE_COLS: { key: keyof MonthUse; label: string }[] = [
  { key: 'voucher', label: '바우처' }, { key: 'gusen', label: '굳센' }, { key: 'kkumideun', label: '꿈이든' },
  { key: 'woojin', label: '우진학교' }, { key: 'subsidy', label: '지원금' }, { key: 'prepaid', label: '선결제' },
];

const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const shiftMonth = (ym: string, n: number) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const fmtDate = (iso?: string) => { if (!iso) return ''; const d = new Date(iso); return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`; };
const won = (n?: number) => (n ? `${n.toLocaleString('ko-KR')}원` : '');

export default function PaymentsTab({ members }: { members: Member[] }) {
  const [month, setMonth] = useState(thisMonth);
  const [kids, setKids] = useState<Child[]>([]);
  const [uses, setUses] = useState<Map<string, MonthUse>>(new Map());
  const [allTime, setAllTime] = useState<Map<string, PayCount>>(new Map());
  const [notes, setNotes] = useState<Map<string, string>>(new Map());
  const [q, setQ] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [failed, setFailed] = useState('');

  const load = useCallback(async () => {
    try {
      const [k, u, a, n] = await Promise.all([
        getChildren(), getMonthUses(month), getPaymentCounts('2000-01-01', '2999-12-31').catch(() => new Map<string, PayCount>()),
        getMonthNotes(month).catch(() => new Map<string, string>()),
      ]);
      k.sort((x, y) => (x.memberCode ?? '').localeCompare(y.memberCode ?? ''));
      setKids(k); setUses(u); setAllTime(a); setNotes(n); setFailed('');
    } catch (e) {
      setFailed((e as Error).message);
    }
  }, [month]);
  useEffect(() => { load(); }, [load]);

  const memberOf = useMemo(() => new Map(members.map(m => [m.userId, m])), [members]);
  const prepaidLeft = (k: Child) => (k.prepaidTotal ?? 0) - (allTime.get(k.id)?.prepaid ?? 0);
  // 기본은 결제를 쓰는 아이(체크·사용·잔액·메모가 있는 아이)만, [모두 보기]면 전부
  const active = (k: Child) => Object.values(k.uses ?? {}).some(Boolean) || USE_COLS.some(c => (uses.get(k.id)?.[c.key] ?? 0) > 0)
    || (k.prepaidTotal ?? 0) > 0 || !!k.woojinBalance || !!k.subsidyBalance || !!notes.get(k.id);
  const list = kids.filter(k => (showAll || active(k)) && (!q.trim() || `${k.memberCode} ${k.name}${k.number ?? ''}`.includes(q.trim())));

  const saveNote = async (k: Child, text: string) => {
    if (text.trim() === (notes.get(k.id) ?? '')) return;
    try {
      await setMonthNote(k.id, month, text);
      setNotes(n => { const m = new Map(n); if (text.trim()) m.set(k.id, text.trim()); else m.delete(k.id); return m; });
    } catch (e) {
      showAlert(`메모를 저장하지 못했어요 — SQL(supabase/month-notes.sql)을 실행했는지 확인해 주세요.\n${(e as Error).message}`);
    }
  };

  const [y, m] = month.split('-').map(Number);
  const sheet = (): Sheet => ({
    name: `${y}년 ${m}월 결제내역`,
    rows: [
      ['이름', '번호', '뒷번호', ...USE_COLS.map(c => `${c.label} 사용`), '선결제 잔여', '우진학교 남은 금액', '지원금 남은 금액', '메모', '승인 날짜'],
      ...list.map(k => [
        k.name, k.number ?? 1, k.phoneLast4 ?? '', ...USE_COLS.map(c => uses.get(k.id)?.[c.key] ?? 0),
        prepaidLeft(k), k.woojinBalance ?? 0, k.subsidyBalance ?? 0, notes.get(k.id) ?? '',
        fmtDate(k.guardianUserId ? memberOf.get(k.guardianUserId)?.approvedAt : undefined),
      ]),
    ],
    cols: [10, 5, 7, ...USE_COLS.map(() => 8), 9, 12, 12, 30, 11],
  });

  const th = 'text-left font-normal text-[12px] text-[#999] px-3 py-3 whitespace-nowrap';
  const td = 'px-3 py-2.5 align-middle';
  const btn = 'text-[12px] border px-2.5 py-1 transition-colors whitespace-nowrap';

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button onClick={() => setMonth(x => shiftMonth(x, -1))} className="text-[13px] border border-[#e5e5e5] w-8 h-8 hover:bg-[#f8f8f8]" aria-label="지난달">‹</button>
        <input type="month" value={month} onChange={e => e.target.value && setMonth(e.target.value)} className="text-[13px] border border-[#ddd] px-2 h-8" />
        <button onClick={() => setMonth(x => shiftMonth(x, 1))} className="text-[13px] border border-[#e5e5e5] w-8 h-8 hover:bg-[#f8f8f8]" aria-label="다음달">›</button>
        {month !== thisMonth() && <button onClick={() => setMonth(thisMonth())} className="text-[12px] text-[#888] underline underline-offset-2">이번 달</button>}
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="이름·회원 코드 찾기"
          className="ml-2 border border-[#e5e5e5] px-3 py-1.5 text-[13px] w-48 outline-none focus:border-[var(--brand)]" />
        <label className="flex items-center gap-1 text-[12px] text-[#888]"><input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />모두 보기</label>
        <span className="text-[12px] text-[#aaa]">{list.length}명</span>
        <button onClick={() => downloadXlsx([sheet()], `결제내역_${month.replace('-', '')}`).catch(e => showAlert(`내려받지 못했어요.\n${(e as Error).message}`))}
          className={`${btn} ml-auto border-[#16a34a] text-[#16a34a] hover:bg-[#f0fdf4]`}>엑셀 다운로드</button>
        <button onClick={() => downloadCsv([sheet()], `결제내역_${month.replace('-', '')}`)} className={`${btn} border-[#ddd] text-[#555] hover:bg-[#f8f8f8]`}>CSV 다운로드</button>
      </div>
      <p className="text-[11px] text-[#aaa] mb-3">사용 횟수는 {m}월에 시간표 [결제 완료]로 확정된 수업이에요(선결제는 선결제 카드의 직접 차감 포함). 선결제 잔여·남은 금액은 지금 기준이에요. 메모는 달마다 따로 저장돼요.</p>
      {failed && <p className="text-[13px] text-red-400 mb-3">불러오지 못했어요. ({failed})</p>}

      <div className="overflow-x-auto border-t border-[#e5e5e5]">
        <table className="w-full text-[14px] text-[#333] border-collapse">
          <thead>
            <tr className="border-b border-[#e5e5e5]">
              <th className={th}>이름</th>
              <th className={`${th} text-center`}>번호</th>
              <th className={th}>뒷번호</th>
              {USE_COLS.map(c => <th key={c.key} className={`${th} text-center`}>{c.label}<span className="block text-[10px] text-[#bbb]">{m}월 사용</span></th>)}
              <th className={`${th} text-center`}>선결제<span className="block text-[10px] text-[#bbb]">잔여</span></th>
              <th className={`${th} text-right`}>우진학교<span className="block text-[10px] text-[#bbb]">남은 금액</span></th>
              <th className={`${th} text-right`}>지원금<span className="block text-[10px] text-[#bbb]">남은 금액</span></th>
              <th className={th}>{m}월 메모</th>
              <th className={th}>승인 날짜</th>
            </tr>
          </thead>
          <tbody>
            {list.map(k => {
              const u = uses.get(k.id);
              const approved = k.guardianUserId ? memberOf.get(k.guardianUserId)?.approvedAt : undefined;
              return (
                <tr key={k.id} className="border-b border-[#f0f0f0] hover:bg-[#fafafa]">
                  <td className={`${td} whitespace-nowrap`}>{k.name}</td>
                  <td className={`${td} text-center text-[13px] tabular-nums ${k.number ? '' : 'text-[#aaa]'}`}>{k.number ?? 1}</td>
                  <td className={`${td} text-[12px] tabular-nums`}>{k.phoneLast4 ?? <span className="text-[#ccc]">-</span>}</td>
                  {USE_COLS.map(c => {
                    const n = u?.[c.key] ?? 0;
                    return <td key={c.key} className={`${td} text-center tabular-nums ${n ? 'text-[var(--brand)]' : k.uses?.[c.key] ? 'text-[#999]' : 'text-[#ddd]'}`}>{n}</td>;
                  })}
                  <td className={`${td} text-center tabular-nums ${prepaidLeft(k) <= 0 && (k.prepaidTotal ?? 0) > 0 ? 'text-[#e11d48]' : ''}`}>{(k.prepaidTotal ?? 0) > 0 ? prepaidLeft(k) : <span className="text-[#ddd]">-</span>}</td>
                  <td className={`${td} text-right text-[13px] tabular-nums whitespace-nowrap`}>{won(k.woojinBalance) || <span className="text-[#ddd]">-</span>}</td>
                  <td className={`${td} text-right text-[13px] tabular-nums whitespace-nowrap`}>{won(k.subsidyBalance) || <span className="text-[#ddd]">-</span>}</td>
                  <td className={`${td} min-w-[180px]`}>
                    <input key={`${k.id}-${month}-${notes.get(k.id) ?? ''}`} defaultValue={notes.get(k.id) ?? ''} placeholder="메모"
                      onBlur={e => saveNote(k, e.target.value)} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      className="w-full border-b border-[#eee] py-1 text-[13px] outline-none bg-transparent focus:border-[var(--brand)]" />
                  </td>
                  <td className={`${td} text-[12px] whitespace-nowrap tabular-nums`}>{fmtDate(approved) || <span className="text-[#ccc]">-</span>}</td>
                </tr>
              );
            })}
            {!list.length && <tr><td colSpan={14} className="py-10 text-center text-[13px] text-[#bbb]">보여 줄 아이가 없어요. [모두 보기]를 켜 보세요.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
