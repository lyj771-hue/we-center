'use client';

import { useCallback, useEffect, useState } from 'react';
import { showAlert } from '@/lib/dialog';
import type { BalanceCharge, BalanceKey, BalanceUse, Child } from '@/lib/timetable';
import { addBalanceCharge, getBalanceCharges, getBalanceUses, WOOJIN_FEE } from '@/lib/timetable';
import { getTeachers } from '@/lib/schedule';

// 회원 관리 "결제내역" 탭에서 우진학교외부·자율·지원금 남은 금액을 누르면 여는 상세보기 + [충전].
// 충전·수정 기록(balance_charges)과 확정된 수업(차감 6만원)을 날짜 순으로 늘어놓고, 줄마다 그 뒤 잔여금액을 붙인다.

const LABEL: Record<BalanceKey, string> = { woojin_ext: '우진학교외부', woojin_self: '우진학교자율', subsidy: '지원금' };
const ymd = (d: string) => d.replace(/-/g, '/');
const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

type Row =
  | { kind: 'charge'; day: string; c: BalanceCharge }
  | { kind: 'use'; day: string; u: BalanceUse; nth: number };

export default function BalanceModal({ child, method, onClose }: { child: Child; method: BalanceKey; onClose: () => void }) {
  const [uses, setUses] = useState<BalanceUse[] | null>(null);
  const [charges, setCharges] = useState<BalanceCharge[]>([]);
  const [noTable, setNoTable] = useState(false);
  const [teachers, setTeachers] = useState<Map<string, string>>(new Map());
  const [failed, setFailed] = useState('');
  const [busy, setBusy] = useState(false);
  const [day, setDay] = useState(today);
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');

  const load = useCallback(() => {
    Promise.all([
      getBalanceUses(child.id, method),
      // balance-charges.sql 전에는 충전 기록 없이 차감만
      getBalanceCharges(child.id, method).then(c => { setNoTable(false); return c; }).catch(() => { setNoTable(true); return [] as BalanceCharge[]; }),
      getTeachers({ includeHidden: true }),
    ])
      .then(([u, c, t]) => { setUses(u); setCharges(c); setTeachers(new Map(t.map(x => [x.id, x.name]))); })
      .catch(e => { setUses([]); setFailed((e as Error).message); });
  }, [child.id, method]);
  useEffect(() => { load(); }, [load]);

  // 날짜 순 — 같은 날은 충전·수정 먼저. 잔여금액은 처음부터 더하고 뺀다(충전 기록이 없으면 지금 남은 금액에서 거꾸로)
  const list: Row[] = [
    ...charges.map(c => ({ kind: 'charge' as const, day: c.day, c })),
    ...(uses ?? []).map((u, i) => ({ kind: 'use' as const, day: u.day, u, nth: i + 1 })),
  ].sort((a, b) => a.day.localeCompare(b.day) || (a.kind === b.kind ? 0 : a.kind === 'charge' ? -1 : 1));
  const delta = (r: Row) => (r.kind === 'charge' ? r.c.amount : r.u.deducted ? -WOOJIN_FEE : 0);
  const end = list.reduce((s, r) => s + delta(r), 0);
  const now = charges.length ? end : child[method === 'woojin_ext' ? 'woojinExtBalance' : method === 'woojin_self' ? 'woojinSelfBalance' : 'subsidyBalance'] ?? 0;
  let bal = now - end;
  const rows = list.map(r => { bal += delta(r); return { r, left: bal }; });

  const charge = async () => {
    const n = Number(amount.replace(/\D/g, ''));
    if (!n) { showAlert('충전 금액을 적어 주세요.'); return; }
    setBusy(true);
    try { await addBalanceCharge(child.id, method, day, n, memo); setAmount(''); setMemo(''); load(); }
    catch (e) { showAlert(`충전하지 못했어요 — SQL(supabase/balance-charges.sql)을 실행했는지 확인해 주세요.\n${(e as Error).message}`); }
    finally { setBusy(false); }
  };

  const th = 'py-2 px-2 font-normal text-[11px] text-[#999] whitespace-nowrap';
  const td = 'py-2 px-2 tabular-nums whitespace-nowrap';
  const input = 'border-b border-[#ddd] py-1 text-[14px] outline-none focus:border-[var(--brand)]';
  const label = 'text-[11px] text-[#999]';

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div className="bg-[#f7f7f8] rounded-2xl shadow-2xl w-full max-w-lg p-5 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="text-[15px] text-[#27272a]">{child.name}{child.number ?? ''} · {LABEL[method]} 상세</p>
          <button onClick={onClose} className="text-[13px] text-[#888]">닫기 ✕</button>
        </div>
        {failed && <p className="text-[13px] text-red-400">불러오지 못했어요 — SQL(supabase/balance-detail.sql)을 실행했는지 확인해 주세요. ({failed})</p>}
        {noTable && <p className="text-[12px] text-[#b45309]">충전 기록을 남기려면 SQL(supabase/balance-charges.sql)을 실행해 주세요. 지금은 차감 내역만 보여요.</p>}
        {uses === null ? <p className="text-[13px] text-[#aaa]">불러오는 중…</p> : (
          <div className="bg-white rounded-xl border border-[#e4e4e7] overflow-x-auto">
            <table className="w-full text-[13px] text-[#333] border-collapse">
              <thead>
                <tr className="border-b border-dashed border-[#bbb] text-left">
                  <th className={th}>날짜</th><th className={th}>내용</th>
                  <th className={`${th} text-right`}>충전·차감</th><th className={`${th} text-right`}>잔여금액</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ r, left }, i) => (
                  <tr key={i} className="border-b border-[#f0f0f0] last:border-b-0">
                    <td className={td}>{ymd(r.day)}{r.kind === 'use' && r.u.center === 'uijeongbu' && <span className="ml-1 text-[10px] text-[#aaa]">의정부</span>}</td>
                    {r.kind === 'charge' ? (
                      <td className="py-2 px-2 text-[12px]">
                        <span className={r.c.seed ? 'text-[#888]' : r.c.adjust ? 'text-[#b45309]' : 'text-[var(--brand)]'}>{r.c.seed ? '이전 잔액' : r.c.adjust ? '수정' : '충전'}</span>
                        {r.c.memo && !r.c.seed && <span className="ml-1.5 text-[11px] text-[#999] break-keep">{r.c.memo}</span>}
                      </td>
                    ) : (
                      <td className="py-2 px-2 text-[12px] whitespace-nowrap">{r.nth}회 · {(r.u.teacherId && teachers.get(r.u.teacherId)) || '-'}{r.u.time ? ` ${r.u.time.replace(/^0/, '')}` : ''}</td>
                    )}
                    <td className={`${td} text-right ${delta(r) > 0 ? 'text-[var(--brand)]' : delta(r) < 0 ? 'text-[#e11d48]' : 'text-[#bbb]'}`}>
                      {r.kind === 'use' && !r.u.deducted ? '차감 전 기록' : `${delta(r) > 0 ? '+' : '−'}${won(Math.abs(delta(r)))}`}
                    </td>
                    <td className={`${td} text-right text-[var(--brand)]`}>{won(left)}</td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={4} className="py-8 text-center text-[13px] text-[#bbb]">아직 충전·차감 내역이 없어요.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-right text-[13px] text-[#27272a]">지금 남은 금액 <span className="text-[16px] tabular-nums text-[var(--brand)]">{won(now)}</span></p>

        {/* 충전 */}
        <div className="bg-white rounded-xl p-4 flex flex-wrap items-end gap-3">
          <p className="w-full text-[11px] text-[#777]">충전</p>
          <label className={label}>날짜<input type="date" value={day} onChange={e => e.target.value && setDay(e.target.value)} className={`${input} block`} /></label>
          <label className={label}>금액(원)<input value={amount ? Number(amount).toLocaleString('ko-KR') : ''} inputMode="numeric" placeholder="600,000"
            onChange={e => setAmount(e.target.value.replace(/\D/g, '').slice(0, 9))} className={`${input} block w-24 text-right`} /></label>
          <label className={`${label} flex-1 min-w-[110px]`}>메모<input value={memo} onChange={e => setMemo(e.target.value)} placeholder="예: 11월 지원금" className={`${input} block w-full`} /></label>
          <button onClick={charge} disabled={busy || noTable} className="text-[12px] border border-[var(--brand)] bg-[var(--brand)] text-white px-3.5 py-1.5 rounded-full disabled:opacity-50">충전</button>
        </div>
        <p className="text-[11px] text-[#aaa] leading-[1.7]">시간표 [결제 완료]로 확정한 수업이 한 번에 {won(WOOJIN_FEE)}씩 빠져요. 아이 명단에서 남은 금액을 직접 고치면 그 차이가 [수정]으로 남아요.</p>
      </div>
    </div>
  );
}
