import type { Metadata } from 'next';
import { Noto_Sans_KR, Noto_Serif_KR } from 'next/font/google';
import './globals.css';
import Header from '@/components/Header';
import { AdminProvider } from '@/components/AdminContext';

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

export const metadata: Metadata = {
  title: { default: 'WE 소아재활센터', template: '%s | WE 재활센터' },
  description: '아이들의 더 나은 내일을 위한 We 소아재활센터',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${notoSans.variable} ${notoSerif.variable}`}>
      <body className="min-h-screen flex flex-col font-sans antialiased">
        <AdminProvider>
          <Header />
          <main className="flex-1">
            {children}
          </main>
          <footer className="border-t border-[#ebebeb] py-8 text-center text-[11px] text-[#aaa] tracking-widest">
            © {new Date().getFullYear()} WE 소아재활센터
          </footer>
        </AdminProvider>
      </body>
    </html>
  );
}
