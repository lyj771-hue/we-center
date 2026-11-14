'use client';

import Link from 'next/link';
import InstallHint from '@/components/app/InstallHint';
import PushToggle from '@/components/app/PushToggle';
import { ETC, LOCATION, NOTICES, PAYMENT, WE_CENTER, WE_SUBJECTS, WE_THOUGHTS } from '@/lib/content';

// 보호자 앱 — 홈페이지 탭: 홈페이지 메뉴를 앱 안에서 (수업스케쥴·마이페이지 관련은 [수업]·[결제] 탭에 있어서 뺀다)
// 각 메뉴는 /app/site/... 에서 열려 아래 탭이 그대로 보인다.

const MENU = [
  { href: '/app/site/notices', label: '공지사항', sub: NOTICES.heading },
  { href: '/app/site/we-center', label: 'We공간', sub: WE_CENTER.heading },
  { href: '/app/site/we-subjects', label: 'We수업과목', sub: WE_SUBJECTS.heading },
  { href: '/app/site/payment', label: '결제정보', sub: PAYMENT.heading },
  { href: '/app/site/location', label: '오시는길', sub: LOCATION.heading },
  { href: '/app/site/we-thoughts', label: 'We재활생각', sub: WE_THOUGHTS.heading },
  { href: '/app/site/etc', label: 'We당근당근', sub: ETC.heading },
  { href: '/app/site/we-slang', label: 'We슐랭', sub: '센터 근처 맛있는 가게' },
];

export default function AppSiteHome() {
  return (
    <div className="space-y-4">
      <InstallHint />
      <PushToggle banner />
      <section className="bg-white rounded-[18px] px-[18px] divide-y divide-[#f4f4f4]">
        {MENU.map(m => (
          <Link key={m.href} href={m.href} className="flex items-center justify-between gap-3 py-4">
            <span className="min-w-0">
              <span className="block text-[16px] text-[#27272a]">{m.label}</span>
              <span className="block text-[12px] text-[#999] truncate">{m.sub}</span>
            </span>
            <span className="text-[#c4c4cc]" aria-hidden="true">›</span>
          </Link>
        ))}
      </section>
    </div>
  );
}
