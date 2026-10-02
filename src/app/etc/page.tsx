import PostBoard from '@/components/PostBoard';
import type { Metadata } from 'next';
import { ETC } from '@/lib/content';
import PageShell, { PageTitle } from '@/components/PageShell';

export const metadata: Metadata = { title: '기타' };

export default function EtcPage() {
  return (
    <PageShell page="etc" heading={ETC.heading} subtext={ETC.subtext} defaultWidth={768}>
      <div className="max-w-[var(--page-w)] mx-auto px-8 pt-8 pb-14 md:pt-14">
        <PageTitle eyebrow={ETC.eyebrow} className="mb-12" />
        <PostBoard category="etc" basePath="/etc" />
      </div>
    </PageShell>
  );
}
