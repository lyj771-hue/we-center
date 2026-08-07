import type { Metadata } from 'next';
import { PAYMENT } from '@/lib/content';

export const metadata: Metadata = { title: '결제정보' };

export default function PaymentPage() {
  return (
    <div className="max-w-3xl mx-auto px-8 pt-8 pb-14 md:pt-14 fade-up">
      <div className="mb-14">
        <p className="md:hidden text-[11px] tracking-[0.3em] text-[#aaa] uppercase mb-5">{PAYMENT.eyebrow}</p>
        <h1 className="display-heading mb-3">{PAYMENT.heading}</h1>
        <p className="text-[14px] text-[#666] leading-relaxed">
          {PAYMENT.subtext.map((line, i) => (
            <span key={i}>{line}{i < PAYMENT.subtext.length - 1 && <br />}</span>
          ))}
        </p>
      </div>

      {/* Pricing table */}
      <div className="divide-y divide-[#f0f0f0] mb-16">
        {PAYMENT.plans.map((p, i) => (
          <div key={i} className="flex items-start gap-6 py-6">
            <span className="text-[10px] text-[#ccc] w-6 shrink-0 pt-1">{String(i + 1).padStart(2, '0')}</span>
            <div className="flex-1">
              <div className="flex items-baseline justify-between mb-2">
                <p className="text-[15px] font-medium">{p.label}</p>
                <div className="text-right">
                  <span className="text-[17px] font-light tabular-nums">{p.price}</span>
                  <span className="text-[11px] text-[#aaa] ml-1">원 / {p.unit}</span>
                </div>
              </div>
              <p className="text-[12px] text-[#888] leading-relaxed">{p.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Payment methods */}
      <div className="border-t border-[#e5e5e5] pt-10 space-y-8">
        <div>
          <p className="text-[11px] tracking-[0.2em] text-[#aaa] mb-4">결제 방법</p>
          <ul className="space-y-2 text-[13px] text-[#555]">
            {PAYMENT.methods.map((m, i) => (
              <li key={i} className="flex gap-3"><span className="text-[#bbb]">—</span>{m}</li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-[11px] tracking-[0.2em] text-[#aaa] mb-4">취소 및 환불 정책</p>
          <ul className="space-y-2 text-[13px] text-[#555] leading-relaxed">
            {PAYMENT.cancellationPolicy.map((item, i) => (
              <li key={i} className="flex gap-3">
                <span className="text-[#bbb]">—</span>
                {'prefix' in item
                  ? <span>{item.prefix}<strong className="font-medium text-[#0a0a0a]">{item.bold}</strong>{item.text}</span>
                  : <span>{item.text}</span>
                }
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-[11px] tracking-[0.2em] text-[#aaa] mb-4">계좌 정보</p>
          <div className="bg-[#f8f8f8] px-6 py-4 text-[13px] text-[#555] space-y-1">
            <p>은행명 : <span className="text-[#0a0a0a] font-medium">{PAYMENT.bankAccount.bank}</span></p>
            <p>계좌번호 : <span className="text-[#0a0a0a] font-medium tracking-wider">{PAYMENT.bankAccount.number}</span></p>
            <p>예금주 : <span className="text-[#0a0a0a] font-medium">{PAYMENT.bankAccount.holder}</span></p>
          </div>
        </div>

        <div>
          <p className="text-[11px] tracking-[0.2em] text-[#aaa] mb-4">바우처 / 복지 카드</p>
          <p className="text-[13px] text-[#555] leading-relaxed whitespace-pre-line">{PAYMENT.voucher}</p>
        </div>
      </div>
    </div>
  );
}
