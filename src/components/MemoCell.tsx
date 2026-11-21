'use client';

import { showAlert } from '@/lib/dialog';

// 카드 메모 칸 — 길면 세 줄까지만 보이고 뒤는 "…". 누르면 전체 내용을 팝업으로 (선결제 카드 · 결제별 사용 카드)
export default function MemoCell({ memo, day, className }: { memo?: string; day?: string; className: string }) {
  if (!memo) return <span className={className} />;
  return (
    <button type="button" onClick={() => showAlert(day ? `${day.replace(/-/g, '/')}\n\n${memo}` : memo)}
      title="눌러서 메모 전체 보기" className={`${className} text-left cursor-pointer hover:text-[#666]`}>
      <span className="line-clamp-3 whitespace-pre-wrap [overflow-wrap:anywhere]">{memo}</span>
    </button>
  );
}
