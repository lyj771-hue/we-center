'use client';

import { useEffect, useRef, useState } from 'react';

// 보호자 앱 — 맨 위에서 아래로 확 당기면 새로고침 (홈 화면 앱은 브라우저의 당겨서 새로고침이 없다).
// 페이지가 맨 위일 때만, 팝업이 떠 있지 않을 때만. 70px 넘게 당겼다 놓으면 페이지를 다시 연다.

const TRIGGER = 70;

export default function PullToRefresh() {
  const [pull, setPull] = useState(0);
  const [loading, setLoading] = useState(false);
  const start = useRef<{ y: number; x: number } | null>(null);
  const dist = useRef(0);

  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      // 맨 위가 아니거나, 안쪽에서 스크롤되는 칸·팝업 위에서 시작하면 안 한다
      const el = e.target as HTMLElement | null;
      if (window.scrollY > 0 || e.touches.length !== 1 || el?.closest('[role="dialog"], .fixed:not(nav), [data-no-pull]')) { start.current = null; return; }
      for (let n = el; n && n !== document.body; n = n.parentElement) {
        if (n.scrollTop > 0) { start.current = null; return; }
      }
      start.current = { y: e.touches[0].clientY, x: e.touches[0].clientX };
      dist.current = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (!start.current) return;
      const dy = e.touches[0].clientY - start.current.y, dx = Math.abs(e.touches[0].clientX - start.current.x);
      if (dy <= 0 || dx > dy || window.scrollY > 0) { dist.current = 0; setPull(0); return; }
      dist.current = Math.min(120, dy * 0.5);
      setPull(dist.current);
    };
    const onEnd = () => {
      if (start.current && dist.current >= TRIGGER) { setLoading(true); setPull(TRIGGER); location.reload(); return; }
      start.current = null; dist.current = 0; setPull(0);
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  if (!pull && !loading) return null;
  const ready = pull >= TRIGGER;
  return (
    <div aria-hidden="true" className="fixed inset-x-0 z-[60] flex justify-center pointer-events-none"
      style={{ top: `calc(env(safe-area-inset-top) + ${Math.max(8, pull - 30)}px)` }}>
      <span className={`w-9 h-9 rounded-full bg-white shadow-md flex items-center justify-center text-[var(--brand)] ${loading ? 'animate-spin' : ''}`}
        style={{ transform: loading ? undefined : `rotate(${pull * 3}deg)`, opacity: Math.min(1, pull / TRIGGER) }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ready ? 2.6 : 2} strokeLinecap="round">
          <path d="M20 12a8 8 0 1 1-2.34-5.66" /><polyline points="20 4 20 9 15 9" />
        </svg>
      </span>
    </div>
  );
}
