import PostDetail from '@/components/PostDetail';

interface Props { params: Promise<{ id: string }> }

export default async function NoticeDetailPage({ params }: Props) {
  const { id } = await params;
  return (
    <div className="max-w-3xl mx-auto px-8 pt-8 pb-14 md:pt-14">
      <PostDetail category="notices" id={id} backHref="/notices" backLabel="공지사항 목록" />
    </div>
  );
}
