import { AppBoardList } from '@/components/app/AppBoard';

// 보호자 앱 — 홈페이지 탭 안의 We슐랭 (글 화면 없이 목록에서 사진을 크게 본다)
export default function Page() {
  return (
    <AppBoardList category="weslang" slug="we-slang" title="We슐랭" variant="weslang"
      banner={<img src="/weslang/wechelin-bib2.jpg" alt="WECHELIN BIB GOURMAND — 센터 근처 맛있는 가게" className="block w-full rounded-[18px]" />} />
  );
}
