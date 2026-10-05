'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef, useState } from 'react';
import { useAdmin } from './AdminContext';
import { useMember } from './MemberContext';

// 카카오톡 채널 주소 (채널 홈 → 공유 → 링크 복사). 비어 있으면 아이콘만 보이고 눌러도 아무 일 없다
const KAKAO_CHANNEL_URL = '';

const NAV = [
  { href: '/we-concept',     label: 'We컨셉' },
  { href: '/we-center',      label: 'We센터' },
  { href: '/we-subjects',    label: 'We수업과목' },
  { href: '/we-thoughts',    label: 'We재활생각' },
  { href: '/payment',        label: '결제정보' },
  { href: '/location',       label: '오시는길' },
  { href: '/notices',        label: '공지사항' },
  { href: '/etc',            label: '기타' },
  { href: '/schedule',       label: '수업스케쥴' },
];

export default function Header() {
  const pathname = usePathname();
  const { isAdmin, requestAdmin, logout } = useAdmin();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { userId, profile, login, logout: memberLogout } = useMember();

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

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  return (
    <>
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-[#ebebeb]">
        {isAdmin && (
          <div className="bg-[#0a0a0a] text-white text-center text-[10px] tracking-[0.25em] py-1.5">
            관리자 모드&nbsp;&nbsp;
            <Link href="/members" className="underline underline-offset-2 opacity-60 hover:opacity-100">회원 관리</Link>
            &nbsp;&nbsp;
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
            <img src="/logo-we.jpg" alt="WE 소아재활센터" className="w-full h-full object-contain" />
          </Link>

          {/* 보호자 로그인 + 카카오톡 채널 — PC는 오른쪽, 휴대폰은 왼쪽(오른쪽엔 메뉴 버튼) */}
          <div className="absolute left-4 md:left-auto md:right-14 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {!isAdmin && (userId ? (
              <button onClick={() => { if (confirm('로그아웃할까요?')) memberLogout(); }}
                title={profile && !profile.approvedAt ? '센터 승인 대기 중' : '누르면 로그아웃'}
                className="max-w-[140px] truncate rounded-full border border-[var(--brand)] px-3 py-1.5 text-[12px] tracking-[0.05em] text-[var(--brand)] transition hover:bg-[var(--brand)] hover:text-white">
                {profile?.centerNickname || (profile ? `${profile.nickname}(미승인)` : '로그아웃')}
              </button>
            ) : (
              <button onClick={login}
                className="rounded-full border border-[var(--brand)] bg-[var(--brand)] px-3 py-1.5 text-[12px] tracking-[0.1em] text-white transition hover:opacity-90">
                로그인
              </button>
            ))}
            {(() => {
              const icon = (
                <svg width="40" height="40" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#087BEA" d="M12 3.5c-5.25 0-9.5 3.3-9.5 7.38 0 2.62 1.75 4.92 4.38 6.22l-.9 3.3c-.08.3.26.54.52.37l3.92-2.6c.52.07 1.05.1 1.58.1 5.25 0 9.5-3.3 9.5-7.39S17.25 3.5 12 3.5z"/>
                  <text x="12" y="13.6" textAnchor="middle" fill="#ffffff" fontSize="7.5" fontWeight="700" fontFamily="Arial, Helvetica, sans-serif" style={{ WebkitTextStroke: 0 }}>Ch</text>
                </svg>
              );
              const cls = 'w-10 h-10 flex items-center justify-center';
              return KAKAO_CHANNEL_URL ? (
                <a href={KAKAO_CHANNEL_URL} target="_blank" rel="noopener noreferrer" aria-label="카카오톡 채널" className={`${cls} transition hover:opacity-80`}>{icon}</a>
              ) : (
                <span role="img" aria-label="카카오톡 채널 (준비 중)" className={cls}>{icon}</span>
              );
            })()}
          </div>

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
