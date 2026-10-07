'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdmin } from '@/components/AdminContext';
import { useMember } from '@/components/MemberContext';
import MyPageView, { MYPAGE_CARD } from '@/components/MyPageView';
import type { MyChild, MyLesson } from '@/lib/mypage';
import { getMyChild, getMyLessons } from '@/lib/mypage';
import { addDays, parseYmd, thisMonday, toYmd } from '@/lib/schedule';

// 마이페이지(보호자) — 내 아이 정보, 지원(바우처·굳센·꿈이든 …) 현황, 이번 달 차감 현황, 주별 시간표.
// 수업은 관리자 시간표(고정·그날 바꾼 칸)와 수업스케쥴 신청을 합친 것 — 센터 시간표와 늘 같다. 화면은 MyPageView.

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

  const wrap = (body: React.ReactNode) => (
    <div className="max-w-[720px] mx-auto px-4 pt-8 pb-14 md:pt-14 fade-up">
      <h1 className="display-heading mb-8">마이페이지</h1>
      {body}
    </div>
  );

  if (isAdmin) return wrap(<p className="text-[14px] text-[#888]">마이페이지는 보호자 계정으로 로그인하면 보여요.</p>);
  if (loading) return wrap(<p className="text-[14px] text-[#aaa]">불러오는 중…</p>);
  if (!userId) return wrap(
    <div className={`${MYPAGE_CARD} text-center space-y-4`}>
      <p className="text-[15px] text-[#555]">로그인하면 우리 아이 수업과 지원 현황을 볼 수 있어요.</p>
      <button onClick={login} className="bg-[#e11d48] text-white text-[15px] px-6 py-3 rounded-full hover:opacity-90">카카오 로그인/회원가입</button>
    </div>,
  );

  return wrap(
    <MyPageView child={child} nickname={profile?.nickname} approved={!!profile?.approvedAt} week={week} setWeek={setWeek}
      weekLessons={weekLessons} monthLessons={monthLessons} today={today} failed={failed} />,
  );
}
