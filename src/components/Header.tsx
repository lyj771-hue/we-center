'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef } from 'react';
import { useAdmin } from './AdminContext';

const NAV = [
  { href: '/we-center',      label: 'We센터' },
  { href: '/we-subjects',    label: 'We수업과목' },
  { href: '/we-therapists',  label: 'We재활사' },
  { href: '/we-thoughts',    label: 'We재활생각' },
  { href: '/payment',        label: '결제정보' },
  { href: '/location',       label: '오시는길' },
  { href: '/notices',        label: '공지사항' },
  { href: '/etc',            label: '기타' },
];

export default function Header() {
  const pathname = usePathname();
  const { isAdmin, requestAdmin, logout } = useAdmin();

  // Triple-click the WE logo → admin prompt
  const clicks = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLogoClick = () => {
    clicks.current += 1;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { clicks.current = 0; }, 800);
    if (clicks.current >= 3) {
      clicks.current = 0;
      if (!isAdmin) requestAdmin();
    }
  };

  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-[#ebebeb]">
      {isAdmin && (
        <div className="bg-[#0a0a0a] text-white text-center text-[10px] tracking-[0.25em] py-1.5">
          관리자 모드&nbsp;&nbsp;
          <button onClick={logout} className="underline underline-offset-2 opacity-60 hover:opacity-100">
            종료
          </button>
        </div>
      )}

      {/* WE Logo */}
      <div className="flex justify-center pt-7 pb-5">
        <button
          onClick={handleLogoClick}
          aria-label="WE 센터 홈"
          className="group cursor-default select-none"
        >
          <div
            className="w-[76px] h-[76px] rounded-full border-[2.5px] border-[#0a0a0a]
                       flex items-center justify-center
                       group-hover:bg-[#f5f5f5] transition-colors duration-200"
          >
            <span className="font-serif font-black text-[1.45rem] tracking-[-0.04em] text-[#0a0a0a] leading-none select-none">
              We
            </span>
          </div>
        </button>
      </div>

      {/* Navigation */}
      <nav aria-label="메인 메뉴">
        <ul className="flex justify-center flex-wrap">
          {NAV.map(({ href, label }) => {
            const active = pathname === href || pathname.startsWith(href + '/');
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={[
                    'relative block px-3.5 py-3 text-[13px] tracking-wide transition-colors duration-150',
                    active
                      ? 'text-[#0a0a0a] font-medium'
                      : 'text-[#888] hover:text-[#0a0a0a]',
                  ].join(' ')}
                >
                  {label}
                  {active && (
                    <span className="absolute bottom-0 left-0 w-full h-[1.5px] bg-[#0a0a0a]" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
