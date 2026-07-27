import Link from 'next/link';

const QUICK = [
  { href: '/we-center',     label: 'We센터',     sub: '수색·의정부 공간 안내' },
  { href: '/we-subjects',   label: 'We수업과목',  sub: '치료 프로그램 소개' },
  { href: '/we-therapists', label: 'We재활사',    sub: '전문 치료진 소개' },
  { href: '/location',      label: '오시는길',    sub: '찾아오시는 방법' },
];

const VALUES = [
  {
    num: '01',
    title: '전문성',
    desc: '근거 기반 치료 프로그램으로 아이 한 명 한 명의 발달을 과학적으로 지원합니다.',
  },
  {
    num: '02',
    title: '신뢰',
    desc: '부모님과 투명하게 소통하며, 치료의 모든 과정을 함께 나눕니다.',
  },
  {
    num: '03',
    title: '함께',
    desc: '아이의 속도에 맞추어, 우리 모두가 같은 방향을 바라보며 걷습니다.',
  },
];

export default function HomePage() {
  return (
    <div>
      {/* ── Hero ────────────────────────────────────── */}
      <section
        className="min-h-[calc(100svh-160px)] flex flex-col justify-center
                   bg-[#f5f5f3] px-8 py-24"
      >
        <div className="max-w-5xl mx-auto w-full">
          <p className="text-[11px] tracking-[0.3em] text-[#aaa] uppercase mb-8 fade-up">
            WE 소아재활센터
          </p>

          <h1
            className="font-serif font-black text-[#0a0a0a]
                       text-[48px] sm:text-[60px] lg:text-[72px]
                       leading-[1.1] tracking-[-0.03em]
                       mb-8 fade-up-d1"
          >
            아이의 가능성을<br />
            함께 열어갑니다.
          </h1>

          <p className="text-[15px] text-[#555] leading-[2] max-w-[420px] mb-16 fade-up-d2">
            We는 아이와 부모, 그리고 재활사가<br />
            함께 만들어가는 소아 재활의 공간입니다.<br />
            수색과 의정부에서 여러분을 기다립니다.
          </p>

          {/* Quick links */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-[#d8d8d8] max-w-[580px] fade-up-d3">
            {QUICK.map(({ href, label, sub }) => (
              <Link
                key={href}
                href={href}
                className="bg-white px-5 py-4 group hover:bg-[#f0f0ee] transition-colors"
              >
                <p className="text-[13px] font-medium text-[#0a0a0a] mb-1 group-hover:underline underline-offset-2">
                  {label}
                </p>
                <p className="text-[10px] text-[#aaa]">{sub}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Values ──────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-8 py-24 fade-up">
        <p className="text-[11px] tracking-[0.3em] text-[#aaa] uppercase mb-14">
          We가 추구하는 가치
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-14 md:gap-8">
          {VALUES.map(({ num, title, desc }) => (
            <div key={num}>
              <span className="text-[10px] text-[#ccc] tracking-widest block mb-4">{num}</span>
              <h2 className="font-serif font-bold text-[26px] text-[#0a0a0a] tracking-tight mb-3 leading-snug">
                {title}
              </h2>
              <p className="text-[13px] text-[#666] leading-[1.9]">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Notice bar ──────────────────────────────── */}
      <section className="border-t border-[#ebebeb]">
        <div className="max-w-5xl mx-auto px-8 py-10 flex items-center justify-between gap-6 flex-wrap">
          <p className="text-[13px] text-[#444]">
            더 궁금한 점이 있으신가요?
          </p>
          <div className="flex gap-4 text-[12px]">
            <Link href="/notices" className="text-[#888] hover:text-[#0a0a0a] transition-colors underline underline-offset-2">공지사항 보기</Link>
            <span className="text-[#ddd]">|</span>
            <Link href="/payment" className="text-[#888] hover:text-[#0a0a0a] transition-colors underline underline-offset-2">결제 안내</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
