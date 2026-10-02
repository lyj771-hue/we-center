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

export type Category = 'thoughts' | 'notices' | 'etc';
