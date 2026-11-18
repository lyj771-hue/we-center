'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getUnreadCount } from '@/lib/notifications';

// 앱 위쪽 🔔 — 누르면 알림 내역(/app/notifications). 안 읽은 알림이 있으면 빨간 숫자
export default function NotifyBell({ className = '' }: { className?: string }) {
  const pathname = usePathname();
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () => getUnreadCount().then(c => { if (alive) setN(c); });
    load();
    const onShow = () => { if (document.visibilityState === 'visible') load(); };
    const onRead = () => setN(0);
    document.addEventListener('visibilitychange', onShow);
    window.addEventListener('notifications-read', onRead);
    return () => { alive = false; document.removeEventListener('visibilitychange', onShow); window.removeEventListener('notifications-read', onRead); };
  }, [pathname]);

  return (
    <Link href="/app/notifications" aria-label={n ? `알림 ${n}개 안 읽음` : '알림'} className={`relative w-9 h-9 inline-flex items-center justify-center text-[#0a0a0a] ${className}`}>
      <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {n > 0 && (
        <span className="absolute top-0.5 right-0 min-w-[17px] h-[17px] px-1 rounded-full bg-[#e11d48] text-white text-[10px] leading-[17px] text-center tabular-nums">
          {n > 99 ? '99+' : n}
        </span>
      )}
    </Link>
  );
}
