import PostBoard from '@/components/PostBoard';
import NoticeBar from '@/components/NoticeBar';
import type { Metadata } from 'next';
import { NOTICES } from '@/lib/content';
import PageShell, { PageTitle } from '@/components/PageShell';

export const metadata: Metadata = { title: '공지사항' };

export default function NoticesPage() {
  return (
    <PageShell page="notices" heading={NOTICES.heading} subtext={NOTICES.subtext} defaultWidth={1024} widthAdjustable={false}>
      <div className="note-board-bg px-6 pt-16 pb-20 md:px-8 md:pt-20 md:pb-[100px]">
        <PageTitle eyebrow={NOTICES.eyebrow} variant="notice" className="mb-16 md:mb-20" />
        <PostBoard category="notices" basePath="/notices" variant="notes" />
      </div>
      <NoticeBar />
    </PageShell>
  );
}
