'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { showAlert } from '@/lib/dialog';

// 카드 메모 칸 — 두 줄까지만 보이고, 더 길면 세 번째 줄에 [더보기]. 누르면 전체 내용을 팝업으로 (선결제 카드 · 결제별 사용 카드)
export default function MemoCell({ memo, day, className }: { memo?: string; day?: string; className: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [more, setMore] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // 두 줄보다 길 때만 — 손글씨 글꼴은 글자가 줄 높이보다 살짝 커서 scrollHeight 만 보면 한 줄짜리도 넘친다고 나온다
    const check = () => {
      const lh = parseFloat(getComputedStyle(el).lineHeight) || 16;
      setMore(el.scrollHeight > lh * 2 + lh / 2);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [memo]);
  if (!memo) return <span className={className} />;
  const open = () => showAlert(day ? `${day.replace(/-/g, '/')}\n\n${memo}` : memo);
  return (
    <span className={className}>
      <span ref={ref} onClick={more ? open : undefined} className={`line-clamp-2 whitespace-pre-wrap [overflow-wrap:anywhere] ${more ? 'cursor-pointer' : ''}`}>{memo}</span>
      {more && <button type="button" onClick={open} className="block text-[var(--brand)] hover:underline underline-offset-2">더보기</button>}
    </span>
  );
}
