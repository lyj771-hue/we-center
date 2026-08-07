import type { Metadata } from 'next';
import Link from 'next/link';
import { WE_CONCEPT } from '@/lib/content';

export const metadata: Metadata = { title: 'We컨셉' };

export default function WeConceptPage() {
  return (
    <div className="fade-up">
      {/* Hero */}
      <div className="max-w-5xl mx-auto px-8 pt-8 md:pt-14">
        <p className="md:hidden text-[11px] tracking-[0.3em] text-[#aaa] uppercase mb-5">{WE_CONCEPT.eyebrow}</p>
        <h1 className="display-heading mb-4 max-w-lg">{WE_CONCEPT.heading}</h1>
        <p className="text-[14px] text-[#666] leading-relaxed max-w-md mb-10">{WE_CONCEPT.subtext}</p>
      </div>

      <div className="max-w-5xl mx-auto px-8 mb-16">
        <div className="overflow-hidden bg-[#f2f2f2] aspect-[5/2]">
          <img src={WE_CONCEPT.heroImage} alt={WE_CONCEPT.heading} className="w-full h-full object-cover" />
        </div>
      </div>

      {/* Pull quote */}
      <div className="max-w-3xl mx-auto px-8 mb-24 text-center">
        <p className="font-serif font-bold text-[28px] sm:text-[36px] leading-[1.4] text-[#0a0a0a] tracking-tight">
          &ldquo;{WE_CONCEPT.quote}&rdquo;
        </p>
      </div>

      {/* Pillars */}
      <div className="max-w-5xl mx-auto px-8 mb-24">
        <p className="text-[11px] tracking-[0.3em] text-[#aaa] uppercase mb-14">We가 지키는 원칙</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-14">
          {WE_CONCEPT.pillars.map(({ num, title, desc }) => (
            <div key={num}>
              <span className="text-[10px] text-[#ccc] tracking-widest block mb-4">{num}</span>
              <h2 className="font-serif font-bold text-[22px] text-[#0a0a0a] tracking-tight mb-3 leading-snug">{title}</h2>
              <p className="text-[13px] text-[#666] leading-[1.9]">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Closing */}
      <section className="border-t border-[#ebebeb]">
        <div className="max-w-5xl mx-auto px-8 py-14 flex items-center justify-between gap-6 flex-wrap">
          <p className="text-[13px] text-[#444]">{WE_CONCEPT.closing.text}</p>
          <div className="flex gap-4 text-[12px]">
            {WE_CONCEPT.closing.links.map(({ href, label }, i) => (
              <span key={href} className="flex items-center gap-4">
                {i > 0 && <span className="text-[#ddd]">|</span>}
                <Link href={href} className="text-[#888] hover:text-[#0a0a0a] transition-colors underline underline-offset-2">{label}</Link>
              </span>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
