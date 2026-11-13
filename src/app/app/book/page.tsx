'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useApp } from '@/components/app/AppShell';
import ScheduleGate from '@/components/schedule/ScheduleGate';
import type { ScheduleSummary } from '@/lib/schedule';
import { isPublished, listSchedules, scheduleDays, scheduleRange, thisMonday } from '@/lib/schedule';

// 보호자 앱 — 수업신청 탭: 이 지점 수업스케쥴 목록. 누르면 /app/book/[id] 에서 시간을 눌러 선착순 신청(홈페이지와 같은 화면·규칙)

export default function AppBook() {
  const { branch } = useApp();
  const [items, setItems] = useState<ScheduleSummary[] | null>(null);
  useEffect(() => {
    listSchedules()
      .then(list => setItems(list.filter(s => s.center === branch && !s.hiddenAt && isPublished(s))))
      .catch(() => setItems([]));
  }, [branch]);

  // 지난 스케쥴(마지막 날이 이번 주 월요일보다 전)은 아래쪽에 흐리게
  const past = (s: ScheduleSummary) => (scheduleDays(s).at(-1) ?? '') < thisMonday();
  const now = (items ?? []).filter(s => !past(s));
  const old = (items ?? []).filter(past).slice(0, 5);

  const Item = ({ s, dim }: { s: ScheduleSummary; dim?: boolean }) => (
    <Link href={`/app/book/${s.id}`} className={`flex items-center justify-between gap-3 bg-white rounded-[18px] p-[18px] ${dim ? 'opacity-50' : ''}`}>
      <span className="min-w-0 space-y-1">
        <span className="block text-[15px] text-[#27272a] truncate">{s.title}</span>
        <span className="block text-[12px] text-[#888]">{scheduleRange(s)}</span>
      </span>
      <span className={`shrink-0 text-[13px] ${dim ? 'text-[#999]' : 'text-[var(--brand)]'}`}>{dim ? '보기 ›' : '신청하기 ›'}</span>
    </Link>
  );

  return (
    <ScheduleGate center={branch}>
      <div className="space-y-4">
        <section className="bg-white rounded-[18px] p-[18px] space-y-1.5">
          <h1 className="display-heading text-[19px]! leading-[1.4]! text-[var(--brand)]">빈 수업 신청</h1>
          <p className="text-[13px] leading-[1.8] text-[#666]">선착순이에요. 신청 취소는 센터로 연락해 주세요.</p>
        </section>
        {items === null ? (
          <p className="py-10 text-center text-[13px] text-[#bbb]">불러오는 중…</p>
        ) : now.length === 0 ? (
          <p className="py-10 text-center text-[14px] text-[#aaa]">지금 신청할 수 있는 수업이 없어요.</p>
        ) : now.map(s => <Item key={s.id} s={s} />)}
        {old.length > 0 && (
          <>
            <h2 className="pt-3 px-1 text-[12px] text-[#999]">지난 스케쥴</h2>
            {old.map(s => <Item key={s.id} s={s} dim />)}
          </>
        )}
      </div>
    </ScheduleGate>
  );
}
