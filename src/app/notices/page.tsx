import PostBoard from '@/components/PostBoard';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: '공지사항' };

export default function NoticesPage() {
  return (
    <div className="max-w-3xl mx-auto px-8 py-14">
      <div className="mb-12">
        <p className="text-[11px] tracking-[0.3em] text-[#aaa] uppercase mb-5">공지사항</p>
        <h1 className="display-heading mb-3">센터 소식과 안내</h1>
        <p className="text-[14px] text-[#666] leading-relaxed">WE 소아재활센터의 새로운 소식을 전합니다.</p>
      </div>
      <PostBoard category="notices" basePath="/notices" />
    </div>
  );
}
