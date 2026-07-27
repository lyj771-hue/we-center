import type { Metadata } from 'next';

export const metadata: Metadata = { title: '결제정보' };

const PLANS = [
  { label: '초기 평가', price: '150,000', unit: '1회', desc: '첫 내원 시 실시하는 종합 발달 평가입니다.' },
  { label: '개인 치료', price: '80,000', unit: '50분', desc: '1:1 개인 맞춤형 재활 치료 프로그램입니다.' },
  { label: '소그룹 치료', price: '55,000', unit: '50분', desc: '2~3인 소그룹으로 진행되는 사회성 중심 치료입니다.' },
  { label: '부모 상담', price: '50,000', unit: '50분', desc: '가정 내 치료 연계를 위한 전문 부모 교육 및 상담입니다.' },
];

export default function PaymentPage() {
  return (
    <div className="max-w-3xl mx-auto px-8 py-14 fade-up">
      <div className="mb-14">
        <p className="text-[11px] tracking-[0.3em] text-[#aaa] uppercase mb-5">결제정보</p>
        <h1 className="display-heading mb-3">투명하게 안내드립니다</h1>
        <p className="text-[14px] text-[#666] leading-relaxed">
          치료 비용과 결제 방법을 명확하게 공개합니다.<br />
          궁금하신 사항은 언제든 센터로 문의해 주세요.
        </p>
      </div>

      {/* Pricing table */}
      <div className="divide-y divide-[#f0f0f0] mb-16">
        {PLANS.map((p, i) => (
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
            <li className="flex gap-3"><span className="text-[#bbb]">—</span>현금 및 계좌이체</li>
            <li className="flex gap-3"><span className="text-[#bbb]">—</span>신용카드 / 체크카드</li>
            <li className="flex gap-3"><span className="text-[#bbb]">—</span>카카오페이 / 네이버페이</li>
          </ul>
        </div>

        <div>
          <p className="text-[11px] tracking-[0.2em] text-[#aaa] mb-4">취소 및 환불 정책</p>
          <ul className="space-y-2 text-[13px] text-[#555] leading-relaxed">
            <li className="flex gap-3"><span className="text-[#bbb]">—</span>예약 취소는 최소 <strong className="font-medium text-[#0a0a0a]">24시간 전</strong>까지 가능합니다.</li>
            <li className="flex gap-3"><span className="text-[#bbb]">—</span>당일 취소 및 무단 결석 시 해당 회기 비용이 청구됩니다.</li>
            <li className="flex gap-3"><span className="text-[#bbb]">—</span>치료사 사정에 의한 취소 시 100% 환불 또는 보강 처리됩니다.</li>
          </ul>
        </div>

        <div>
          <p className="text-[11px] tracking-[0.2em] text-[#aaa] mb-4">계좌 정보</p>
          <div className="bg-[#f8f8f8] px-6 py-4 text-[13px] text-[#555] space-y-1">
            <p>은행명 : <span className="text-[#0a0a0a] font-medium">신한은행</span></p>
            <p>계좌번호 : <span className="text-[#0a0a0a] font-medium tracking-wider">110-000-000000</span></p>
            <p>예금주 : <span className="text-[#0a0a0a] font-medium">WE 소아재활센터</span></p>
          </div>
        </div>

        <div>
          <p className="text-[11px] tracking-[0.2em] text-[#aaa] mb-4">바우처 / 복지 카드</p>
          <p className="text-[13px] text-[#555] leading-relaxed">
            발달재활서비스 바우처 및 장애아동복지지원 바우처를 사용하실 수 있습니다.<br />
            자세한 사항은 <strong className="font-medium text-[#0a0a0a]">센터로 직접 문의</strong>해 주시기 바랍니다.
          </p>
        </div>
      </div>
    </div>
  );
}
