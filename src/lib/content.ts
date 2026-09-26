// ─────────────────────────────────────────────
//  사이트 전체 텍스트 콘텐츠
//  여기서만 문구를 수정하면 모든 페이지에 반영됩니다.
// ─────────────────────────────────────────────

export const SITE = {
  name: 'WE 소아재활센터',
  description: '아이들의 더 나은 내일을 위한 We 소아재활센터',
  footerCopy: '© {year} WE 소아재활센터',
};

// ── 홈 (/) ────────────────────────────────────
export const HOME = {
  eyebrow: 'WE 소아재활센터',
  headline: ['아이의 가능성을', '함께 열어갑니다.'],
  body: [
    'We는 아이와 부모, 그리고 재활사가',
    '함께 만들어가는 소아 재활의 공간입니다.',
    '수색과 의정부에서 여러분을 기다립니다.',
  ],
  quickLinks: [
    { href: '/we-center',     label: 'We센터',    sub: '수색·의정부 공간 안내' },
    { href: '/we-subjects',   label: 'We수업과목', sub: '치료 프로그램 소개' },
    { href: '/we-therapists', label: 'We재활사',   sub: '전문 치료진 소개' },
    { href: '/location',      label: '오시는길',   sub: '찾아오시는 방법' },
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

// ── We컨셉 (/we-concept) ───────────────────────
export const WE_CONCEPT = {
  eyebrow: 'We 컨셉',
  heading: '우리가 재활을 대하는 방식',
  subtext: '치료 하나하나가 아이의 하루, 그리고 성장의 이야기가 되도록 설계합니다.',
  heroImage: '/images/concept/hero.svg',
  quote: '치료가 아니라, 함께 자라는 시간입니다.',
  pillars: [
    {
      num: '01',
      title: '아이 중심 설계',
      desc: '프로그램이 아이에게 맞춰집니다. 정해진 커리큘럼이 아니라, 아이의 발달 단계와 속도에 맞춰 매 회기가 다시 설계됩니다.',
    },
    {
      num: '02',
      title: '통합적 접근',
      desc: '신체·인지·정서는 따로 자라지 않습니다. 심리운동, 감각통합, 언어, 인지행동 치료가 한 아이를 중심으로 유기적으로 연결됩니다.',
    },
    {
      num: '03',
      title: '부모와의 동행',
      desc: '치료실 안에서 끝나지 않습니다. 매 회기의 목표와 가정에서 이어갈 활동을 부모님과 함께 나누고 기록합니다.',
    },
    {
      num: '04',
      title: '기록되는 성장',
      desc: '작은 변화도 데이터로 남깁니다. 아이가 걸어온 재활의 과정을 눈으로 확인하고, 다음 목표를 함께 정합니다.',
    },
  ],
  closing: {
    text: 'We의 컨셉이 궁금하시다면, 공간과 프로그램에서 직접 확인해보세요.',
    links: [
      { href: '/we-center',   label: 'We센터 둘러보기' },
      { href: '/we-subjects', label: 'We수업과목 보기' },
    ],
  },
};

// ── We센터 (/we-center) ───────────────────────
export const WE_CENTER = {
  eyebrow: 'We 센터',
  heading: '우리의 공간을 소개합니다',
  subtext: '아이가 편안함을 느낄 수 있도록, 모든 공간을 세심하게 준비했습니다.',
  centers: [
    { id: 'susaek'     as const, label: '수색 센터',   addr: '서울특별시 은평구' },
    { id: 'uijeongbu' as const, label: '의정부 센터', addr: '경기도 의정부시' },
  ],
};

// ── We수업과목 (/we-subjects) ─────────────────
export const WE_SUBJECTS = {
  eyebrow: 'We 수업과목',
  heading: '아이에게 맞는 치료를 찾습니다',
  subtext: '한 아이를 위한 하나의 치료 계획—각 프로그램은 개별 발달 목표에 맞게 구성됩니다.',
};

// ── We재활사 (/we-therapists) ─────────────────
export const WE_THERAPISTS = {
  eyebrow: 'We 재활사',
  heading: '아이와 함께 걷는 사람들',
  subtext: '각 재활사는 아이의 속도를 존중하며, 발달의 모든 순간에 함께합니다.',
};

// ── We재활생각 (/we-thoughts) ────────────────
export const WE_THOUGHTS = {
  eyebrow: 'WE 소아재활센터',
  heading: 'We재활생각',
  subtext: '재활사들의 생각과 이야기를 메모처럼 붙여둡니다.',
};

// ── 공지사항 (/notices) ───────────────────────
export const NOTICES = {
  eyebrow: '공지사항',
  heading: '센터 소식과 안내',
  subtext: 'WE 소아재활센터의 새로운 소식을 전합니다.',
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
  plans: [
    { label: '초기 평가',   price: '150,000', unit: '1회',  desc: '첫 내원 시 실시하는 종합 발달 평가입니다.' },
    { label: '개인 치료',   price: '80,000',  unit: '50분', desc: '1:1 개인 맞춤형 재활 치료 프로그램입니다.' },
    { label: '소그룹 치료', price: '55,000',  unit: '50분', desc: '2~3인 소그룹으로 진행되는 사회성 중심 치료입니다.' },
    { label: '부모 상담',   price: '50,000',  unit: '50분', desc: '가정 내 치료 연계를 위한 전문 부모 교육 및 상담입니다.' },
  ],
  methods: ['현금 및 계좌이체', '신용카드 / 체크카드', '카카오페이 / 네이버페이'],
  cancellationPolicy: [
    { bold: '24시간 전', text: '까지 가능합니다.', prefix: '예약 취소는 최소 ' },
    { text: '당일 취소 및 무단 결석 시 해당 회기 비용이 청구됩니다.' },
    { text: '치료사 사정에 의한 취소 시 100% 환불 또는 보강 처리됩니다.' },
  ],
  bankAccount: {
    bank: '신한은행',
    number: '110-000-000000',
    holder: 'WE 소아재활센터',
  },
  voucher:
    '발달재활서비스 바우처 및 장애아동복지지원 바우처를 사용하실 수 있습니다.\n자세한 사항은 센터로 직접 문의해 주시기 바랍니다.',
};

// ── 오시는길 (/location) ─────────────────────
export const LOCATION = {
  eyebrow: '오시는길',
  heading: '찾아오시는 방법',
  subtext: '수색과 의정부 두 곳에서 만나뵐 수 있습니다.',
};
