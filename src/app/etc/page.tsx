import PostBoard from '@/components/PostBoard';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: '기타' };

export default function EtcPage() {
  return (
    <div className="max-w-3xl mx-auto px-8 py-14">
      <div className="mb-12">
        <p className="text-[11px] tracking-[0.3em] text-[#aaa] uppercase mb-5">기타</p>
        <h1 className="display-heading mb-3">그 밖의 이야기들</h1>
        <p className="text-[14px] text-[#666] leading-relaxed">분류가 어렵거나 다양한 내용을 자유롭게 올려두는 공간입니다.</p>
      </div>
      <PostBoard category="etc" basePath="/etc" />
    </div>
  );
}
