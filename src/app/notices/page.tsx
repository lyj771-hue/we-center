import PostBoard from '@/components/PostBoard';
import type { Metadata } from 'next';
import { NOTICES } from '@/lib/content';

export const metadata: Metadata = { title: '공지사항' };

export default function NoticesPage() {
  return (
    <div className="max-w-3xl mx-auto px-8 pt-8 pb-14 md:pt-14">
      <div className="mb-12">
        <p className="md:hidden text-[11px] tracking-[0.3em] text-[#aaa] uppercase mb-5">{NOTICES.eyebrow}</p>
        <h1 className="display-heading mb-3">{NOTICES.heading}</h1>
        <p className="text-[14px] text-[#666] leading-relaxed">{NOTICES.subtext}</p>
      </div>
      <PostBoard category="notices" basePath="/notices" />
    </div>
  );
}
