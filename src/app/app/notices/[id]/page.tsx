import PostDetail from '@/components/PostDetail';

// 보호자 앱 — 공지사항 글 하나 (앱 푸시 "공지사항이 등록되었어요"를 누르면 여기로)

interface Props { params: Promise<{ id: string }> }

export default async function AppNoticeDetail({ params }: Props) {
  const { id } = await params;
  return (
    <div className="bg-white rounded-[18px] px-[18px] py-5 [-webkit-text-stroke:0]">
      <PostDetail category="notices" id={id} backHref="/app/notices" backLabel="공지사항 목록" />
    </div>
  );
}
