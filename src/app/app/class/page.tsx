'use client';

import { useEffect, useState } from 'react';
import MyPageView from '@/components/MyPageView';
import { useApp } from '@/components/app/AppShell';
import { useMyWeek } from '@/components/app/useMyData';
import ScheduleList from '@/components/app/ScheduleList';
import type { MyLesson } from '@/lib/mypage';
import { getMyLessons, isRealLesson } from '@/lib/mypage';
import { parseYmd, thisMonday, toYmd } from '@/lib/schedule';

// 보호자 앱 — 수업 탭: 오늘 수업 + 수업 신청(수업스케쥴 목록) + 이번 주 수업(마이페이지 주별 시간표와 같은 화면)

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

export default function AppClass() {
  const { branch, child, version } = useApp();
  const today = toYmd(new Date());
  const [week, setWeek] = useState(thisMonday());
  const { lessons, failed } = useMyWeek(week);

  // 오늘 수업 — 주를 넘겨 봐도 맨 위는 늘 오늘
  const [todays, setTodays] = useState<MyLesson[]>([]);
  useEffect(() => {
    getMyLessons(today, today)
      .then(ls => setTodays(ls.filter(l => l.center === branch && isRealLesson(l) && !l.absent).sort((a, b) => a.time.localeCompare(b.time))))
      .catch(() => setTodays([]));
  }, [today, branch, version]);


  const d = parseYmd(today);
  return (
    <div className="space-y-4">
      <section className="bg-[var(--brand)] text-white rounded-[18px] p-5 space-y-3.5">
        <div className="flex justify-between items-baseline">
          <h2 className="text-[17px]">오늘 수업</h2>
          <span className="text-[13px] opacity-85">{d.getMonth() + 1}/{d.getDate()} ({DOW[d.getDay()]})</span>
        </div>
        {todays.length === 0 ? (
          <p className="text-[14px] opacity-85">오늘은 수업이 없어요.</p>
        ) : (
          <div className="space-y-2">
            {todays.map((l, i) => (
              <div key={i} className="flex items-center gap-3 bg-white/15 rounded-xl px-3.5 py-3">
                <span className="text-[20px] tabular-nums">{l.time}</span>
                <span className="text-[15px]">{l.teacher} 선생님</span>
                {l.oral && <span className="ml-auto text-[12px] opacity-85">구강</span>}
              </div>
            ))}
          </div>
        )}
      </section>

      <ScheduleList />

      <MyPageView only="week" child={child} approved week={week} setWeek={setWeek} weekLessons={lessons} payments={[]}
        today={today} center={branch} failed={failed} />
    </div>
  );
}
