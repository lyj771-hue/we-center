import { AppBoardList } from '@/components/app/AppBoard';

// 보호자 앱 — 홈페이지 탭 안의 공지사항 목록
export default function Page() {
  return <AppBoardList category="notices" slug="notices" title="공지사항" variant="list" />;
}
