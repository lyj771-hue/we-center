'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdmin } from '@/components/AdminContext';
import { useMember } from '@/components/MemberContext';
import type { MyChild, MyLesson } from '@/lib/mypage';
import { getMyChild, getMyLessons, isRealLesson } from '@/lib/mypage';
import { addDays, parseYmd, thisMonday, toYmd } from '@/lib/schedule';

// 마이페이지(보호자) — 내 아이 정보, 지원(바우처·굳센·꿈이든 …) 현황, 이번 달 차감 현황, 주별 시간표.
// 수업은 관리자 시간표(고정·그날 바꾼 칸)와 수업스케쥴 신청을 합친 것 — 센터 시간표와 늘 같다.

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const SUPPORTS = [
  { key: 'voucher', label: '바우처', code: 'b' },
  { key: 'gusen', label: '굳센', code: 'e' },
  { key: 'kkumideun', label: '꿈이든', code: 'c' },
  { key: 'woojin', label: '우진학교', code: '' },
  { key: 'subsidy', label: '지원금', code: '' },
] as const;
const PAY_LABEL: Record<string, string> = { b: '바우처', e: '굳센', c: '꿈이든' };
const payKind = (p: string) => {
  const code = p.toLowerCase().replace(/[x~]/g, '');
  return code.includes('b') ? 'b' : code.includes('e') ? 'e' : code.includes('c') ? 'c' : 'etc';
};
const payName = (k: string) => PAY_LABEL[k] ?? '그 밖(카드·현금 등)';

export default function MyPage() {
  const { isAdmin } = useAdmin();
  const { userId, profile, loading, login } = useMember();
  const [child, setChild] = useState<MyChild | null>(null);
  const [week, setWeek] = useState(thisMonday());
  const [weekLessons, setWeekLessons] = useState<MyLesson[]>([]);
  const [monthLessons, setMonthLessons] = useState<MyLesson[]>([]);
  const [failed, setFailed] = useState('');

  const today = toYmd(new Date());
  const monthStart = today.slice(0, 8) + '01';
  const monthEnd = useMemo(() => { const d = parseYmd(monthStart); d.setMonth(d.getMonth() + 1, 0); return toYmd(d); }, [monthStart]);

  const load = useCallback(async () => {
    try {
      const [c, w, m] = await Promise.all([getMyChild(), getMyLessons(week, addDays(week, 5)), getMyLessons(monthStart, monthEnd)]);
      setChild(c); setWeekLessons(w); setMonthLessons(m); setFailed('');
    } catch (e) {
      setFailed((e as Error).message);
    }
  }, [week, monthStart, monthEnd]);
  useEffect(() => { if (userId && profile) load(); }, [userId, profile, load]);

  // 이번 달 결제별 — 지난 수업(차감됨)·남은 수업·결석
  const usage = useMemo(() => {
    const m = new Map<string, { done: number; left: number; absent: number }>();
    for (const l of monthLessons) {
      if (!isRealLesson(l)) continue;
      const k = payKind(l.payment);
      const u = m.get(k) ?? { done: 0, left: 0, absent: 0 };
      if (l.absent) u.absent++;
      else if (l.day < today) u.done++;
      else u.left++;
      m.set(k, u);
    }
    return [...m.entries()].sort(([a], [b]) => ['b', 'e', 'c', 'etc'].indexOf(a) - ['b', 'e', 'c', 'etc'].indexOf(b));
  }, [monthLessons, today]);

  const card = 'bg-white rounded-[18px] shadow-[0_2px_6px_rgba(0,0,0,0.05),0_10px_24px_rgba(0,0,0,0.05)] p-5 md:p-7';
  const wrap = (body: React.ReactNode) => (
    <div className="max-w-[720px] mx-auto px-4 pt-8 pb-14 md:pt-14 fade-up">
      <h1 className="display-heading mb-8">마이페이지</h1>
      {body}
    </div>
  );

  if (isAdmin) return wrap(<p className="text-[14px] text-[#888]">마이페이지는 보호자 계정으로 로그인하면 보여요.</p>);
  if (loading) return wrap(<p className="text-[14px] text-[#aaa]">불러오는 중…</p>);
  if (!userId) return wrap(
    <div className={`${card} text-center space-y-4`}>
      <p className="text-[15px] text-[#555]">로그인하면 우리 아이 수업과 지원 현황을 볼 수 있어요.</p>
      <button onClick={login} className="bg-[#e11d48] text-white text-[15px] px-6 py-3 rounded-full hover:opacity-90">카카오 로그인/회원가입</button>
    </div>,
  );

  const days = [0, 1, 2, 3, 4, 5].map(i => addDays(week, i));
  const ws = parseYmd(week);
  const we = parseYmd(addDays(week, 5));
  const monthNo = parseYmd(today).getMonth() + 1;

  return wrap(
    <div className="space-y-6">
      {failed && <p className="text-[13px] text-red-400">불러오지 못했어요. ({failed})</p>}

      {/* 아이 */}
      <section className={card}>
        <p className="text-[12px] text-[#999] mb-1">우리 아이</p>
        <p className="text-[22px] text-[var(--brand)]">
          {child?.childName ? `${child.childNumber ?? ''}${child.childName}` : profile?.nickname}
          {child?.memberCode && <span className="ml-2 text-[13px] text-[#999] tabular-nums">{child.memberCode}</span>}
        </p>
        {!profile?.approvedAt && <p className="text-[13px] text-[#f59e0b] mt-2">센터에서 승인하면 수업 신청을 할 수 있어요.</p>}
        {!child?.memberCode && <p className="text-[13px] text-[#999] mt-2">아직 센터 회원 정보와 연결되지 않았어요. 연결되면 시간표가 보여요.</p>}
      </section>

      {/* 지원 현황 */}
      <section className={card}>
        <h2 className="text-[17px] text-[#27272a] mb-3">지원 현황</h2>
        <div className="flex flex-wrap gap-2">
          {SUPPORTS.map(s => {
            const on = child?.supports[s.key] || (s.code && child?.payment.includes(s.code));
            return (
              <span key={s.key} className={`text-[13px] px-3 py-1.5 rounded-full border ${on ? 'border-[var(--brand)] bg-[#e8f1fd] text-[var(--brand)]' : 'border-[#e5e5e5] text-[#c4c4cc]'}`}>
                {on ? '✓ ' : ''}{s.label}
              </span>
            );
          })}
        </div>
      </section>

      {/* 이번 달 차감 현황 */}
      <section className={card}>
        <h2 className="text-[17px] text-[#27272a] mb-1">{monthNo}월 차감 현황</h2>
        <p className="text-[12px] text-[#999] mb-4">센터 시간표 기준이에요. 결석은 따로 셌어요.</p>
        {usage.length === 0 ? <p className="text-[13px] text-[#bbb]">이번 달 수업이 없어요.</p> : (
          <table className="w-full text-[14px]">
            <thead>
              <tr className="text-[12px] text-[#999] text-left">
                <th className="font-normal py-1.5">결제</th><th className="font-normal">지난 수업(차감)</th><th className="font-normal">남은 수업</th><th className="font-normal">결석</th>
              </tr>
            </thead>
            <tbody>
              {usage.map(([k, u]) => (
                <tr key={k} className="border-t border-[#f0f0f0]">
                  <td className="py-2">{payName(k)}</td>
                  <td className="tabular-nums">{u.done}회</td>
                  <td className="tabular-nums">{u.left}회</td>
                  <td className="tabular-nums text-[#999]">{u.absent}회</td>
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
            {week !== thisMonday() && <button onClick={() => setWeek(thisMonday())} className="ml-1 text-[12px] text-[#888] underline underline-offset-2">이번 주</button>}
          </div>
        </div>
        <div className="divide-y divide-[#f0f0f0]">
          {days.map(d => {
            const list = weekLessons.filter(l => l.day === d && l.status !== 'none' && l.status !== 'off' && l.status !== 'undecided');
            const dd = parseYmd(d);
            return (
              <div key={d} className={`flex gap-3 py-3 ${d === today ? 'bg-[#f8fbff] -mx-3 px-3 rounded-lg' : ''}`}>
                <div className="w-[56px] shrink-0 text-[13px] text-[#71717b] pt-0.5">{DOW[dd.getDay()]} <span className="text-[#b4b4bb]">{dd.getMonth() + 1}/{dd.getDate()}</span></div>
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
    </div>,
  );
}
