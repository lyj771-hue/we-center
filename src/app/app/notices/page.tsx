import { redirect } from 'next/navigation';

// 공지사항은 홈페이지 탭 안(/app/site/notices)으로 옮겼다 — 예전 앱 푸시 링크용
export default function AppNoticesRedirect() {
  redirect('/app/site/notices');
}
