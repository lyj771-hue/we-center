import PostBoard from '@/components/PostBoard';
import NoticeBar from '@/components/NoticeBar';
import type { Metadata } from 'next';
import { NOTICES } from '@/lib/content';
import PageShell, { PageTitle } from '@/components/PageShell';

export const metadata: Metadata = { title: '공지사항' };

// 공지사항 — 제목 목록(기타와 같은 모양)
export default function NoticesPage() {
  return (
    <PageShell page="notices" heading={NOTICES.heading} subtext={NOTICES.subtext} defaultWidth={1024}>
      <div className="max-w-[var(--page-w)] mx-auto px-8 pt-8 pb-14 md:pt-14">
        <PageTitle eyebrow={NOTICES.eyebrow} className="mb-12" />
        <PostBoard category="notices" basePath="/notices" />
      </div>
      <NoticeBar />
    </PageShell>
  );
}
