import type { Metadata } from 'next';
import { PAYMENT } from '@/lib/content';
import PaymentBoard from '@/components/PaymentBoard';

export const metadata: Metadata = { title: '결제정보' };

export default function PaymentPage() {
  return (
    <div className="max-w-5xl mx-auto px-5 md:px-8 pt-8 pb-14 md:pt-14 fade-up">
      <div className="mb-10 md:mb-12">
        <p className="md:hidden text-[11px] tracking-[0.3em] text-[#aaa] uppercase mb-5">{PAYMENT.eyebrow}</p>
        <h1 className="display-heading mb-3">{PAYMENT.heading}</h1>
        <p className="text-[14px] text-[#666] leading-relaxed">
          {PAYMENT.subtext.map((line, i) => (
            <span key={i}>{line}{i < PAYMENT.subtext.length - 1 && <br />}</span>
          ))}
        </p>
      </div>

      {/* 결제 수단 카드 — 관리자가 사진·내용·순서를 관리 */}
      <PaymentBoard />
    </div>
  );
}
