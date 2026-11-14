import { AppBoardPost } from '@/components/app/AppBoard';

// 보호자 앱 — We당근당근 글 하나
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AppBoardPost category="etc" slug="etc" id={id} backLabel="We당근당근 목록" />;
}
