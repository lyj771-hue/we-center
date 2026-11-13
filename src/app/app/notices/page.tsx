import PostBoard from '@/components/PostBoard';

// 보호자 앱 — 공지사항 목록 (홈페이지 공지사항과 같은 글)

export default function AppNotices() {
  return (
    <div className="space-y-4 [-webkit-text-stroke:0]">
      <h1 className="px-1 text-[19px] text-[var(--brand)]">공지사항</h1>
      <div className="bg-white rounded-[18px] px-[18px] py-2">
        <PostBoard category="notices" basePath="/app/notices" />
      </div>
    </div>
  );
}
