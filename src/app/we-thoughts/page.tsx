import PostBoard from '@/components/PostBoard';
import NoticeBar from '@/components/NoticeBar';
import type { Metadata } from 'next';
import { WE_THOUGHTS } from '@/lib/content';

export const metadata: Metadata = { title: 'We재활생각' };

export default function WeThoughtsPage() {
  return (
    <>
      <div className="note-board-bg px-6 pt-16 pb-20 md:px-8 md:pt-20 md:pb-[100px]">
        <div className="text-center mb-16 md:mb-20">
          <p className="md:hidden text-[11px] tracking-[0.3em] text-[#aaa] uppercase mb-5">{WE_THOUGHTS.eyebrow}</p>
          <h1 className="md:sr-only font-serif font-black text-[32px] leading-[1.2] tracking-[-0.03em] text-[var(--brand)] mb-4">
            {WE_THOUGHTS.heading}
          </h1>
          <p className="text-[14px] leading-[1.9] text-[#555]">{WE_THOUGHTS.subtext}</p>
        </div>
        <PostBoard category="thoughts" basePath="/we-thoughts" variant="notes" />
      </div>
      <NoticeBar />
    </>
  );
}
