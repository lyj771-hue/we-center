import { supabase } from './supabaseClient';
import { Post, Category, CenterRoom, Therapist, Subject } from './types';

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

// ── Therapists ────────────────────────────────────────────────────────────────

interface TherapistRow {
  id: string;
  name: string;
  role: string | null;
  description: string | null;
  photo_url: string | null;
  sort_order: number;
}

function fromTherapistRow(row: TherapistRow): Therapist {
  return {
    id: row.id,
    name: row.name,
    role: row.role ?? '',
    description: row.description ?? '',
    photoUrl: row.photo_url ?? undefined,
    order: row.sort_order,
  };
}

export async function getTherapists(): Promise<Therapist[]> {
  const { data, error } = await supabase.from('therapists').select('*').order('sort_order', { ascending: true });
  if (error) throw error;
  return (data as TherapistRow[]).map(fromTherapistRow);
}

export async function addTherapist(data: Omit<Therapist, 'id'>): Promise<void> {
  const { error } = await supabase.from('therapists').insert({
    name: data.name,
    role: data.role,
    description: data.description,
    photo_url: data.photoUrl ?? null,
    sort_order: data.order,
  });
  if (error) throw error;
}

export async function updateTherapist(id: string, data: Partial<Omit<Therapist, 'id'>>): Promise<void> {
  const patch: Partial<TherapistRow> = {};
  if (data.name !== undefined) patch.name = data.name;
  if (data.role !== undefined) patch.role = data.role;
  if (data.description !== undefined) patch.description = data.description;
  if (data.photoUrl !== undefined) patch.photo_url = data.photoUrl ?? null;
  if (data.order !== undefined) patch.sort_order = data.order;
  const { error } = await supabase.from('therapists').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteTherapist(id: string): Promise<void> {
  const { error } = await supabase.from('therapists').delete().eq('id', id);
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
