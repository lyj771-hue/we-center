import type { Metadata, Viewport } from 'next';
import AppShell from '@/components/app/AppShell';

// 보호자 앱 — 홈페이지와 같은 프로젝트·DB·카카오 로그인, 화면만 따로 (/app 아래).
// 홈 화면에 추가하면 주소창 없이 앱처럼 열린다(PWA). 홈페이지 머리말·꼬리말은 /app 에서 숨는다.

export const metadata: Metadata = {
  title: { absolute: 'We 센터', template: '%s | We 센터' },
  manifest: '/app/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'We 센터', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  themeColor: '#ffffff',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
