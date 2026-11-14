import { AppBoardPost } from '@/components/app/AppBoard';

// 보호자 앱 — 공지사항 글 하나
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AppBoardPost category="notices" slug="notices" id={id} backLabel="공지사항 목록" />;
}
