import Link from 'next/link';
import { HOME } from '@/lib/content';

/** **글자** → 굵게 */
const bold = (line: string) => line.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part));

export default function HomePage() {
  return (
    <div>
      {/* ── Hero ────────────────────────────────────── */}
      {/* 맨 위 작은 글씨 위 여백은 짧게(위에 붙여서 시작) */}
      <section className="min-h-[calc(100svh-240px)] flex flex-col justify-start bg-[#f5f5f3] px-8 pt-5 pb-16">
        <div className="max-w-5xl mx-auto w-full">
          <p className="text-[11px] tracking-[0.3em] text-[#aaa] mb-4 fade-up">
            {HOME.eyebrow}
          </p>
          <h1 className="font-serif font-black text-[var(--brand)] text-[28px] sm:text-[40px] lg:text-[52px] leading-[1.1] tracking-[-0.03em] mb-8 fade-up-d1">
            {HOME.headline.map((line, i) => <span key={i}>{i > 0 && <br />}{line}</span>)}
          </h1>
          {/* 소개 글 + 나무 그림 — 그림은 글 뒤에 배경처럼 깔린다(글을 밀지 않음). 풀밭 밑을 마지막 줄 글씨 밑에 맞춘다 */}
          <div className="relative max-w-[890px] mb-8 fade-up-d2">
            <img src="/tree-wide-b.png" alt="" aria-hidden className="pointer-events-none select-none absolute -right-6 sm:right-0 bottom-[3px] h-[58px] sm:h-[120px] w-auto max-w-none" />
            <p className="relative text-[14px] sm:text-[17px] text-[#555] leading-[2] max-w-[420px]">
              {HOME.body.map((line, i) => (
                <span key={i} className={i < 3 ? 'text-[12px] sm:text-[17px]' : undefined}>{bold(line)}{i < HOME.body.length - 1 && <br />}</span>
              ))}
            </p>
          </div>
          <div className="flex flex-col gap-px bg-[#d8d8d8] max-w-[890px] fade-up-d3">
            {HOME.quickLinks.map(({ href, label }) => (
              <Link key={href} href={href} className="bg-white px-5 py-4 text-left group hover:bg-[#f0f0ee] transition-colors">
                <p className="text-[13px] font-medium text-[#0a0a0a] group-hover:underline underline-offset-2">{label}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

    </div>
  );
}
