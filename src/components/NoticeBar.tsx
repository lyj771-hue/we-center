import Link from 'next/link';
import { HOME } from '@/lib/content';

// "더 궁금한 점이 있으신가요?" 하단 안내 줄 — 홈과 We재활생각에서 함께 쓴다.
export default function NoticeBar() {
  return (
    <section className="border-t border-[#ebebeb]">
      <div className="max-w-5xl mx-auto px-8 py-10 flex items-center justify-between gap-6 flex-wrap">
        <p className="text-[13px] text-[#444]">{HOME.noticeBar.text}</p>
        <div className="flex gap-4 text-[12px]">
          {HOME.noticeBar.links.map(({ href, label }, i) => (
            <span key={href} className="flex items-center gap-4">
              {i > 0 && <span className="text-[#ddd]">|</span>}
              <Link href={href} className="text-[#888] hover:text-[#0a0a0a] transition-colors underline underline-offset-2">{label}</Link>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
