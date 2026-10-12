'use client';

import { useEffect, useState } from 'react';

// 결제별 사용 카드(바우처·굳센·꿈이든·지원금) — 선결제 카드와 같은 모양. 이번 달 사용 기록: 일자 · 회차 · 메모.
// 1쪽이 가장 최근 3줄(쪽 안에서는 날짜 순).

export interface UsageRow { day: string; memo?: string }

const PER_PAGE = 3;

export default function UsageCard({ label, rows, name, used, limit }: {
  label: string;
  rows: UsageRow[];
  name?: string;
  /** 이번 달 사용 횟수 (관리자가 고쳐 적었으면 그 값) */
  used: number;
  /** 한 달 제공 횟수 (0 = 없음) */
  limit?: number;
}) {
  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [rows.length]);
  const end = rows.length - page * PER_PAGE;
  const start = Math.max(0, end - PER_PAGE);
  const shown = rows.slice(start, end);
  const md = (d: string) => `${d.slice(2, 4)}/${d.slice(5, 7)}/${d.slice(8, 10)}`;

  return (
    <div className="relative mx-auto max-w-[380px] rounded-[16px] border border-[#e4e4e7] bg-white px-5 pt-5 pb-4 shadow-[0_2px_10px_rgba(0,0,0,0.06)] overflow-hidden">
      <img src="/logo-we.jpg" alt="" aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 w-40 -translate-x-1/2 -translate-y-1/2 opacity-[0.06]" />
      <div className="relative">
        <p className="text-[14px] text-[#27272a]">WE 소아재활센터 <span className="text-[var(--brand)]">{label}</span></p>
        <p className="text-[12px] text-[#999] mt-0.5">
          {name && <span className="text-[#555]">{name} 님<span aria-hidden="true" className="ml-1 text-[#e11d48] text-[1.6em] leading-none align-[-0.12em]" style={{ WebkitTextStroke: 0 }}>♥</span></span>}
        </p>
        <div className="mt-3 grid grid-cols-[3fr_1.6fr_5fr] border-y border-dashed border-[#bbb] py-1.5 text-[12px] text-[#888]">
          <span>일자</span><span className="text-right">회차</span><span className="pl-4">메모</span>
        </div>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-[#bbb]">이번 달 사용 내역이 없어요.</p>
        ) : (
          <ul className="py-1 font-mono text-[14px] tabular-nums">
            {shown.map((r, i) => (
              <li key={i} className="grid grid-cols-[3fr_1.6fr_5fr] items-center py-1">
                <span className="text-[#444]">{md(r.day)}</span>
                <span className="text-right text-[var(--brand)]">{start + i + 1}회</span>
                <span className="pl-4 font-sans text-[11px] leading-[1.3] text-[#999] break-keep">{r.memo}</span>
              </li>
            ))}
          </ul>
        )}
        {pages > 1 && (
          <div className="flex items-center justify-center gap-1 pt-1 pb-1 text-[12px]">
            <button type="button" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              className="w-7 h-7 rounded-full text-[#888] hover:bg-[#f4f4f5] disabled:opacity-30" aria-label="앞 쪽(최근)">‹</button>
            {Array.from({ length: pages }, (_, i) => (
              <button key={i} type="button" onClick={() => setPage(i)}
                className={`min-w-7 h-7 px-1.5 rounded-full tabular-nums ${page === i ? 'bg-[var(--brand)] text-white' : 'text-[#888] hover:bg-[#f4f4f5]'}`}>{i + 1}</button>
            ))}
            <button type="button" onClick={() => setPage(p => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1}
              className="w-7 h-7 rounded-full text-[#888] hover:bg-[#f4f4f5] disabled:opacity-30" aria-label="뒤 쪽(지난 내역)">›</button>
          </div>
        )}
        <p className="mt-2 border-t border-dashed border-[#bbb] pt-2 text-right text-[13px] text-[#27272a]">
          이번 달 <span className={`text-[16px] tabular-nums ${limit && used >= limit ? 'text-[#e11d48]' : 'text-[var(--brand)]'}`}>{used}</span>회 사용
          {!!limit && <span className="ml-1 text-[11px] text-[#999]">/ 한 달 {limit}회</span>}
        </p>
      </div>
    </div>
  );
}
