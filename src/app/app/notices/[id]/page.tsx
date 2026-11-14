import { redirect } from 'next/navigation';

// 예전 앱 푸시 링크(/app/notices/글) → /app/site/notices/글
export default async function AppNoticeRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/app/site/notices/${id}`);
}
