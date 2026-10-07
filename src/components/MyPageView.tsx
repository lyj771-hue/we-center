'use client';

import type { MyChild, MyLesson, MyPayment } from '@/lib/mypage';
import { addDays, parseYmd, thisMonday } from '@/lib/schedule';

// 마이페이지 화면(보호자) — 데이터는 app/mypage/page.tsx 가 불러와서 넘긴다.

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const PAY_ROW_LABEL: Record<MyPayment['method'], string> = { voucher: '바우처', gusen: '굳센', kkumideun: '꿈이든', prepaid: '차감(선결제)' };
const PAY_LABEL: Record<string, string> = { b: '바우처', e: '굳센', c: '꿈이든' };
const payKind = (p: string) => {
  const code = p.toLowerCase().replace(/[x~]/g, '');
  return code.includes('b') ? 'b' : code.includes('e') ? 'e' : code.includes('c') ? 'c' : 'etc';
};
const payName = (k: string) => PAY_LABEL[k] ?? '기타 결제';
export const MYPAGE_CARD = 'bg-white rounded-[18px] shadow-[0_2px_6px_rgba(0,0,0,0.05),0_10px_24px_rgba(0,0,0,0.05)] p-5 md:p-7';

export interface MyPageViewProps {
  child: MyChild | null;
  nickname?: string;
  approved: boolean;
  week: string;
  setWeek: (fn: (w: string) => string) => void;
  weekLessons: MyLesson[];
  payments: MyPayment[];
  today: string;
  failed?: string;
}

export default function MyPageView({ child, nickname, approved, week, setWeek, weekLessons, payments, today, failed }: MyPageViewProps) {
  // 결제 현황 — 쓰는 결제(제공·충전 횟수가 있거나 이미 쓴 것)만
  const payRows = payments.filter(p => p.total > 0 || p.used > 0);

  const card = MYPAGE_CARD;

  const days = [0, 1, 2, 3, 4, 5].map(i => addDays(week, i));
  const ws = parseYmd(week);
  const we = parseYmd(addDays(week, 5));
  const monthNo = parseYmd(today).getMonth() + 1;

  return (
    <div className="space-y-6">
      {failed && <p className="text-[13px] text-red-400">불러오지 못했어요. ({failed})</p>}

      {/* 아이 */}
      <section className={card}>
        <p className="text-[12px] text-[#999] mb-1">우리 아이</p>
        <p className="text-[22px] text-[var(--brand)]">
          {child?.childName ? `${child.childNumber ?? ''}${child.childName}` : nickname}
          {child?.memberCode && <span className="ml-2 text-[13px] text-[#999] tabular-nums">{child.memberCode}</span>}
        </p>
        {!approved && <p className="text-[13px] text-[#f59e0b] mt-2">센터에서 승인하면 수업 신청을 할 수 있어요.</p>}
        {!child?.memberCode && <p className="text-[13px] text-[#999] mt-2">아직 센터 회원 정보와 연결되지 않았어요. 연결되면 시간표가 보여요.</p>}
      </section>

      {/* 결제 현황 — 바우처·굳센·꿈이든은 이번 달 사용/제공, 차감(선결제)은 지금까지 사용/충전 */}
      <section className={card}>
        <h2 className="text-[17px] text-[#27272a] mb-1">결제 현황</h2>
        <p className="text-[12px] text-[#999] mb-4">바우처·굳센·꿈이든은 {monthNo}월 기준, 차감은 충전한 횟수 기준이에요.</p>
        {payRows.length === 0 ? <p className="text-[13px] text-[#bbb]">등록된 결제가 없어요.</p> : (
          <table className="w-full text-[15px]">
            <tbody>
              {payRows.map(p => (
                <tr key={p.method} className="border-t border-[#f0f0f0] first:border-t-0">
                  <td className="py-2.5">{PAY_ROW_LABEL[p.method]}</td>
                  <td className={`py-2.5 text-right tabular-nums ${p.total && p.used >= p.total ? 'text-[#e11d48]' : 'text-[var(--brand)]'}`}>
                    {p.used} <span className="text-[#bbb]">/</span> {p.total}
                    <span className="text-[12px] text-[#999] ml-1">회</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* 주별 시간표 */}
      <section className={card}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[17px] text-[#27272a]">주별 시간표</h2>
          <div className="flex items-center gap-1.5 text-[13px]">
            <button onClick={() => setWeek(w => addDays(w, -7))} aria-label="지난주" className="w-8 h-8 border border-[#e5e5e5] rounded-full">‹</button>
            <span className="min-w-[120px] text-center tabular-nums">{ws.getMonth() + 1}/{ws.getDate()} ~ {we.getMonth() + 1}/{we.getDate()}</span>
            <button onClick={() => setWeek(w => addDays(w, 7))} aria-label="다음주" className="w-8 h-8 border border-[#e5e5e5] rounded-full">›</button>
            {week !== thisMonday() && <button onClick={() => setWeek(() => thisMonday())} className="ml-1 text-[12px] text-[#888] underline underline-offset-2">이번 주</button>}
          </div>
        </div>
        <div className="divide-y divide-[#f0f0f0]">
          {days.map(d => {
            const list = weekLessons.filter(l => l.day === d && l.status !== 'none' && l.status !== 'off' && l.status !== 'undecided');
            const dd = parseYmd(d);
            return (
              <div key={d} className={`flex gap-3 py-3 ${d === today ? 'bg-[#f8fbff] -mx-3 px-3 rounded-lg' : ''}`}>
                <div className="w-[64px] shrink-0 text-[13px] text-[#71717b] pt-0.5 whitespace-nowrap">{DOW[dd.getDay()]} <span className="text-[#b4b4bb]">{dd.getMonth() + 1}/{dd.getDate()}</span></div>
                <div className="flex-1 space-y-1.5">
                  {list.length === 0 && <span className="text-[13px] text-[#d4d4d8]">수업 없음</span>}
                  {list.map((l, i) => (
                    <div key={i} className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] ${l.moved || l.status === 'cancelled' ? 'text-[#bbb] line-through' : 'text-[#27272a]'}`}>
                      <span className="tabular-nums">{l.time}</span>
                      <span>{l.teacher} 선생님</span>
                      {l.oral && <span className="text-[11px] text-[#8b5cf6]">구강</span>}
                      <span className="text-[11px] px-1.5 rounded border border-[#eee] text-[#888]">{l.source === 'booking' ? '신청' : l.side === 'fixed' ? '고정' : '빈타임'}</span>
                      {l.payment.replace(/[x~]/gi, '') && <span className="text-[11px] text-[#999]">{payName(payKind(l.payment))}</span>}
                      {l.absent && <span className="text-[11px] text-white bg-[#a1a1aa] px-1.5 rounded">결석</span>}
                      {l.status === 'cancel_requested' && <span className="text-[11px] text-[#b45309] bg-[#fef3c7] px-1.5 rounded">취소 신청 중</span>}
                      {l.status === 'cancelled' && <span className="text-[11px] no-underline">취소</span>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
