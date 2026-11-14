'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { ScheduleSummary } from '@/lib/schedule';
import { isPublished, listSchedules, scheduleDays, scheduleRange, thisMonday } from '@/lib/schedule';
import { useApp } from './AppShell';

// 보호자 앱 [수업] 탭의 수업 신청 목록 — 이 지점 수업스케쥴. 누르면 /app/book/[id] 에서 시간을 눌러 선착순 신청
// 지난 스케쥴(마지막 날이 이번 주 월요일보다 전)은 [지난 스케쥴 보기]로 접어 둔다

export default function ScheduleList() {
  const { branch } = useApp();
  const [items, setItems] = useState<ScheduleSummary[] | null>(null);
  const [showOld, setShowOld] = useState(false);
  useEffect(() => {
    listSchedules()
      .then(list => setItems(list.filter(s => s.center === branch && !s.hiddenAt && isPublished(s))))
      .catch(() => setItems([]));
  }, [branch]);

  const past = (s: ScheduleSummary) => (scheduleDays(s).at(-1) ?? '') < thisMonday();
  const now = (items ?? []).filter(s => !past(s));
  const old = (items ?? []).filter(past).slice(0, 5);

  const row = (s: ScheduleSummary, dim?: boolean) => (
    <Link key={s.id} href={`/app/book/${s.id}`} className={`flex items-center justify-between gap-3 py-3.5 ${dim ? 'opacity-50' : ''}`}>
      <span className="min-w-0">
        <span className="block text-[15px] text-[#27272a] truncate">{s.title}</span>
        <span className="block text-[12px] text-[#888]">{scheduleRange(s)}</span>
      </span>
      <span className={`shrink-0 text-[13px] ${dim ? 'text-[#999]' : 'text-[var(--brand)]'}`}>{dim ? '보기 ›' : '신청하기 ›'}</span>
    </Link>
  );

  return (
    <section className="bg-white rounded-[18px] px-[18px] pt-[18px] pb-2">
      <h2 className="text-[17px] text-[#27272a]">수업 신청</h2>
      <p className="mt-1 text-[12px] text-[#888]">선착순이에요. 신청 취소는 센터로 연락해 주세요.</p>
      <div className="mt-2 divide-y divide-[#f0f0f0]">
        {items === null ? <p className="py-4 text-[13px] text-[#bbb]">불러오는 중…</p>
          : now.length === 0 ? <p className="py-4 text-[13px] text-[#aaa]">지금 신청할 수 있는 수업이 없어요.</p>
          : now.map(s => row(s))}
        {showOld && old.map(s => row(s, true))}
      </div>
      {old.length > 0 && (
        <button type="button" onClick={() => setShowOld(v => !v)} className="w-full py-3 text-[12px] text-[#999] border-t border-[#f0f0f0]">
          {showOld ? '지난 스케쥴 접기' : '지난 스케쥴 보기'}
        </button>
      )}
    </section>
  );
}
