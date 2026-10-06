import { supabase } from './supabaseClient';
import { Post, Category, CenterRoom, Subject, PaymentMethod, Profile, Member, MemberExtras } from './types';

// ── Posts (thoughts / notices / etc) ─────────────────────────────────────────

interface PostRow {
  id: string;
  category: Category;
  title: string;
  content: string;
  image_url: string | null;
  created_at: string;
}

function fromPostRow(row: PostRow): Post {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    content: row.content,
    imageUrl: row.image_url ?? undefined,
    createdAt: row.created_at,
  };
}

export async function getAllPosts(cat: Category): Promise<Post[]> {
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .eq('category', cat)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as PostRow[]).map(fromPostRow);
}

export async function getPost(cat: Category, id: string): Promise<Post | null> {
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .eq('category', cat)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? fromPostRow(data as PostRow) : null;
}

export async function addPost(cat: Category, data: Pick<Post, 'title' | 'content' | 'imageUrl'>): Promise<Post> {
  const { data: row, error } = await supabase
    .from('posts')
    .insert({ category: cat, title: data.title, content: data.content, image_url: data.imageUrl ?? null })
    .select()
    .single();
  if (error) throw error;
  return fromPostRow(row as PostRow);
}

export async function updatePost(cat: Category, id: string, data: Partial<Pick<Post, 'title' | 'content' | 'imageUrl'>>): Promise<void> {
  const patch: Partial<PostRow> = {};
  if (data.title !== undefined) patch.title = data.title;
  if (data.content !== undefined) patch.content = data.content;
  if (data.imageUrl !== undefined) patch.image_url = data.imageUrl ?? null;
  const { error } = await supabase.from('posts').update(patch).eq('category', cat).eq('id', id);
  if (error) throw error;
}

export async function deletePost(cat: Category, id: string): Promise<void> {
  const { error } = await supabase.from('posts').delete().eq('category', cat).eq('id', id);
  if (error) throw error;
}

// ── Center Rooms ──────────────────────────────────────────────────────────────

interface RoomRow {
  id: string;
  center_id: 'susaek' | 'uijeongbu';
  name: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
}

function fromRoomRow(row: RoomRow): CenterRoom {
  return {
    id: row.id,
    centerId: row.center_id,
    name: row.name,
    description: row.description ?? '',
    imageUrl: row.image_url ?? undefined,
    order: row.sort_order,
  };
}

export async function getRooms(centerId: 'susaek' | 'uijeongbu'): Promise<CenterRoom[]> {
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('center_id', centerId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data as RoomRow[]).map(fromRoomRow);
}

export async function addRoom(room: Omit<CenterRoom, 'id'>): Promise<void> {
  const { error } = await supabase.from('rooms').insert({
    center_id: room.centerId,
    name: room.name,
    description: room.description,
    image_url: room.imageUrl ?? null,
    sort_order: room.order,
  });
  if (error) throw error;
}

export async function updateRoom(id: string, data: Partial<Omit<CenterRoom, 'id'>>): Promise<void> {
  const patch: Partial<RoomRow> = {};
  if (data.centerId !== undefined) patch.center_id = data.centerId;
  if (data.name !== undefined) patch.name = data.name;
  if (data.description !== undefined) patch.description = data.description;
  if (data.imageUrl !== undefined) patch.image_url = data.imageUrl ?? null;
  if (data.order !== undefined) patch.sort_order = data.order;
  const { error } = await supabase.from('rooms').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteRoom(id: string): Promise<void> {
  const { error } = await supabase.from('rooms').delete().eq('id', id);
  if (error) throw error;
}

// ── Subjects ──────────────────────────────────────────────────────────────────

interface SubjectRow {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
}

function fromSubjectRow(row: SubjectRow): Subject {
  return { id: row.id, name: row.name, description: row.description ?? '', order: row.sort_order };
}

export async function getSubjects(): Promise<Subject[]> {
  const { data, error } = await supabase.from('subjects').select('*').order('sort_order', { ascending: true });
  if (error) throw error;
  return (data as SubjectRow[]).map(fromSubjectRow);
}

export async function addSubject(data: Omit<Subject, 'id'>): Promise<void> {
  const { error } = await supabase.from('subjects').insert({
    name: data.name,
    description: data.description,
    sort_order: data.order,
  });
  if (error) throw error;
}

export async function updateSubject(id: string, data: Partial<Omit<Subject, 'id'>>): Promise<void> {
  const patch: Partial<SubjectRow> = {};
  if (data.name !== undefined) patch.name = data.name;
  if (data.description !== undefined) patch.description = data.description;
  if (data.order !== undefined) patch.sort_order = data.order;
  const { error } = await supabase.from('subjects').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteSubject(id: string): Promise<void> {
  const { error } = await supabase.from('subjects').delete().eq('id', id);
  if (error) throw error;
}

// ── Location ──────────────────────────────────────────────────────────────────

export interface LocationData {
  content: string;
  imageUrls: string[];
}

interface LocationRow {
  content: string;
  image_urls: string[];
}

export async function getLocation(): Promise<LocationData> {
  const { data, error } = await supabase.from('location_info').select('content, image_urls').eq('id', 1).maybeSingle();
  if (error) throw error;
  const row = data as LocationRow | null;
  return { content: row?.content ?? '', imageUrls: row?.image_urls ?? [] };
}

export async function saveLocation(data: LocationData): Promise<void> {
  const { error } = await supabase
    .from('location_info')
    .upsert({ id: 1, content: data.content, image_urls: data.imageUrls });
  if (error) throw error;
}

// ── Payment methods (결제정보 카드) ───────────────────────────────────────────

interface PaymentMethodRow {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
}

function fromPaymentMethodRow(row: PaymentMethodRow): PaymentMethod {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    imageUrl: row.image_url ?? undefined,
    order: row.sort_order,
  };
}

export async function getPaymentMethods(): Promise<PaymentMethod[]> {
  const { data, error } = await supabase.from('payment_methods').select('*').order('sort_order', { ascending: true });
  if (error) throw error;
  return (data as PaymentMethodRow[]).map(fromPaymentMethodRow);
}

export async function addPaymentMethod(data: Omit<PaymentMethod, 'id'>): Promise<void> {
  const { error } = await supabase.from('payment_methods').insert({
    name: data.name,
    description: data.description,
    image_url: data.imageUrl ?? null,
    sort_order: data.order,
  });
  if (error) throw error;
}

export async function updatePaymentMethod(id: string, data: Partial<Omit<PaymentMethod, 'id'>>): Promise<void> {
  const patch: Partial<PaymentMethodRow> = {};
  if (data.name !== undefined) patch.name = data.name;
  if (data.description !== undefined) patch.description = data.description;
  if (data.imageUrl !== undefined) patch.image_url = data.imageUrl ?? null;
  if (data.order !== undefined) patch.sort_order = data.order;
  const { error } = await supabase.from('payment_methods').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deletePaymentMethod(id: string): Promise<void> {
  const { error } = await supabase.from('payment_methods').delete().eq('id', id);
  if (error) throw error;
}

// ── Page settings (페이지 제목·소개 문구·본문 폭) ─────────────────────────────
// 행이 없거나 값이 비면 각 페이지의 기본 문구(content.ts)를 쓴다.

export interface PageSetting {
  heading?: string;
  subtext?: string;
  contentWidth?: number;
}

interface PageSettingRow {
  page: string;
  heading: string | null;
  subtext: string | null;
  content_width: number | null;
}

export async function getPageSetting(page: string): Promise<PageSetting> {
  const { data, error } = await supabase.from('page_settings').select('*').eq('page', page).maybeSingle();
  if (error) throw error;
  const row = data as PageSettingRow | null;
  return {
    heading: row?.heading ?? undefined,
    subtext: row?.subtext ?? undefined,
    contentWidth: row?.content_width ?? undefined,
  };
}

export async function savePageSetting(page: string, data: PageSetting): Promise<void> {
  const { error } = await supabase.from('page_settings').upsert({
    page,
    heading: data.heading ?? null,
    subtext: data.subtext ?? null,
    content_width: data.contentWidth ?? null,
  });
  if (error) throw error;
}

// ── Profiles (카카오 로그인한 보호자의 닉네임) ──────────────────────────────────
// 보호자는 자기 줄을 한 번만(보호자 닉네임만) 만들 수 있고, 그 뒤 바꾸기·센터 닉네임·설명은 관리자만 — DB 정책이 막는다.

interface ProfileRow {
  user_id: string;
  nickname: string;
  center_nickname: string | null;
  memo: string | null;
  approved_at: string | null;
  phone_last4?: string | null;
  requested_code?: string | null;
}

function fromProfileRow(row: ProfileRow): Profile {
  return {
    userId: row.user_id,
    nickname: row.nickname,
    centerNickname: row.center_nickname ?? undefined,
    phoneLast4: row.phone_last4 ?? undefined,
    requestedCode: row.requested_code ?? undefined,
    memo: row.memo ?? undefined,
    approvedAt: row.approved_at ?? undefined,
  };
}

export async function signInWithKakao(): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'kakao',
    // 돌아올 곳은 지금 페이지 경로만 — 주소 뒤에 붙은 #토큰·?error 같은 꼬리까지 넘기면 주소가 계속 길어진다(414)
    options: { redirectTo: window.location.origin + window.location.pathname },
  });
  if (error) throw error;
}

export async function getMyProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data ? fromProfileRow(data as ProfileRow) : null;
}

/** 보호자가 처음 한 번 보호자 닉네임을 정한다 (승인 필요 없음) */
/** 처음 가입 — 아이 이름(닉네임)·대표 보호자 뒷 4자리. 회원 코드는 claimChild 로 따로 */
export async function createMyProfile(userId: string, nickname: string, phoneLast4: string): Promise<void> {
  const { error } = await supabase.from('profiles').insert({ user_id: userId, nickname: nickname.trim(), phone_last4: phoneLast4 });
  if (error) throw error;
}

/** 회원 코드로 아이와 잇기 — ok / no_code / taken / phone_mismatch / no_profile */
export async function claimChild(code: string): Promise<string> {
  const { data, error } = await supabase.rpc('claim_child', { p_code: code });
  if (error) throw error;
  return data;
}

interface MemberRow extends ProfileRow {
  voucher: boolean;
  gusen: boolean;
  kkumideun: boolean;
  woojin: boolean;
  subsidy: boolean;
  prepaid_eunpyeong: number;
  prepaid_uijeongbu: number;
  kakao_id: string | null;
  joined_at: string;
  last_sign_in_at: string | null;
}

/** 회원 관리 표 (관리자 전용 DB 함수) */
export async function getMembers(): Promise<Member[]> {
  const { data, error } = await supabase.rpc('admin_list_members');
  if (error) throw error;
  return (data as MemberRow[]).map(r => ({
    ...fromProfileRow({ ...r, nickname: r.nickname ?? '' }),
    kakaoId: r.kakao_id ?? '',
    joinedAt: r.joined_at,
    lastSignInAt: r.last_sign_in_at ?? undefined,
    voucher: !!r.voucher,
    gusen: !!r.gusen,
    kkumideun: !!r.kkumideun,
    woojin: !!r.woojin,
    subsidy: !!r.subsidy,
    prepaidEunpyeong: r.prepaid_eunpyeong ?? 0,
    prepaidUijeongbu: r.prepaid_uijeongbu ?? 0,
  }));
}

/** 관리자가 회원의 닉네임·설명·승인일자를 저장한다. 센터 닉네임이 겹치면 'taken' */
export async function saveMemberProfile(p: Profile & Partial<MemberExtras>): Promise<'ok' | 'taken'> {
  const extras: Record<string, unknown> = {};
  if (p.voucher !== undefined) extras.voucher = p.voucher;
  if (p.gusen !== undefined) extras.gusen = p.gusen;
  if (p.kkumideun !== undefined) extras.kkumideun = p.kkumideun;
  if (p.woojin !== undefined) extras.woojin = p.woojin;
  if (p.subsidy !== undefined) extras.subsidy = p.subsidy;
  if (p.prepaidEunpyeong !== undefined) extras.prepaid_eunpyeong = Math.max(0, Math.floor(p.prepaidEunpyeong) || 0);
  if (p.prepaidUijeongbu !== undefined) extras.prepaid_uijeongbu = Math.max(0, Math.floor(p.prepaidUijeongbu) || 0);
  const { error } = await supabase.from('profiles').upsert({
    ...extras,
    user_id: p.userId,
    nickname: p.nickname.trim(),
    ...(p.phoneLast4 !== undefined ? { phone_last4: /^\d{4}$/.test(p.phoneLast4) ? p.phoneLast4 : null } : {}),
    center_nickname: p.centerNickname?.trim() || null,
    memo: p.memo?.trim() || null,
    approved_at: p.approvedAt ?? null,
  });
  if (error?.code === '23505') return 'taken';
  if (error) throw error;
  return 'ok';
}

export async function deleteProfile(userId: string): Promise<void> {
  const { error } = await supabase.from('profiles').delete().eq('user_id', userId);
  if (error) throw error;
}
