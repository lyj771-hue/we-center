// 맨 아래 — 사업자 정보 + 저작권. (보호자 로그인은 상단 오른쪽 버튼)
// 사업자 정보는 사업자등록증과 똑같이 적는다 — 카카오 비즈니스 심사가 홈페이지의 사업자 정보와 대조한다.
const BUSINESS = [
  ['상호', '위(We) 아동발달센터'],
  ['대표', '설영수'],
  ['사업자등록번호', '392-97-00933'],
  ['주소', '서울특별시 은평구 수색로 217-1, 상가동 2층 210호 (증산동, 디엠씨 자이2단지)'],
];

export default function Footer() {
  return (
    <footer className="border-t border-[#ebebeb] py-8 px-4 text-center text-[11px] text-[#aaa]">
      <p className="leading-[1.9] break-keep">
        {BUSINESS.map(([k, v], i) => (
          <span key={k} className="inline-block">
            {i > 0 && <span className="mx-2 text-[#ddd]">|</span>}
            {k} {v}
          </span>
        ))}
      </p>
      <p className="mt-2 tracking-widest">© {new Date().getFullYear()} WE 소아재활센터</p>
    </footer>
  );
}
