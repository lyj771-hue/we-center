'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef, useState } from 'react';
import { useAdmin } from './AdminContext';

const NAV = [
  { href: '/we-concept',     label: 'We컨셉' },
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Triple-click the WE logo → admin prompt
  const clicks = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLogoClick = () => {
    clicks.current += 1;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { clicks.current = 0; }, 800);
    if (clicks.current >= 3) {
      clicks.current = 0;
      if (!isAdmin) requestAdmin();
    }
  };

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  const handleCopyUrl = async () => {
    if (typeof window === 'undefined') return;

    const url = window.location.href;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = url;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-[#ebebeb]">
        {isAdmin && (
          <div className="bg-[#0a0a0a] text-white text-center text-[10px] tracking-[0.25em] py-1.5">
            관리자 모드&nbsp;&nbsp;
            <button onClick={logout} className="underline underline-offset-2 opacity-60 hover:opacity-100">
              종료
            </button>
          </div>
        )}

        {/* Logo row */}
        <div className="relative flex justify-center pt-3 pb-2 md:pt-7">
          <Link
            href="/"
            onClick={handleLogoClick}
            aria-label="WE 센터 홈"
            className="group select-none block w-[64px] h-[64px] md:w-[100px] md:h-[100px] transition-opacity duration-200 hover:opacity-70"
          >
            <img src="/logo.jpg" alt="WE 소아재활센터" className="w-full h-full object-contain" />
          </Link>

          <button
            onClick={handleCopyUrl}
            aria-label="현재 페이지 주소 복사"
            className="absolute right-14 top-1/2 -translate-y-1/2 hidden md:flex items-center gap-1.5 rounded-full border border-[#d9d9d9] px-3 py-1.5 text-[11px] font-medium tracking-[0.16em] text-[#666] transition hover:border-[#0a0a0a] hover:text-[#0a0a0a]"
          >
            <span>{copied ? '복사됨' : 'URL 복사'}</span>
          </button>

          {/* Hamburger — mobile only */}
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="메뉴 열기"
            className="md:hidden absolute right-5 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-[22px] text-[#0a0a0a]"
          >
            ☰
          </button>
        </div>

        {/* Desktop navigation */}
        <nav aria-label="메인 메뉴" className="hidden md:block pb-0">
          <ul className="flex justify-center flex-wrap">
            {NAV.map(({ href, label }) => (
              <li key={href}>
                <Link
                  href={href}
                  className={[
                    'relative block px-4 py-3 text-[15px] tracking-wide transition-colors duration-150',
                    isActive(href) ? 'text-[var(--brand)] font-medium' : 'text-[var(--brand)] hover:opacity-70',
                  ].join(' ')}
                >
                  {label}
                  {isActive(href) && (
                    <span className="absolute bottom-0 left-0 w-full h-[3px] bg-[var(--brand)] rounded-full" />
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      {/* Mobile drawer — rendered as a sibling of <header>, not inside it: the
          header's backdrop-blur creates a containing block for `fixed`
          descendants, which would otherwise trap this overlay inside the
          header's own (short) box instead of the full viewport. */}
      <div className="md:hidden fixed inset-0 z-[300] pointer-events-none" aria-hidden={!mobileOpen}>
        <div
          onClick={() => setMobileOpen(false)}
          className={[
            'absolute inset-0 bg-black/30 transition-opacity duration-300',
            mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0',
          ].join(' ')}
        />
        <div
          className={[
            'absolute right-0 top-0 h-full w-2/3 max-w-xs bg-white shadow-2xl flex flex-col p-6 pt-8',
            'transition-transform duration-300 ease-out',
            mobileOpen ? 'translate-x-0 pointer-events-auto' : 'translate-x-full',
          ].join(' ')}
        >
          <button
            onClick={() => setMobileOpen(false)}
            aria-label="메뉴 닫기"
            className="self-end text-[20px] text-[#888] mb-6 w-9 h-9 flex items-center justify-center"
          >
            ✕
          </button>
          <nav aria-label="모바일 메뉴">
            <ul className="space-y-1">
              {NAV.map(({ href, label }) => (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={() => setMobileOpen(false)}
                    className={[
                      'block py-2.5 text-[15px] tracking-wide transition-colors',
                      isActive(href) ? 'text-[var(--brand)] font-medium' : 'text-[var(--brand)]',
                    ].join(' ')}
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </>
  );
}
