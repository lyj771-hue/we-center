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

export interface Therapist {
  id: string;
  name: string;
  role: string;
  description: string;
  photoUrl?: string;
  order: number;
}

export interface Subject {
  id: string;
  name: string;
  description: string;
  order: number;
}

export type Category = 'thoughts' | 'notices' | 'etc';
