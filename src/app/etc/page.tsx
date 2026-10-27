import PostBoard from '@/components/PostBoard';
import type { Metadata } from 'next';
import { ETC } from '@/lib/content';
import PageShell, { PageTitle } from '@/components/PageShell';

export const metadata: Metadata = { title: 'We당근당근' };

/** 당근 주황 */
const CARROT = '#ff6f0f';

export default function EtcPage() {
  return (
    <PageShell page="etc" heading={ETC.heading} subtext={ETC.subtext} defaultWidth={1024}>
      <div className="max-w-[var(--page-w)] mx-auto px-8 pt-8 pb-14 md:pt-14">
        {/* 맨 위 — We당근당근 로고 배너 (We슐랭 배너처럼 가운데, 양옆 여백) */}
        <img src="/carrot/we-carrot-banner3.jpg" alt="We당근당근" className="block w-full max-w-[720px] mx-auto mb-8 rounded-2xl shadow-[0_2px_6px_rgba(0,0,0,0.06),0_10px_24px_rgba(0,0,0,0.05)]" />
        <PageTitle eyebrow={ETC.eyebrow} className="mb-5" headingColor={CARROT} />
        <PostBoard category="etc" basePath="/etc" variant="carrot" />
      </div>
    </PageShell>
  );
}
