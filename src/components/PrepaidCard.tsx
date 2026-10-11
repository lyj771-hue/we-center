'use client';

import type { LedgerRow } from '@/lib/prepaid';

// 선결제 카드 — 센터에서 쓰던 종이 카드 모양 그대로(일자 · 충전/사용 · 남은 횟수). 마이페이지와 회원 관리에서 같이 쓴다.
// onDelete 를 넘기면(관리자) 충전 줄에 ✕ 가 생긴다.

export default function PrepaidCard({ rows, memberCode, name, onDelete }: {
  rows: LedgerRow[];
  memberCode?: string;
  name?: string;
  onDelete?: (row: LedgerRow) => void;
}) {
  const left = rows.length ? rows[rows.length - 1].balance : 0;
  const md = (d: string) => `${d.slice(5, 7)}/${d.slice(8, 10)}`;
  return (
    <div className="relative mx-auto max-w-[360px] rounded-[16px] border border-[#e4e4e7] bg-white px-5 pt-5 pb-4 shadow-[0_2px_10px_rgba(0,0,0,0.06)] overflow-hidden">
      <img src="/logo-we.jpg" alt="" aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 w-40 -translate-x-1/2 -translate-y-1/2 opacity-[0.06]" />
      <div className="relative">
        <p className="text-[17px] text-[#27272a]">WE 소아재활센터</p>
        <p className="text-[12px] text-[#999] mt-0.5 tabular-nums">
          {memberCode && <>회원번호 {memberCode}</>}{name && <span className="ml-2 text-[#555]">{name}</span>}
        </p>
        <div className="mt-3 grid grid-cols-[1fr_1fr_1fr] border-y border-dashed border-[#bbb] py-1.5 text-[12px] text-[#888]">
          <span>일자</span><span className="text-right">충전 · 사용</span><span className="text-right">남은 횟수</span>
        </div>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-[#bbb]">아직 충전·사용 내역이 없어요.</p>
        ) : (
          <ul className="py-1 font-mono text-[14px] tabular-nums">
            {rows.map((r, i) => (
              <li key={i} className="grid grid-cols-[1fr_1fr_1fr] items-center py-1">
                <span className="text-[#444]">{md(r.day)}{r.kind === 'use' && <span className="ml-1 text-[11px] text-[#aaa]">사용</span>}</span>
                <span className={`text-right ${r.kind === 'charge' ? 'text-[var(--brand)]' : 'text-[#555]'}`} title={r.memo}>
                  {r.kind === 'charge' ? `+${r.count}` : `-${r.count}`}
                  {r.kind === 'charge' && onDelete && r.chargeId && (
                    <button type="button" onClick={() => onDelete(r)} aria-label="이 충전 기록 지우기" className="ml-1 text-[11px] text-[#ccc] hover:text-red-400">✕</button>
                  )}
                </span>
                <span className={`text-right ${r.balance <= 0 ? 'text-[#e11d48]' : 'text-[#27272a]'}`}>{r.balance}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 border-t border-dashed border-[#bbb] pt-2 text-right text-[14px] text-[#27272a]">
          남은 횟수 <span className={`text-[20px] tabular-nums ${left <= 0 ? 'text-[#e11d48]' : 'text-[var(--brand)]'}`}>{left}</span>회
        </p>
      </div>
    </div>
  );
}
