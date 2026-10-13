import type { Metadata } from 'next';
import { Noto_Sans_KR, Noto_Serif_KR, Gowun_Dodum, Nanum_Myeongjo, Black_Han_Sans } from 'next/font/google';
import './amsterdam-font.css';
import './globals.css';
import Header from '@/components/Header';
import { AdminProvider } from '@/components/AdminContext';
import { MemberProvider } from '@/components/MemberContext';
import Footer from '@/components/Footer';

const notoSans = Noto_Sans_KR({
  subsets: ['latin'],
  weight: ['300', '400', '500', '700'],
  variable: '--font-noto-sans',
  display: 'swap',
});

const notoSerif = Noto_Serif_KR({
  subsets: ['latin'],
  weight: ['400', '700', '900'],
  variable: '--font-noto-serif',
  display: 'swap',
});

const gowunDodum = Gowun_Dodum({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-gowun-dodum',
  display: 'swap',
});

const nanumMyeongjo = Nanum_Myeongjo({
  subsets: ['latin'],
  weight: ['400', '700', '800'],
  variable: '--font-nanum-myeongjo',
  display: 'swap',
});

const blackHanSans = Black_Han_Sans({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-black-han-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'We 소아재활센터', template: '%s | We 재활센터' },
  description: '아이들의 더 나은 내일을 위한 We 소아재활센터',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${notoSans.variable} ${notoSerif.variable} ${gowunDodum.variable} ${nanumMyeongjo.variable} ${blackHanSans.variable}`}>
      <head>
        {/* 기본 글꼴 중 거의 모든 화면에 쓰이는 조각(영문·기호, 사이트 문구)은 미리 받는다 */}
        <link rel="preload" href="/fonts/amsterdam/base.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/amsterdam/site.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body className="min-h-screen flex flex-col font-sans antialiased">
        <AdminProvider>
          <MemberProvider>
            <Header />
            <main className="flex-1">
              {children}
            </main>
            <Footer />
          </MemberProvider>
        </AdminProvider>
      </body>
    </html>
  );
}
