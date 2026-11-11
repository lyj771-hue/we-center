import PostBoard from '@/components/PostBoard';
import ScheduleGate from '@/components/schedule/ScheduleGate';
import NoticeBar from '@/components/NoticeBar';
import type { Metadata } from 'next';
import { NOTICES } from '@/lib/content';
import PageShell, { PageTitle } from '@/components/PageShell';

export const metadata: Metadata = { title: '공지사항' };

// 공지사항 — 제목 목록(기타와 같은 모양)
export default function NoticesPage() {
  return (
    <PageShell page="notices" heading={NOTICES.heading} subtext={NOTICES.subtext} defaultWidth={1024}>
      {/* 공지사항은 굵게(전체 외곽선 볼드) 말고 보통 두께로 */}
      <div className="max-w-[var(--page-w)] mx-auto px-8 pt-5 pb-10 md:pt-8 [-webkit-text-stroke:0]">
        <PageTitle eyebrow={NOTICES.eyebrow} className="mb-6" />
        <ScheduleGate view><PostBoard category="notices" basePath="/notices" /></ScheduleGate>
      </div>
      <NoticeBar />
    </PageShell>
  );
}
