'use client';

import { useEffect, useState } from 'react';
import MemoCell from './MemoCell';

// 결제별 사용 카드(바우처·굳센·꿈이든·장맞춤·우진학교·지원금) — 선결제 카드와 같은 모양. 사용 기록: 일자 · 시간 · 그 달 회차 · 메모. 지난 달 기록도 쌓인다.
// 시간 = 그 수업 시간(선생님 이름 없이) — 선결제 카드처럼 일자 바로 오른쪽, 메모와 같은 글씨.
// 1쪽이 가장 최근 3줄 — 최근 날짜가 위.

/** nth = 그 달 몇 번째 사용인지 (매월 1회부터) */
/** due = 결제가 더 필요한 수업(굳센3회차미납) — 빨간 '결제필요' */
/** money 카드(우진학교·지원금)는 delta = 변동 금액(원, 충전 +·사용 −), left = 그 뒤 잔여 금액(원, 모르면 없음) */
export interface UsageRow { day: string; nth: number; time?: string; memo?: string; due?: boolean; retro?: boolean; delta?: number; left?: number }

/** 열 — 일자 · 시간 · 회차 · 메모 / 금액 카드: 일자 · 시간 · 변동 · 잔여 · 메모 */
const COLS = 'grid-cols-[2.7fr_1.6fr_1.5fr_2.9fr]';
const MONEY_COLS = 'grid-cols-[2.5fr_1.5fr_1.6fr_1.6fr_2.6fr]';
/** 금액을 만원 단위로 짧게 — 60000 → 6만, 65000 → 6.5만 */
const man = (n: number) => { const v = Math.abs(n) / 10000; return n === 0 ? '0' : `${Number.isInteger(v) ? v : v.toFixed(1).replace(/\.0$/, '')}만`; };

const PER_PAGE = 3;

export default function UsageCard({ label, rows, name, used, limit, balance, money }: {
  label: string;
  rows: UsageRow[];
  name?: string;
  /** 이번 달 사용 횟수 (관리자가 고쳐 적었으면 그 값) */
  used: number;
  /** 한 달 제공 횟수 (0 = 없음) */
  limit?: number;
  /** 지원금처럼 금액으로 보는 결제 — 맨 아래에 남은 금액(원) */
  balance?: number;
  /** 우진학교·지원금 — 회차 대신 변동·잔여(금액) */
  money?: boolean;
}) {
  const cols = money ? MONEY_COLS : COLS;
  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [rows.length]);
  // 최근 날짜가 위 — 뒤집어서 3줄씩
  const shown = [...rows].reverse().slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);
  const md = (d: string) => `${d.slice(2, 4)}/${d.slice(5, 7)}/${d.slice(8, 10)}`;

  return (
    <div className="relative mx-auto max-w-[380px] rounded-[16px] border border-[#e4e4e7] bg-white px-5 pt-5 pb-4 shadow-[0_2px_10px_rgba(0,0,0,0.06)] overflow-hidden">
      <img src="/logo-we-heart.png" alt="" aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 w-40 -translate-x-1/2 -translate-y-1/2 opacity-[0.06]" />
      <div className="relative">
        <p className="text-[12px] text-[#999] mt-0.5">
          {name && <span className="text-[#555]">{name} 님<span aria-hidden="true" className="ml-1 text-[#e11d48] text-[1.6em] leading-none align-[-0.12em]" style={{ WebkitTextStroke: 0 }}>♥</span></span>}
        </p>
        <div className={`mt-3 grid ${cols} border-y border-dashed border-[#bbb] py-1.5 text-[12px] text-[#888] whitespace-nowrap`}>
          {money
            ? <><span>일자</span><span className="text-center">시간</span><span className="text-right">변동</span><span className="text-right">잔여</span><span className="pl-2">메모</span></>
            : <><span>일자</span><span className="text-center">시간</span><span className="text-center">회차</span><span className="pl-2">메모</span></>}
        </div>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-[#bbb]">사용 내역이 없어요.</p>
        ) : (
          <ul className="py-1 font-mono text-[14px] tabular-nums">
            {shown.map((r, i) => (
              <li key={i} className={`grid ${cols} items-center py-1`}>
                <span className="text-[#444]">{md(r.day)}</span>
                {/* 시간 — 일자 바로 오른쪽, 메모와 같은 글씨 */}
                <span className="text-center font-sans text-[10px] leading-[1.6] text-[#999] whitespace-pre-wrap">{r.time ?? ''}</span>
                {money ? <>
                  {/* 변동 · 잔여 — 만원 단위 (충전 파랑 · 사용 회색) */}
                  <span className={`text-right text-[13px] ${r.delta === undefined ? '' : r.delta > 0 ? 'text-[var(--brand)]' : 'text-[#555]'}`}>{r.delta === undefined ? '' : `${r.delta > 0 ? '+' : r.delta < 0 ? '−' : ''}${man(r.delta)}`}</span>
                  <span className={`text-right text-[13px] ${r.left !== undefined && r.left <= 0 ? 'text-[#e11d48]' : 'text-[#27272a]'}`}>{r.left === undefined ? '' : man(r.left)}</span>
                </> : (
                <span className={`text-center leading-tight ${r.retro || r.due ? 'text-[#d97706]' : 'text-[var(--brand)]'}`}>
                  {r.nth}회
                  {r.retro && <span className="block font-sans text-[9px] text-[#d97706]">소급</span>}
                  {r.due && <span className="block font-sans text-[9px] text-[#d97706]">결제필요</span>}
                </span>)}
                {/* 메모 — 선결제 카드와 같은 글씨 */}
                <MemoCell memo={r.memo} day={r.day} className="pl-2 font-sans text-[10px] leading-[1.6] text-[#999] break-keep" />
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
        {balance !== undefined ? (
          <p className="mt-2 border-t border-dashed border-[#bbb] pt-2 text-right text-[13px] text-[#27272a]">
            남은 금액 <span className="text-[16px] tabular-nums text-[var(--brand)]">{balance.toLocaleString('ko-KR')}</span>원
          </p>
        ) : (
        <p className="mt-2 border-t border-dashed border-[#bbb] pt-2 text-right text-[13px] text-[#27272a]">
          이번 달 <span className={`text-[16px] tabular-nums ${limit && used >= limit ? 'text-[#e11d48]' : 'text-[var(--brand)]'}`}>{used}</span>회 사용
          {!!limit && <span className="ml-1 text-[11px] text-[#999]">/ 한 달 {limit}회</span>}
        </p>
        )}
      </div>
    </div>
  );
}
