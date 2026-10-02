import type { Metadata } from 'next';
import { PAYMENT } from '@/lib/content';
import PaymentBoard from '@/components/PaymentBoard';
import PageShell, { PageTitle } from '@/components/PageShell';

export const metadata: Metadata = { title: '결제정보' };

export default function PaymentPage() {
  return (
    <PageShell page="payment" heading={PAYMENT.heading} subtext={PAYMENT.subtext.join('\n')} defaultWidth={1024}>
      <div className="max-w-[var(--page-w)] mx-auto px-5 md:px-8 pt-8 pb-14 md:pt-14 fade-up">
        <PageTitle eyebrow={PAYMENT.eyebrow} className="mb-10 md:mb-12" />

        {/* 결제 수단 카드 — 관리자가 사진·내용·순서를 관리 */}
        <PaymentBoard />
      </div>
    </PageShell>
  );
}
