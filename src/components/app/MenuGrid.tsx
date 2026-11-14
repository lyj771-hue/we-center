'use client';

import Link from 'next/link';
import { NAV } from '@/components/Header';
import { toAppHref } from '@/lib/appPath';

// 더보기 맨 위 — 홈페이지 메뉴 전부를 작은 네모 아이콘으로, 홈페이지 휴대폰 메뉴(☰) 순서 그대로, 가로 5개.
// 누르면 앱 안 주소로 연다 (수업스케쥴 → [수업] 탭, 마이페이지 → [결제] 탭)

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const ICONS: Record<string, React.ReactNode> = {
  '/': <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  '/we-center': <><rect x="4" y="3" width="16" height="18" rx="1.5" /><path d="M9 21v-4h6v4M8 7h2M14 7h2M8 11h2M14 11h2" /></>,
  '/we-subjects': <><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 19V5M8 7h7" /></>,
  '/payment': <><rect x="2.5" y="5" width="19" height="14" rx="2" /><path d="M2.5 10h19M6 15h4" /></>,
  '/location': <><path d="M12 21s-7-6.1-7-11.5a7 7 0 0 1 14 0C19 14.9 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>,
  '/notices': <><path d="M4 10v4a1 1 0 0 0 1 1h2l5 4V5L7 9H5a1 1 0 0 0-1 1z" /><path d="M16 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /></>,
  '/we-thoughts': <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.9V16h5v-.2c0-.8.4-1.5 1-1.9A6 6 0 0 0 12 3z" /></>,
  '/etc': <><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" /><circle cx="7.5" cy="7.5" r="1.5" /></>,
  '/schedule': <><rect x="3" y="4.5" width="18" height="16.5" rx="2" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4" /></>,
  '/mypage': <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  '/we-slang': <><path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10" /><path d="M17 21V3c-2 0-4 2.5-4 7h4" /></>,
};

// 로그인한 보호자의 홈페이지 휴대폰 메뉴 순서 — 마이페이지 다음에 We슐랭
const MENU = [
  ...NAV.filter(n => n.href !== '/we-slang'),
  { href: '/mypage', label: '마이페이지' },
  ...NAV.filter(n => n.href === '/we-slang'),
];

export default function MenuGrid() {
  return (
    <section className="bg-white rounded-[18px] px-3 py-4 grid grid-cols-5 gap-y-4">
      {MENU.map(m => (
        <Link key={m.href} href={toAppHref(m.href) ?? m.href} className="flex flex-col items-center gap-1.5 min-w-0">
          <span className="w-12 h-12 rounded-[14px] bg-[#F1F6FD] text-[var(--brand)] flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" {...S} aria-hidden="true">{ICONS[m.href.startsWith('/schedule') ? '/schedule' : m.href]}</svg>
          </span>
          <span className="text-[11px] leading-[1.3] text-[#444] text-center break-keep">{m.label}</span>
        </Link>
      ))}
    </section>
  );
}
