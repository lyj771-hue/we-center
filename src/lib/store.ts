import { Post, Category, CenterRoom, Therapist, Subject } from './types';

const KEY = {
  thoughts: 'we_thoughts',
  notices: 'we_notices',
  etc: 'we_etc',
  rooms: 'we_rooms',
  therapists: 'we_therapists',
  subjects: 'we_subjects',
  location: 'we_location',
  admin: 'we_admin',
} as const;

export const ADMIN_PASSWORD = 'we2024';

function load<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(data));
}

// ── Posts (thoughts / notices / etc) ─────────────────────────────────────────

export function getAllPosts(cat: Category): Post[] {
  return load<Post[]>(KEY[cat], []).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function getPost(cat: Category, id: string): Post | null {
  return load<Post[]>(KEY[cat], []).find(p => p.id === id) ?? null;
}

export function addPost(cat: Category, data: Pick<Post, 'title' | 'content' | 'imageUrl'>): Post {
  const post: Post = { ...data, id: Date.now().toString(), category: cat, createdAt: new Date().toISOString() };
  const list = load<Post[]>(KEY[cat], []);
  save(KEY[cat], [...list, post]);
  return post;
}

export function updatePost(cat: Category, id: string, data: Partial<Pick<Post, 'title' | 'content' | 'imageUrl'>>): void {
  const list = load<Post[]>(KEY[cat], []).map(p => p.id === id ? { ...p, ...data } : p);
  save(KEY[cat], list);
}

export function deletePost(cat: Category, id: string): void {
  save(KEY[cat], load<Post[]>(KEY[cat], []).filter(p => p.id !== id));
}

// ── Center Rooms ──────────────────────────────────────────────────────────────

const DEFAULT_ROOMS: CenterRoom[] = [
  { id: 'r1', centerId: 'susaek', name: '대기실', description: '편안한 휴식을 위한 대기 공간입니다.', order: 1 },
  { id: 'r2', centerId: 'susaek', name: '치료실 1', description: '개인 심리운동 치료가 이루어지는 공간입니다.', order: 2 },
  { id: 'r3', centerId: 'susaek', name: '치료실 2', description: '감각통합 치료를 위한 전용 공간입니다.', order: 3 },
  { id: 'r4', centerId: 'uijeongbu', name: '대기실', description: '편안한 휴식을 위한 대기 공간입니다.', order: 1 },
  { id: 'r5', centerId: 'uijeongbu', name: '치료실 1', description: '개인 심리운동 치료가 이루어지는 공간입니다.', order: 2 },
  { id: 'r6', centerId: 'uijeongbu', name: '치료실 2', description: '감각통합 치료를 위한 전용 공간입니다.', order: 3 },
];

export function getRooms(centerId: 'susaek' | 'uijeongbu'): CenterRoom[] {
  return load<CenterRoom[]>(KEY.rooms, DEFAULT_ROOMS)
    .filter(r => r.centerId === centerId)
    .sort((a, b) => a.order - b.order);
}

export function getAllRooms(): CenterRoom[] {
  return load<CenterRoom[]>(KEY.rooms, DEFAULT_ROOMS);
}

export function saveRooms(rooms: CenterRoom[]): void {
  save(KEY.rooms, rooms);
}

export function addRoom(room: Omit<CenterRoom, 'id'>): void {
  const list = load<CenterRoom[]>(KEY.rooms, DEFAULT_ROOMS);
  save(KEY.rooms, [...list, { ...room, id: Date.now().toString() }]);
}

export function updateRoom(id: string, data: Partial<Omit<CenterRoom, 'id'>>): void {
  save(KEY.rooms, load<CenterRoom[]>(KEY.rooms, DEFAULT_ROOMS).map(r => r.id === id ? { ...r, ...data } : r));
}

export function deleteRoom(id: string): void {
  save(KEY.rooms, load<CenterRoom[]>(KEY.rooms, DEFAULT_ROOMS).filter(r => r.id !== id));
}

// ── Therapists ────────────────────────────────────────────────────────────────

const DEFAULT_THERAPISTS: Therapist[] = [
  { id: 't1', name: '김지현', role: '심리운동 재활사', description: '10년의 임상 경험을 바탕으로 아동 심리운동 치료를 전문으로 합니다.', order: 1 },
  { id: 't2', name: '박소연', role: '감각통합 재활사', description: '감각처리 어려움을 가진 아동을 위한 맞춤형 치료를 제공합니다.', order: 2 },
  { id: 't3', name: '이민준', role: '언어 재활사', description: '언어 발달 지연 및 의사소통 향상을 위한 치료를 담당합니다.', order: 3 },
];

export function getTherapists(): Therapist[] {
  return load<Therapist[]>(KEY.therapists, DEFAULT_THERAPISTS).sort((a, b) => a.order - b.order);
}

export function addTherapist(data: Omit<Therapist, 'id'>): void {
  const list = load<Therapist[]>(KEY.therapists, DEFAULT_THERAPISTS);
  save(KEY.therapists, [...list, { ...data, id: Date.now().toString() }]);
}

export function updateTherapist(id: string, data: Partial<Omit<Therapist, 'id'>>): void {
  save(KEY.therapists, load<Therapist[]>(KEY.therapists, DEFAULT_THERAPISTS).map(t => t.id === id ? { ...t, ...data } : t));
}

export function deleteTherapist(id: string): void {
  save(KEY.therapists, load<Therapist[]>(KEY.therapists, DEFAULT_THERAPISTS).filter(t => t.id !== id));
}

// ── Subjects ──────────────────────────────────────────────────────────────────

const DEFAULT_SUBJECTS: Subject[] = [
  { id: 's1', name: '심리운동', description: '움직임을 통해 아동의 심리적·신체적 발달을 촉진하는 치료입니다. 놀이, 운동, 신체 활동을 통해 자아 인식과 사회성을 향상시킵니다.', order: 1 },
  { id: 's2', name: '감각통합치료', description: '감각 처리 과정의 어려움을 가진 아동을 위한 전문 치료입니다. 다양한 감각 자극을 통해 뇌의 통합 기능을 향상시킵니다.', order: 2 },
  { id: 's3', name: '인지행동치료', description: '아동의 사고 패턴과 행동을 분석하고 긍정적인 방향으로 변화시키는 치료입니다.', order: 3 },
  { id: 's4', name: '언어치료', description: '언어 발달 지연, 조음 장애, 의사소통 어려움을 가진 아동을 위한 전문 치료입니다.', order: 4 },
  { id: 's5', name: '미술치료', description: '미술 활동을 통해 아동의 감정 표현과 창의적 발달을 도모하는 치료입니다.', order: 5 },
  { id: 's6', name: '놀이치료', description: '놀이를 매개로 아동의 심리적 문제를 해결하고 정서적 발달을 지원하는 치료입니다.', order: 6 },
];

export function getSubjects(): Subject[] {
  return load<Subject[]>(KEY.subjects, DEFAULT_SUBJECTS).sort((a, b) => a.order - b.order);
}

export function addSubject(data: Omit<Subject, 'id'>): void {
  const list = load<Subject[]>(KEY.subjects, DEFAULT_SUBJECTS);
  save(KEY.subjects, [...list, { ...data, id: Date.now().toString() }]);
}

export function updateSubject(id: string, data: Partial<Omit<Subject, 'id'>>): void {
  save(KEY.subjects, load<Subject[]>(KEY.subjects, DEFAULT_SUBJECTS).map(s => s.id === id ? { ...s, ...data } : s));
}

export function deleteSubject(id: string): void {
  save(KEY.subjects, load<Subject[]>(KEY.subjects, DEFAULT_SUBJECTS).filter(s => s.id !== id));
}

// ── Location ──────────────────────────────────────────────────────────────────

export interface LocationData {
  content: string;
  imageUrls: string[];
}

const DEFAULT_LOCATION: LocationData = {
  content: `수색 센터\n서울특별시 은평구 수색로 예시 주소\n\n의정부 센터\n경기도 의정부시 예시 주소\n\n주차 안내\n건물 지하 주차장 이용 가능 (2시간 무료)`,
  imageUrls: [],
};

export function getLocation(): LocationData {
  return load<LocationData>(KEY.location, DEFAULT_LOCATION);
}

export function saveLocation(data: LocationData): void {
  save(KEY.location, data);
}

// ── Admin ─────────────────────────────────────────────────────────────────────

export function isAdminSession(): boolean {
  if (typeof window === 'undefined') return false;
  return sessionStorage.getItem(KEY.admin) === '1';
}

export function setAdminSession(on: boolean): void {
  if (typeof window === 'undefined') return;
  on ? sessionStorage.setItem(KEY.admin, '1') : sessionStorage.removeItem(KEY.admin);
}
