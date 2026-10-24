import PostBoard from '@/components/PostBoard';
import NoticeBar from '@/components/NoticeBar';
import type { Metadata } from 'next';
import { WE_SLANG } from '@/lib/content';

export const metadata: Metadata = { title: 'We슐랭' };

// We슐랭 — 맛있는 가게 소개. 맨 위 배너, 재활생각 스크랩북 모양으로 가운데 하나씩: 가운데 큰 사진(누르면 글로), 오른쪽 작은 사진, 왼쪽 메모(가게 이름·위치)
export default function WeSlangPage() {
  return (
    <>
      <div className="pt-4 pb-10">
        <h1 className="sr-only">{WE_SLANG.heading}</h1>
        {/* 맨 위 — We슐랭 로고 띠(배너 높이의 1/3) + We슐랭(WECHELIN) 배너. 맨 위 여백 = 그림 사이 여백 */}
        <div className="px-4 mb-10 md:mb-14">
          {/* 로고는 가운데, 양옆은 로고와 같은 빨강으로 채워 배너 폭에 맞춘다 */}
          <div className="w-full max-w-[720px] mx-auto aspect-[16/3] mb-4 bg-[#b71f2f] rounded-2xl overflow-hidden">
            <img src="/weslang/wechelin-icon.png" alt="" aria-hidden className="block h-full w-auto mx-auto" />
          </div>
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
