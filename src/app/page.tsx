import Link from 'next/link';
import { HOME } from '@/lib/content';
import NoticeBar from '@/components/NoticeBar';

export default function HomePage() {
  return (
    <div className="home-font">
      {/* ── Hero ────────────────────────────────────── */}
      <section className="min-h-[calc(100svh-160px)] flex flex-col justify-center bg-[#f5f5f3] px-8 py-24">
        <div className="max-w-5xl mx-auto w-full">
          <p className="text-[11px] tracking-[0.3em] text-[#aaa] uppercase mb-8 fade-up">
            {HOME.eyebrow}
          </p>
          <h1 className="font-serif font-black text-[var(--brand)] text-[28px] sm:text-[40px] lg:text-[52px] leading-[1.1] tracking-[-0.03em] mb-8 fade-up-d1">
            {HOME.headline[0]}<br />{HOME.headline[1]}
          </h1>
          <p className="text-[15px] text-[#555] leading-[2] max-w-[420px] mb-16 fade-up-d2">
            {HOME.body.map((line, i) => (
              <span key={i}>{line}{i < HOME.body.length - 1 && <br />}</span>
            ))}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-[#d8d8d8] max-w-[580px] fade-up-d3">
            {HOME.quickLinks.map(({ href, label, sub }) => (
              <Link key={href} href={href} className="bg-white px-5 py-4 group hover:bg-[#f0f0ee] transition-colors">
                <p className="text-[13px] font-medium text-[#0a0a0a] mb-1 group-hover:underline underline-offset-2">{label}</p>
                <p className="text-[10px] text-[#aaa]">{sub}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Values ──────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-8 py-24 fade-up">
        <p className="text-[11px] tracking-[0.3em] text-[#aaa] uppercase mb-14">
          {HOME.valuesSectionLabel}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-14 md:gap-8">
          {HOME.values.map(({ num, title, desc }) => (
            <div key={num}>
              <span className="text-[10px] text-[#ccc] tracking-widest block mb-4">{num}</span>
              <h2 className="font-serif font-bold text-[26px] text-[var(--brand)] tracking-tight mb-3 leading-snug">{title}</h2>
              <p className="text-[13px] text-[#666] leading-[1.9]">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Notice bar ──────────────────────────────── */}
      <NoticeBar />
    </div>
  );
}
