'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import MyPageView from '@/components/MyPageView';
import { useApp } from '@/components/app/AppShell';
import { useMyWeek } from '@/components/app/useMyData';
import InstallHint from '@/components/app/InstallHint';
import PushToggle from '@/components/app/PushToggle';
import type { MyLesson } from '@/lib/mypage';
import { getMyLessons, isRealLesson } from '@/lib/mypage';
import type { ScheduleSummary } from '@/lib/schedule';
import { isPublished, listSchedules, parseYmd, scheduleDays, scheduleRange, thisMonday, toYmd } from '@/lib/schedule';

// 보호자 앱 — 홈 탭: 오늘 수업 + 이번 주 수업(마이페이지 주별 시간표와 같은 화면) + 열린 수업스케쥴 안내

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

export default function AppHome() {
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

  // 신청할 수 있는 수업스케쥴 — 이 지점, 숨기지 않았고 게시됐고 아직 안 지난 것
  const [open, setOpen] = useState<ScheduleSummary[]>([]);
  useEffect(() => {
    listSchedules()
      .then(list => setOpen(list.filter(s => s.center === branch && !s.hiddenAt && isPublished(s) && (scheduleDays(s).at(-1) ?? '') >= today)))
      .catch(() => setOpen([]));
  }, [branch, today]);

  const d = parseYmd(today);
  return (
    <div className="space-y-4">
      <InstallHint />
      <PushToggle banner />

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

      {open.length > 0 && (
        <Link href={open.length === 1 ? `/app/book/${open[0].id}` : '/app/book'} className="flex items-center justify-between bg-white rounded-[18px] p-[18px] text-[#27272a]">
          <span className="space-y-1 min-w-0">
            <span className="block text-[15px] truncate">{open.length === 1 ? open[0].title : `신청할 수 있는 수업이 ${open.length}개 있어요`}</span>
            <span className="block text-[12px] text-[#888]">{open.length === 1 ? `${scheduleRange(open[0])} · 선착순 신청` : '선착순 신청'}</span>
          </span>
          <span className="shrink-0 text-[13px] text-[var(--brand)]">신청하기 ›</span>
        </Link>
      )}

      <MyPageView only="week" child={child} approved week={week} setWeek={setWeek} weekLessons={lessons} payments={[]}
        today={today} center={branch} failed={failed} />
    </div>
  );
}
