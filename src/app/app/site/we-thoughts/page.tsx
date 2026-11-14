import { AppBoardList } from '@/components/app/AppBoard';

// 보호자 앱 — 홈페이지 탭 안의 We재활생각 목록
export default function Page() {
  return <AppBoardList category="thoughts" slug="we-thoughts" title="We재활생각" variant="notes" />;
}
