import PostBoard from '@/components/PostBoard';
import type { Metadata } from 'next';
import { ETC } from '@/lib/content';

export const metadata: Metadata = { title: '기타' };

export default function EtcPage() {
  return (
    <div className="max-w-3xl mx-auto px-8 py-14">
      <div className="mb-12">
        <p className="text-[11px] tracking-[0.3em] text-[#aaa] uppercase mb-5">{ETC.eyebrow}</p>
        <h1 className="display-heading mb-3">{ETC.heading}</h1>
        <p className="text-[14px] text-[#666] leading-relaxed">{ETC.subtext}</p>
      </div>
      <PostBoard category="etc" basePath="/etc" />
    </div>
  );
}
