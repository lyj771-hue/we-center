// ─────────────────────────────────────────────
//  사이트 전체 텍스트 콘텐츠
//  여기서만 문구를 수정하면 모든 페이지에 반영됩니다.
// ─────────────────────────────────────────────

export const SITE = {
  name: 'We 소아재활센터',
  description: '아이들의 더 나은 내일을 위한 We 소아재활센터',
  footerCopy: '© {year} We 센터',
};

// ── 홈 (/) ────────────────────────────────────
export const HOME = {
  eyebrow: '반가워요!!!',
  headline: ['서로 기대어 서요'],
  // 빈 줄('') = 한 줄 띄우기, **글자** = 굵게
  body: [
    '"**비스듬이**" 라는 시에서',
    '나무는 그냥 서 있는 게 아니라',
    '공기에 기대어 서 있는 거래요',
    '',
    '**우리도 서로 기대어 서요**',
  ],
  // 소개 글 아래 두 칸 — 누르면 We센터의 그 센터 탭으로
  quickLinks: [
    { href: '/we-center#susaek',    label: 'We 수색 센터' },
    { href: '/we-center#uijeongbu', label: 'We 의정부 센터' },
  ],
  valuesSectionLabel: 'We가 추구하는 가치',
  values: [
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
  ],
  noticeBar: {
    text: '더 궁금한 점이 있으신가요?',
    links: [
      { href: '/notices', label: '공지사항 보기' },
      { href: '/payment', label: '결제 안내' },
    ],
  },
};

// ── We센터 (/we-center) ───────────────────────
export const WE_CENTER = {
  eyebrow: 'We 센터',
  heading: 'We 공간을 소개합니다',
  centers: [
    { id: 'susaek'     as const, label: '수색 센터',   addr: '서울특별시 은평구' },
    { id: 'uijeongbu' as const, label: '의정부 센터', addr: '경기도 의정부시' },
  ],
};

// ── We수업과목 (/we-subjects) ─────────────────
export const WE_SUBJECTS = {
  eyebrow: 'We 수업과목',
  heading: 'We 수업 과목을 소개합니다',
};

// ── We재활생각 (/we-thoughts) ────────────────
export const WE_THOUGHTS = {
  eyebrow: 'We재활생각',
  heading: 'We재활생각',
  subtext: '재활에 대한 We의 생각을 나눕니다.',
};

// ── We슐랭 (/we-slang) ───────────────────────
export const WE_SLANG = {
  heading: 'We슐랭',
};

// ── 공지사항 (/notices) ───────────────────────
export const NOTICES = {
  eyebrow: '공지사항',
  heading: '센터 소식과 안내',
  subtext: 'We 소아재활센터의 새로운 소식을 전합니다.',
};

// ── 기타 (/etc) ───────────────────────────────
export const ETC = {
  eyebrow: '기타',
  heading: '그 밖의 이야기들',
  subtext: '분류가 어렵거나 다양한 내용을 자유롭게 올려두는 공간입니다.',
};

// ── 결제정보 (/payment) ───────────────────────
export const PAYMENT = {
  eyebrow: '결제정보',
  heading: '투명하게 안내드립니다',
  subtext: [
    '치료 비용과 결제 방법을 명확하게 공개합니다.',
    '궁금하신 사항은 언제든 센터로 문의해 주세요.',
  ],
  // 결제 수단 카드(바우처·굳센·꿈이든·선결제·신용카드/현금)는 DB payment_methods에서 관리자가 관리한다
};

// ── 오시는길 (/location) ─────────────────────
export const LOCATION = {
  eyebrow: '오시는길',
  heading: '찾아오시는 방법',
  subtext: '수색과 의정부 두 곳에서 만나뵐 수 있습니다.',
};
