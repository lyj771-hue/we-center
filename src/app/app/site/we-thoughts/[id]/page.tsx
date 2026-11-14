import { AppBoardPost } from '@/components/app/AppBoard';

// 보호자 앱 — We재활생각 글 하나
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AppBoardPost category="thoughts" slug="we-thoughts" id={id} backLabel="We재활생각 목록" />;
}
