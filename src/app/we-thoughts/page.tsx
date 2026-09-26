import PostBoard from '@/components/PostBoard';
import NoticeBar from '@/components/NoticeBar';
import type { Metadata } from 'next';
import { WE_THOUGHTS } from '@/lib/content';

export const metadata: Metadata = { title: 'We재활생각' };

export default function WeThoughtsPage() {
  return (
    <>
      <div className="scrapbook-bg pt-12 pb-10 md:pt-10">
        {/* 휴대폰에서만 보이는 메뉴 제목 (PC는 상단 메뉴에 이미 보임) */}
        <div className="text-center px-4 mb-4 md:sr-only">
          <p className="text-[11px] tracking-[0.3em] text-[#aaa] uppercase mb-5">{WE_THOUGHTS.eyebrow}</p>
          <h1 className="font-serif font-black text-[32px] leading-[1.2] tracking-[-0.03em] text-[var(--brand)]">
            {WE_THOUGHTS.heading}
          </h1>
        </div>
        <div className="px-4">
          <PostBoard category="thoughts" basePath="/we-thoughts" variant="scrapbook" />
        </div>
      </div>
      <NoticeBar />
    </>
  );
}
