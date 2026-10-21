import PostBoard from '@/components/PostBoard';
import NoticeBar from '@/components/NoticeBar';
import type { Metadata } from 'next';
import { WE_THOUGHTS } from '@/lib/content';
import PageShell, { PageTitle } from '@/components/PageShell';

export const metadata: Metadata = { title: 'We재활생각' };

// We재활생각 — 메모 보드(예전 공지사항 모양)
export default function WeThoughtsPage() {
  return (
    <PageShell page="we-thoughts" heading={WE_THOUGHTS.heading} subtext={WE_THOUGHTS.subtext} defaultWidth={1024} widthAdjustable={false}>
      <div className="note-board-bg px-6 pt-16 pb-20 md:px-8 md:pt-20 md:pb-[100px]">
        <PageTitle eyebrow={WE_THOUGHTS.eyebrow} variant="notice" className="mb-16 md:mb-20" />
        <PostBoard category="thoughts" basePath="/we-thoughts" variant="notes" />
      </div>
      <NoticeBar />
    </PageShell>
  );
}
