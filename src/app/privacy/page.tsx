import type { Metadata } from 'next';

// 개인정보처리방침 — 카카오 로그인 개인정보 동의항목 심사에 이 페이지 주소를 낸다.
// 수집 항목이 바뀌면(동의항목 추가 등) 여기 표와 시행일도 같이 고친다.

export const metadata: Metadata = { title: '개인정보처리방침' };

const EFFECTIVE_DATE = '2026년 10월 13일';

// [구분, 수집 항목, 수집 조건(필수/선택), 이용 목적]
const ITEMS = [
  ['카카오 로그인', '카카오 회원번호', '필수', '회원 식별, 로그인'],
  ['카카오 로그인', '카카오계정 전화번호', '필수', '수업 예약 확인 및 선결제 이용 내역 알림톡 발송, 보호자 본인 확인'],
  ['회원가입 정보 입력', '아이 이름(닉네임), 이용 센터, 대표 보호자 전화번호 뒷 4자리', '필수', '센터 아동과 보호자 계정 연결, 관리자 승인'],
  ['회원가입 정보 입력', '회원 코드(센터에서 받은 번호)', '선택', '센터 아동 명단과 빠르게 연결'],
  ['서비스 이용 중 생성', '수업 예약 내역, 선결제 충전·사용 내역', '필수', '수업 예약 관리, 선결제 잔여 횟수 안내'],
];

const h2 = 'font-bold text-[15px] text-[#222] mt-10 mb-3';
const p = 'text-[13px] text-[#555] leading-[1.9]';
const td = 'border border-[#e5e5e5] px-3 py-2 align-top';

export default function PrivacyPage() {
  return (
    <div className="max-w-[768px] mx-auto px-4 sm:px-8 pt-10 pb-20 break-keep">
      <h1 className="font-serif font-bold text-[26px] text-[var(--brand)] tracking-tight mb-6">개인정보처리방침</h1>
      <p className={p}>
        위(We) 아동발달센터(이하 &lsquo;센터&rsquo;)는 「개인정보 보호법」에 따라 보호자의 개인정보를 보호하고, 관련 고충을 신속하게 처리하기 위하여 다음과 같이 개인정보처리방침을 둡니다.
      </p>

      <h2 className={h2}>1. 수집하는 개인정보 항목과 이용 목적</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px] text-[#555] border-collapse">
          <thead className="bg-[#f7f7f7] text-[#333]">
            <tr><th className={td}>구분</th><th className={td}>수집 항목</th><th className={`${td} whitespace-nowrap`}>수집 조건</th><th className={td}>이용 목적</th></tr>
          </thead>
          <tbody>
            {ITEMS.map(([a, b, c, d]) => (
              <tr key={b}><td className={td}>{a}</td><td className={td}>{b}</td><td className={`${td} text-center whitespace-nowrap`}>{c}</td><td className={td}>{d}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={`${p} mt-3`}>필수 항목에 동의하지 않으면 회원가입(카카오 로그인)을 할 수 없고, 선택 항목은 동의하지 않아도 서비스를 이용할 수 있습니다. 센터는 위 목적 외의 용도로 개인정보를 이용하지 않으며, 이용 목적이 바뀌면 미리 동의를 받습니다.</p>

      <h2 className={h2}>2. 보유 및 이용 기간</h2>
      <p className={p}>
        회원 탈퇴 또는 센터 이용 종료 시 지체 없이 파기합니다. 다만 관계 법령에 따라 보존할 필요가 있는 경우 해당 법령에서 정한 기간 동안 보관합니다.
        (전자상거래 등에서의 소비자보호에 관한 법률: 대금결제 및 재화 등의 공급에 관한 기록 5년)
      </p>

      <h2 className={h2}>3. 개인정보의 제3자 제공</h2>
      <p className={p}>센터는 보호자의 개인정보를 제3자에게 제공하지 않습니다. 다만 법령에 따라 요구되는 경우는 예외로 합니다.</p>

      <h2 className={h2}>4. 개인정보 처리의 위탁</h2>
      <p className={p}>센터는 서비스 제공을 위해 다음과 같이 개인정보 처리를 위탁합니다.</p>
      <ul className={`${p} list-disc pl-5 mt-1`}>
        <li>Supabase Inc. — 회원 정보 및 예약 데이터 보관 (해외 클라우드 서버)</li>
        <li>Vercel Inc. — 홈페이지 호스팅</li>
        <li>카카오 알림톡 발송 대행사 — 알림톡 발송 (발송 시작 시 업체명을 이곳에 추가합니다)</li>
      </ul>

      <h2 className={h2}>5. 개인정보의 파기 절차 및 방법</h2>
      <p className={p}>보유 기간이 지나거나 처리 목적이 달성된 개인정보는 지체 없이 복구할 수 없는 방법으로 삭제합니다.</p>

      <h2 className={h2}>6. 정보주체의 권리와 행사 방법</h2>
      <p className={p}>
        보호자는 언제든지 자신의 개인정보 열람, 정정, 삭제, 처리 정지를 요청할 수 있으며, 아래 연락처로 요청하시면 지체 없이 조치합니다.
        카카오 로그인 연결은 카카오톡 설정 &gt; 카카오계정 &gt; 연결된 서비스 관리에서 직접 끊을 수 있습니다.
      </p>

      <h2 className={h2}>7. 개인정보 보호책임자</h2>
      <ul className={`${p} list-none`}>
        <li>성명: 설영수 (대표)</li>
        <li>전화: 010-4842-3164</li>
        <li>주소: 서울특별시 은평구 수색로 217-1, 상가동 2층 210호</li>
      </ul>
      <p className={`${p} mt-2`}>
        개인정보 침해에 대한 신고나 상담은 개인정보침해신고센터(국번 없이 118), 개인정보분쟁조정위원회(1833-6972)에 문의하실 수 있습니다.
      </p>

      <h2 className={h2}>8. 시행일</h2>
      <p className={p}>이 개인정보처리방침은 {EFFECTIVE_DATE}부터 적용됩니다.</p>
    </div>
  );
}
