import PostBoard from '@/components/PostBoard';
import NoticeBar from '@/components/NoticeBar';
import type { Metadata } from 'next';
import { WE_SLANG } from '@/lib/content';

export const metadata: Metadata = { title: 'We슐랭' };

// We슐랭 — 맛있는 가게 소개. 맨 위 배너, 재활생각 스크랩북 모양으로 가운데 하나씩: 가운데 큰 사진(누르면 글로), 오른쪽 작은 사진, 왼쪽 메모(가게 이름·위치)
export default function WeSlangPage() {
  return (
    <>
      <div className="scrapbook-bg pt-12 pb-10 md:pt-10">
        {/* 휴대폰에서만 보이는 메뉴 제목 (PC는 상단 메뉴에 이미 보임) */}
        <h1 className="text-center px-4 mb-4 text-[11px] tracking-[0.3em] text-[#aaa] md:sr-only">{WE_SLANG.heading}</h1>
        {/* 맨 위 — We슐랭(WECHELIN) 배너 */}
        <div className="px-4 mb-10 md:mb-14">
          <img src="/weslang/wechelin-banner.jpg" alt="We슐랭 — 센터 근처 맛있는 가게" className="block w-full max-w-[720px] mx-auto rounded-2xl shadow-[0_2px_6px_rgba(0,0,0,0.06),0_10px_24px_rgba(0,0,0,0.05)]" />
        </div>
        <div className="px-4">
          <PostBoard category="weslang" basePath="/we-slang" variant="weslang" />
        </div>
      </div>
      <NoticeBar />
    </>
  );
}
