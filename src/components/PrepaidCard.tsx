'use client';

import { useEffect, useState } from 'react';
import type { LedgerRow } from '@/lib/prepaid';

/** 한 쪽에 보이는 줄 수 — 1쪽이 가장 최근 3줄 */
const PER_PAGE = 3;

// 선결제 카드 — 센터에서 쓰던 종이 카드 모양 그대로(일자 · 충전/사용 · 남은 횟수). 마이페이지와 회원 관리에서 같이 쓴다.
// 메모가 있는 줄은 아래에 작게 메모를 보여 준다. 고치기·지우기는 회원 관리의 선결제 창 [수정]에서 한다.

export default function PrepaidCard({ rows, name, editingId }: {
  rows: LedgerRow[];
  name?: string;
  /** 관리자가 고치는 중인 기록 (노랗게) */
  editingId?: string;
}) {
  const left = rows.length ? rows[rows.length - 1].balance : 0;
  // 쪽 나누기 — 뒤(최근)에서부터 3줄씩. 0쪽 = 최근 3줄
  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [rows.length]);
  const end = rows.length - page * PER_PAGE;
  const shown = rows.slice(Math.max(0, end - PER_PAGE), end);
  const md = (d: string) => `${d.slice(2, 4)}/${d.slice(5, 7)}/${d.slice(8, 10)}`;   // 26/10/11
  return (
    <div className="relative mx-auto max-w-[380px] rounded-[16px] border border-[#e4e4e7] bg-white px-5 pt-5 pb-4 shadow-[0_2px_10px_rgba(0,0,0,0.06)] overflow-hidden">
      <img src="/logo-we.jpg" alt="" aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 w-40 -translate-x-1/2 -translate-y-1/2 opacity-[0.06]" />
      <div className="relative">
        <p className="text-[14px] text-[#27272a]">WE 소아재활센터</p>
        <p className="text-[12px] text-[#999] mt-0.5 tabular-nums">
          {/* 홈 화면 인사("○○님 오셨군요♥")와 같은 하트 */}
          {name && <span className="text-[#555]">{name}님<span aria-hidden="true" className="ml-1 text-[#e11d48] text-[1.6em] leading-none align-[-0.12em]" style={{ WebkitTextStroke: 0 }}>♥</span></span>}
        </p>
        <div className="mt-3 grid grid-cols-[3fr_2.3fr_1.9fr_3.4fr] border-y border-dashed border-[#bbb] py-1.5 text-[12px] text-[#888]">
          <span>일자</span><span className="text-right">충전·사용</span><span className="text-right">잔여</span><span className="pl-3">메모</span>
        </div>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-[#bbb]">아직 충전·사용 내역이 없어요.</p>
        ) : (
          <ul className="py-1 font-mono text-[14px] tabular-nums">
            {shown.map((r, i) => (
              <li key={i} className={`grid grid-cols-[3fr_2.3fr_1.9fr_3.4fr] items-center py-1 ${editingId && r.chargeId === editingId ? 'bg-[#fff6d5] -mx-2 px-2 rounded' : ''}`}>
                <span className="text-[#444]">{md(r.day)}</span>
                <span className={`text-right ${r.kind === 'charge' ? 'text-[var(--brand)]' : r.kind === 'adjust' ? 'text-[#b45309]' : 'text-[#555]'}`}>
                  {r.kind === 'charge' ? `+${r.count}` : r.kind === 'use' ? `-${r.count}` : <><span className="font-sans text-[10px] mr-0.5">수정</span>{r.count > 0 ? `+${r.count}` : r.count}</>}
                </span>
                <span className={`text-right ${r.balance <= 0 ? 'text-[#e11d48]' : 'text-[#27272a]'}`}>{r.balance}</span>
                {/* 메모는 남은 횟수 오른쪽 — 예전 차감 기록의 기본 메모 "차감"은 줄 이름과 같아서 숨긴다 */}
                <span className="pl-3 font-sans text-[11px] leading-[1.3] text-[#999] break-keep">{r.memo && r.memo !== '차감' ? r.memo : ''}</span>
              </li>
            ))}
          </ul>
        )}
        {/* 쪽 번호 — 1쪽이 가장 최근 3줄(쪽 안에서는 날짜 순), 2쪽은 그 전 3줄 … */}
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
          잔여 <span className={`text-[16px] tabular-nums ${left <= 0 ? 'text-[#e11d48]' : 'text-[var(--brand)]'}`}>{left}</span>회
        </p>
      </div>
    </div>
  );
}
