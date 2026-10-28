'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useAdmin } from './AdminContext';
import { useMember } from './MemberContext';
import type { Profile } from '@/lib/types';
import { askConfirm } from '@/lib/dialog';
import { ALERTS_CHANGED, getUnreadAlertCount } from '@/lib/alerts';
import ContactButton from './ContactButton';


const NAV = [
  { href: '/',               label: '에이치오엠이' },
  { href: '/we-center',      label: 'We공간' },   // 센터 공간(수색·의정부) 사진 — 페이지 제목은 We센터
  { href: '/we-subjects',    label: 'We수업과목' },
  { href: '/we-thoughts',    label: 'We재활생각' },
  { href: '/payment',        label: '결제정보' },
  { href: '/location',       label: '오시는길' },
  { href: '/notices',        label: '공지사항' },
  { href: '/etc',            label: 'We당근당근' },
  { href: '/schedule',       label: '수업스케쥴(수색)' },
  { href: '/schedule/uijeongbu', label: '수업스케쥴(의정부)' },
  { href: '/we-slang',       label: 'We슐랭' },   // 맛있는 가게 소개
];

// 선생님(카카오 로그인 후 선생님 인증) — 시간표 보기
// 메뉴 글씨 색 — 앞에서 뒤로 갈수록: 보라색 → 브랜드 파랑(#087BEA) 그라데이션 (네이버 지도 버튼도 같은 색: globals.css .brand-gradient)
const NAV_FROM = [0x9b, 0x6b, 0xdb], NAV_TO = [0x08, 0x7b, 0xea];
function navColor(i: number, n: number) {
  const t = n > 1 ? i / (n - 1) : 0.5;
  return `rgb(${NAV_FROM.map((v, k) => Math.round(v + (NAV_TO[k] - v) * t)).join(',')})`;
}

const TEACHER_NAV = [
  { href: '/teacher/timetable', label: '시간표(수색)' },
  { href: '/teacher/timetable/uijeongbu', label: '시간표(의정부)' },
];

export default function Header() {
  const pathname = usePathname();
  const { isAdmin, canSeeStats, requestAdmin, logout } = useAdmin();
  // 관리자 메뉴 — 같은 메뉴의 지점은 한 묶음(PC 드롭다운 · 휴대폰 메뉴 안 버튼 줄)
  const adminGroups: { label: string; items: { href: string; label: string }[] }[] = [
    { label: '회원관리', items: [{ href: '/members', label: '수색' }, { href: '/members/uijeongbu', label: '의정부' }, { href: '/members/teachers', label: '선생님' }] },
    { label: '시간표 관리', items: [{ href: '/admin/timetable', label: '수색' }, { href: '/admin/timetable/uijeongbu', label: '의정부' }] },
    { label: '선생님 시간표', items: [{ href: '/teacher/timetable', label: '수색' }, { href: '/teacher/timetable/uijeongbu', label: '의정부' }] },
    // 수업 현황 — 전체 관리자만 (직원 계정엔 안 보인다)
    ...(canSeeStats ? [{ label: '수업 현황', items: [{ href: '/admin/dashboard', label: '수업 현황' }] }] : []),
    // 대시보드 — 전체 관리자만. 스케줄 잡기(선착순 결과)
    ...(canSeeStats ? [{ label: '대시보드', items: [{ href: '/admin/stats', label: '스케줄 잡기' }] }] : []),
    { label: '알림 메시지', items: [{ href: '/admin/messages', label: '메시지 모양' }, { href: '/admin/alimtalk-templates', label: '심사 올리기' }, { href: '/admin/alimtalk-test', label: '테스트 보내기' }] },
    { label: '알림', items: [{ href: '/admin/alerts', label: '알림' }] },
  ];
  // 관리자 알림 — 아직 안 본 수(빨간 숫자). 1분마다, 알림 화면에서 확인하면 바로 새로
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!isAdmin) { setUnread(0); return; }
    const refresh = () => { getUnreadAlertCount().then(setUnread).catch(() => {}); };
    refresh();
    const t = setInterval(refresh, 60_000);
    window.addEventListener(ALERTS_CHANGED, refresh);
    return () => { clearInterval(t); window.removeEventListener(ALERTS_CHANGED, refresh); };
  }, [isAdmin, pathname]);
  const badge = (label: string) => (label === '알림' && unread > 0
    ? <span className="ml-1 inline-block min-w-[16px] px-1 rounded-full bg-[#e11d48] text-white text-[10px] leading-[16px] text-center tracking-normal no-underline">{unread > 99 ? '99+' : unread}</span>
    : null);
  const [adminOpen, setAdminOpen] = useState<string | null>(null);
  // 바깥을 누르거나 페이지가 바뀌면 드롭다운 닫기
  useEffect(() => {
    if (!adminOpen) return;
    const close = () => setAdminOpen(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [adminOpen]);
  useEffect(() => { setAdminOpen(null); }, [pathname]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { userId, profile, login, logout: memberLogout, teacher } = useMember();

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

  // 관리자 메뉴(회원관리·시간표)는 위 검은 띠에만 / 로그인한 보호자 — 마이페이지
  // 수업스케쥴 메뉴는 두 지점 모두 늘 보인다 (신청은 그 지점 승인된 보호자만)
  const nav = isAdmin
    ? [...TEACHER_NAV, ...NAV]   // 관리자도 선생님 시간표를 메인 메뉴 맨 앞에서
    : teacher ? [...TEACHER_NAV, ...NAV]   // 선생님은 시간표를 맨 앞에
    : userId ? [...NAV, { href: '/mypage', label: '마이페이지' }] : NAV;
  // 휴대폰 메뉴 — 로그인한 보호자는 마이페이지 다음에 We슐랭 (PC는 그대로)
  const mobileNav = !isAdmin && !teacher && userId
    ? [...nav.filter(n => n.href !== '/we-slang'), ...nav.filter(n => n.href === '/we-slang')]
    : nav;

  // /schedule/uijeongbu 는 수업스케쥴(의정부)에만 불이 들어오게
  const isActive = (href: string) => pathname === href || (pathname.startsWith(href + '/') && ![...NAV, ...TEACHER_NAV].some(n => n.href !== href && n.href.startsWith(href + '/') && pathname.startsWith(n.href)));

  return (
    <>
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-[#ebebeb]">
        {isAdmin && (
          <div className="bg-[#0a0a0a] text-white text-[10px] tracking-[0.25em] py-1.5">
            {/* PC — 같은 메뉴의 지점들은 눌러서 펼치는 드롭다운 */}
            <div className="hidden md:flex items-center justify-center gap-4">
              <span>관리자 모드</span>
              {adminGroups.map(g => {
                const cur = g.items.find(i => pathname === i.href);
                if (g.items.length === 1) {
                  return <Link key={g.label} href={g.items[0].href} className={`underline underline-offset-2 hover:opacity-100 ${cur || (g.label === '알림' && unread) ? 'opacity-100' : 'opacity-60'}`}>{g.label}{badge(g.label)}</Link>;
                }
                return (
                  <span key={g.label} className="relative">
                    <button type="button" onClick={e => { e.stopPropagation(); setAdminOpen(o => (o === g.label ? null : g.label)); }}
                      className={`underline underline-offset-2 hover:opacity-100 ${cur || adminOpen === g.label ? 'opacity-100' : 'opacity-60'}`}>
                      {g.label}{cur ? `(${cur.label})` : ''} ▾
                    </button>
                    {adminOpen === g.label && (
                      <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 z-[60] min-w-[110px] bg-white text-[#0a0a0a] tracking-normal text-[13px] shadow-xl border border-[#e5e5e5] py-1 flex flex-col">
                        {g.items.map(i => (
                          <Link key={i.href} href={i.href} onClick={() => setAdminOpen(null)}
                            className={`px-4 py-2 text-left whitespace-nowrap hover:bg-[#f4f4f5] ${pathname === i.href ? 'text-[var(--brand)] font-medium' : ''}`}>{i.label}</Link>
                        ))}
                      </span>
                    )}
                  </span>
                );
              })}
              <button onClick={logout} className="underline underline-offset-2 opacity-60 hover:opacity-100">종료</button>
            </div>
            {/* 휴대폰 — 관리자 메뉴는 오른쪽 메뉴(☰) 안에 크게 */}
            <div className="md:hidden flex items-center justify-center gap-4">
              <span>관리자 모드</span>
              <button type="button" onClick={() => setMobileOpen(true)} className="underline underline-offset-2">관리자 메뉴 ☰{badge('알림')}</button>
              <button onClick={logout} className="underline underline-offset-2 opacity-60">종료</button>
            </div>
          </div>
        )}

        {/* Logo row */}
        <div className="relative flex justify-center pt-3 pb-2 md:pt-7">
          <Link
            href="/"
            onClick={handleLogoClick}
            aria-label="We 센터 홈"
            className="group select-none block w-[64px] h-[64px] md:w-[100px] md:h-[100px] transition-opacity duration-200 hover:opacity-70"
          >
            <img src="/logo-we-heart.png" alt="We 소아재활센터" className="w-full h-full object-contain" />
          </Link>

          {/* 보호자 로그인 + 문의하기 — PC는 둘 다 오른쪽.
              휴대폰은 로그인 버튼을 왼쪽, 문의하기는 펼친 메뉴 맨 아래에 두고, 로그인 뒤 인사는 로고 아래 한 줄로(로고와 겹치지 않게) */}
          <div className="absolute left-4 md:left-auto md:right-14 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {!isAdmin && (userId ? (
              <span className="hidden md:flex"><Greeting profile={profile} teacherName={teacher?.name} onLogout={memberLogout} /></span>
            ) : (
              <button onClick={login}
                className="rounded-full border border-[#e11d48] bg-[#e11d48] px-3 py-1.5 text-[12px] tracking-[0.1em] text-white transition hover:opacity-90">
                로그인
              </button>
            ))}
            <ContactButton className="hidden md:inline-flex rounded-full border border-[var(--brand)] px-3 py-1.5 text-[12px] tracking-[0.1em] text-[var(--brand)] transition hover:bg-[#eef5fe]" />
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

        {!isAdmin && userId && (
          <div className="md:hidden flex justify-center pb-2 -mt-1">
            <Greeting profile={profile} teacherName={teacher?.name} onLogout={memberLogout} showLogout={false} />
          </div>
        )}

        {/* Desktop navigation */}
        <nav aria-label="메인 메뉴" className="hidden md:block pb-0">
          <ul className="flex justify-center flex-wrap">
            {nav.map(({ href, label }, i) => (
              <li key={href}>
                <Link
                  href={href}
                  style={{ color: navColor(i, nav.length) }}
                  className={[
                    'relative block px-3 py-3 text-[14px] tracking-wide transition-colors duration-150',
                    isActive(href) ? 'font-medium' : 'hover:opacity-70',
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
            'absolute right-0 top-0 h-full w-2/3 max-w-xs bg-white shadow-2xl flex flex-col p-6 pt-8 overflow-y-auto',
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
          {/* 관리자 메뉴 — 묶음마다 지점 버튼을 나란히 */}
          {isAdmin && (
            <div className="mb-5 pb-5 border-b border-[#f0f0f0] space-y-3">
              <p className="text-[11px] tracking-[0.2em] text-[#999]">관리자</p>
              {adminGroups.map(g => (
                <div key={g.label}>
                  {g.items.length > 1 && <p className="text-[12px] text-[#555] mb-1">{g.label}</p>}
                  <div className="flex gap-1.5">
                    {g.items.map(i => (
                      <Link key={i.href} href={i.href} onClick={() => setMobileOpen(false)}
                        className={`flex-1 text-center py-2 text-[13px] rounded-md border ${pathname === i.href ? 'border-[var(--brand)] bg-[var(--brand)] text-white' : 'border-[#e5e5e5] text-[#333]'}`}>{i.label}{badge(i.label)}</Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <nav aria-label="모바일 메뉴">
            <ul className="space-y-1">
              {mobileNav.map(({ href, label }, i) => (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={() => setMobileOpen(false)}
                    style={{ color: navColor(i, mobileNav.length) }}
                    className={[
                      'block py-2 text-[13px] tracking-wide transition-colors',
                      isActive(href) ? 'font-medium' : '',
                    ].join(' ')}
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          {/* 문의하기 — 휴대폰은 메뉴 맨 아래에 */}
          <div className="mt-auto pt-6 border-t border-[#f0f0f0] space-y-3">
            <ContactButton onOpen={() => setMobileOpen(false)}
              className="inline-flex rounded-full border border-[var(--brand)] px-4 py-1.5 text-[13px] text-[var(--brand)]" />
            {!isAdmin && userId && (
              <button onClick={async () => { if (await askConfirm('로그아웃할까요?')) { setMobileOpen(false); memberLogout(); } }}
                className="text-[13px] text-[#888] underline underline-offset-2 hover:text-[#0a0a0a]">로그아웃</button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/** 로그인한 보호자 인사 + 밑줄 로그아웃 (누르면 한 번 묻는다). 휴대폰 인사엔 로그아웃을 빼고 펼친 메뉴 맨 아래에 둔다 */
function Greeting({ profile, teacherName, onLogout, showLogout = true }: { profile: Profile | null; teacherName?: string; onLogout: () => void; showLogout?: boolean }) {
  return (
    <span className="flex items-center gap-2 text-[12px] md:text-[13px] leading-[1.6] text-[#555] whitespace-nowrap">
      {teacherName && (
        <span><span className="text-[var(--brand)]">{teacherName}</span> 선생님 오셨군요<span aria-hidden="true" className="ml-1 text-[#e11d48] text-[1.6em] leading-none align-[-0.12em]" style={{ WebkitTextStroke: 0 }}>♥</span></span>
      )}
      {!teacherName && profile && (
        <Link href="/mypage" className="py-0.5 hover:opacity-70" title="마이페이지">
          <span className="text-[var(--brand)]">{profile.nickname}</span>님 오셨군요<span aria-hidden="true" className="ml-1 text-[#e11d48] text-[1.6em] leading-none align-[-0.12em]" style={{ WebkitTextStroke: 0 }}>♥</span>
          {!profile.approvedAt && <span className="text-[#aaa]">(미승인)</span>}
        </Link>
      )}
      {showLogout && (
        <button onClick={async () => { if (await askConfirm('로그아웃할까요?')) onLogout(); }}
          className="underline underline-offset-2 text-[#888] hover:text-[#0a0a0a]">로그아웃</button>
      )}
    </span>
  );
}
