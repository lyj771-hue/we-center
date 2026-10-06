export interface Post {
  id: string;
  title: string;
  content: string;
  imageUrl?: string;
  category: 'thoughts' | 'notices' | 'etc';
  createdAt: string;
}

export interface CenterRoom {
  id: string;
  centerId: 'susaek' | 'uijeongbu';
  name: string;
  description: string;
  imageUrl?: string;
  order: number;
}

export interface Subject {
  id: string;
  name: string;
  description: string;
  order: number;
}

/** 결제정보 페이지의 결제 수단 카드 (바우처, 굳센 카드 등) */
export interface PaymentMethod {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
  order: number;
}

/** 카카오로 로그인한 보호자. 보호자 닉네임은 처음 한 번 보호자가 입력하고, 그 뒤 변경은 관리자만.
 *  센터 닉네임은 관리자가 정하고, 승인일자가 있으면 승인된 회원이다 */
export interface Profile {
  userId: string;
  nickname: string;
  centerNickname?: string;
  memo?: string;
  approvedAt?: string;
  /** 대표 보호자 전화번호 뒷 4자리 (가입할 때 필수) */
  phoneLast4?: string;
  /** 가입할 때 적은 회원 코드 (맞지 않았어도 남겨 둔다) */
  requestedCode?: string;
}

/** 회원 관리의 지원 항목(받으면 true)과 선결제 남은 횟수 — 관리자만 본다 */
export interface MemberExtras {
  voucher: boolean;
  gusen: boolean;
  kkumideun: boolean;
  woojin: boolean;
  subsidy: boolean;
  prepaidEunpyeong: number;
  prepaidUijeongbu: number;
}

/** 회원 관리 표 한 줄 — 로그인 계정 정보 + 닉네임 (닉네임을 아직 안 정했으면 nickname 이 빈 문자열) */
export interface Member extends Profile, MemberExtras {
  kakaoId: string;
  joinedAt: string;
  lastSignInAt?: string;
}

export type Category = 'thoughts' | 'notices' | 'etc';
