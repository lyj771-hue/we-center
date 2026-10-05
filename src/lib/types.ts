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

/** 카카오로 로그인한 보호자의 닉네임. 처음 한 번 보호자가 입력하고, 그 뒤엔 관리자만 바꾼다 */
export type ProfileStatus = 'pending' | 'approved' | 'rejected';

export interface Profile {
  userId: string;
  nickname: string;
  status: ProfileStatus;
  createdAt: string;
}

export type Category = 'thoughts' | 'notices' | 'etc';
