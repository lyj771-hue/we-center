import PostBoard from '@/components/PostBoard';
import type { Metadata } from 'next';
import { WE_THOUGHTS } from '@/lib/content';

export const metadata: Metadata = { title: 'We재활생각' };

export default function WeThoughtsPage() {
  return (
    <div className="max-w-3xl mx-auto px-8 py-14">
      <div className="mb-12">
        <p className="text-[11px] tracking-[0.3em] text-[#aaa] uppercase mb-5">{WE_THOUGHTS.eyebrow}</p>
        <h1 className="display-heading mb-3">{WE_THOUGHTS.heading}</h1>
        <p className="text-[14px] text-[#666] leading-relaxed">{WE_THOUGHTS.subtext}</p>
      </div>
      <PostBoard category="thoughts" basePath="/we-thoughts" />
    </div>
  );
}
