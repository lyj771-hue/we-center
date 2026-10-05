import { supabase } from './supabaseClient';

// 수업스케쥴 — 표 구조는 supabase/schedule.sql 참고.
// 날짜는 시간대 문제를 피하려고 'YYYY-MM-DD' 문자열로만 다룬다.

export interface Teacher {
  id: string;
  name: string;
  order: number;
}

export interface Holiday {
  date: string;
  label: string;
}

export interface Slot {
  id: string;
  teacherId: string;
  day: string;
  time: string;
  bookedBy?: string;
  /** 관리자 화면에서만: 신청한 분의 닉네임 */
  owner?: string;
}

export interface Booking {
  id: string;
  slotId?: string;
  userId?: string;
  nickname: string;
  label: string;
  createdAt: string;
  cancelledAt?: string;
}

export interface Schedule {
  id: string;
  /** 한 주 스케쥴이면 그 주 월요일, 공휴일 스케쥴이면 첫 날짜 */
  weekStart: string;
  /** 공휴일 스케쥴: 관리자가 고른 날짜들. 없으면 월~토 */
  days?: string[];
  title: string;
  notice: string;
  holidays: Holiday[];
  createdAt: string;
  slots: Slot[];
  bookings: Booking[];
}

/** 형식: 선생님 id → 요일(0=일, 1=월 … 6=토) → 시간들 */
export type TemplateData = Record<string, Record<string, string[]>>;

export interface Template {
  id: string;
  name: string;
  data: TemplateData;
}

// ── 날짜 ─────────────────────────────────────────────────────────────

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

export function toYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: string, n: number): string {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return toYmd(d);
}

/** 오늘이 속한 주의 월요일 (주말이면 지난 월요일) */
export function thisMonday(): string {
  const d = new Date();
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return toYmd(d);
}

/** 월~토 날짜 6개 */
export function weekDays(weekStart: string): string[] {
  return [0, 1, 2, 3, 4, 5].map(i => addDays(weekStart, i));
}

/** "10/5(월)" */
export function shortDay(s: string): string {
  const d = parseYmd(s);
  return `${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]})`;
}

/** "월" */
export function dowLabel(s: string): string {
  return DOW[parseYmd(s).getDay()];
}

/** "10월 5일(월)" */
export function longDay(s: string): string {
  const d = parseYmd(s);
  return `${d.getMonth() + 1}월 ${d.getDate()}일(${DOW[d.getDay()]})`;
}

/** "10월 5일(월) ~ 10월 10일(토)" */
export function weekRange(weekStart: string): string {
  return `${longDay(weekStart)} ~ ${longDay(addDays(weekStart, 5))}`;
}

/** 스케쥴의 날짜들 — 공휴일 스케쥴이면 고른 날짜, 아니면 월~토 */
export function scheduleDays(s: Pick<Schedule, 'weekStart' | 'days'>): string[] {
  return s.days?.length ? s.days : weekDays(s.weekStart);
}

/** 공지에 쓰는 기간 — "10월 5일(월) ~ 10월 9일(금)" 또는 "10월 9일(금), 12월 25일(금)" */
export function scheduleRange(s: Pick<Schedule, 'weekStart' | 'days'>): string {
  return s.days?.length ? s.days.map(longDay).join(', ') : weekRange(s.weekStart);
}

/** "2026/10/9, 2026.12.25(금)" 같은 글을 날짜들로 — 잘못된 것은 bad 로 */
export function parseDateList(text: string): { dates: string[]; bad: string[] } {
  const dates = new Set<string>();
  const bad: string[] = [];
  for (const raw of text.split(/[,，\n]/)) {
    const part = raw.replace(/\(.*?\)/g, '').trim();
    if (!part) continue;
    const m = part.match(/^(\d{4})\s*[./\-년]\s*(\d{1,2})\s*[./\-월]\s*(\d{1,2})\s*일?$/);
    if (!m) { bad.push(part); continue; }
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (d.getMonth() !== Number(m[2]) - 1) { bad.push(part); continue; }
    dates.add(toYmd(d));
  }
  return { dates: [...dates].sort(), bad };
}

/** "2026/10/09(금)" */
export function slashDay(s: string): string {
  const d = parseYmd(s);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}(${DOW[d.getDay()]})`;
}

// ── 읽기 ─────────────────────────────────────────────────────────────

export async function getTeachers(): Promise<Teacher[]> {
  const { data, error } = await supabase.from('teachers').select('*').order('sort_order');
  if (error) throw error;
  return (data ?? []).map(r => ({ id: r.id, name: r.name, order: r.sort_order }));
}

/** 이번 주부터의 스케쥴 (관리자는 지난 스케쥴도 includePast 로) — 최신 주가 위 */
export async function getSchedules(includePast = false): Promise<Schedule[]> {
  let q = supabase.from('schedules').select('*').order('week_start', { ascending: false });
  if (!includePast) q = q.gte('week_start', thisMonday());
  const { data: rows, error } = await q;
  if (error) throw error;
  if (!rows?.length) return [];
  const ids = rows.map(r => r.id);
  const [slotsRes, bookingsRes] = await Promise.all([
    supabase.from('slots').select('*').in('schedule_id', ids),
    supabase.from('bookings').select('*').in('schedule_id', ids).order('created_at'),
  ]);
  if (slotsRes.error) throw slotsRes.error;
  if (bookingsRes.error) throw bookingsRes.error;

  const bookings = (bookingsRes.data ?? []).map(b => ({
    id: b.id, scheduleId: b.schedule_id as string, slotId: b.slot_id ?? undefined, userId: b.user_id ?? undefined,
    nickname: b.nickname, label: b.label, createdAt: b.created_at, cancelledAt: b.cancelled_at ?? undefined,
  }));
  // 칸마다 살아 있는 신청 기록의 닉네임 (관리자 화면용)
  const ownerOf = new Map(bookings.filter(b => !b.cancelledAt && b.slotId).map(b => [b.slotId!, b.nickname]));

  return rows.map(r => ({
    id: r.id,
    weekStart: r.week_start,
    days: Array.isArray(r.days) && r.days.length ? (r.days as string[]) : undefined,
    title: r.title,
    notice: r.notice,
    holidays: (r.holidays ?? []) as Holiday[],
    createdAt: r.created_at,
    slots: (slotsRes.data ?? [])
      .filter(s => s.schedule_id === r.id)
      .map(s => ({
        id: s.id, teacherId: s.teacher_id, day: s.day, time: s.time,
        bookedBy: s.booked_by ?? undefined,
        owner: s.booked_by ? ownerOf.get(s.id) : undefined,
      }))
      .sort((a, b) => (a.day + a.time).localeCompare(b.day + b.time)),
    bookings: bookings.filter(b => b.scheduleId === r.id),
  }));
}

// ── 신청 · 취소 ──────────────────────────────────────────────────────

export async function bookSlot(slotId: string): Promise<'ok' | 'taken' | 'not_approved'> {
  const { data, error } = await supabase.rpc('book_slot', { p_slot: slotId });
  if (error) throw error;
  return data;
}

export async function cancelSlot(slotId: string): Promise<void> {
  const { data, error } = await supabase.rpc('cancel_slot', { p_slot: slotId });
  if (error) throw error;
  if (data !== 'ok') throw new Error(data);
}

// ── 관리자: 스케쥴 올리기 · 고치기 · 지우기 ─────────────────────────────

export interface ScheduleDraft {
  weekStart: string;
  /** 공휴일 스케쥴의 날짜들 (월~토 한 주면 비움) */
  days?: string[];
  title: string;
  notice: string;
  holidays: Holiday[];
  /** 올릴 칸들 (선생님·날짜·시간) */
  slots: { teacherId: string; day: string; time: string }[];
}

const slotKey = (s: { teacherId: string; day: string; time: string }) => `${s.teacherId}|${s.day}|${s.time}`;

/** 새로 올리거나(id 없음) 고친다. 고칠 땐 신청된 칸은 그대로 두고, 빈 칸만 넣고 뺀다 */
export async function saveSchedule(draft: ScheduleDraft, existing?: Schedule): Promise<void> {
  const head = {
    week_start: draft.weekStart,
    days: draft.days?.length ? draft.days : null,
    title: draft.title.trim(),
    notice: draft.notice,
    holidays: draft.holidays,
  };
  let id = existing?.id;
  if (id) {
    const { error } = await supabase.from('schedules').update(head).eq('id', id);
    if (error) throw error;
  } else {
    const { data, error } = await supabase.from('schedules').insert(head).select('id').single();
    if (error) throw error;
    id = data.id as string;
  }

  const want = new Set(draft.slots.map(slotKey));
  const have = new Map((existing?.slots ?? []).map(s => [slotKey(s), s]));
  const removeIds = [...have.entries()].filter(([k, s]) => !want.has(k) && !s.bookedBy).map(([, s]) => s.id);
  const add = draft.slots.filter(s => !have.has(slotKey(s)));

  if (removeIds.length) {
    const { error } = await supabase.from('slots').delete().in('id', removeIds);
    if (error) throw error;
  }
  if (add.length) {
    const { error } = await supabase.from('slots').insert(add.map(s => ({ schedule_id: id, teacher_id: s.teacherId, day: s.day, time: s.time })));
    if (error) throw error;
  }
}

export async function deleteSchedule(id: string): Promise<void> {
  const { error } = await supabase.from('schedules').delete().eq('id', id);
  if (error) throw error;
}

// ── 관리자: 형식 ─────────────────────────────────────────────────────

export async function getTemplates(): Promise<Template[]> {
  const { data, error } = await supabase.from('schedule_templates').select('*').order('created_at');
  if (error) throw error;
  return (data ?? []).map(r => ({ id: r.id, name: r.name, data: r.data as TemplateData }));
}

export async function saveTemplate(name: string, data: TemplateData, id?: string): Promise<void> {
  const { error } = id
    ? await supabase.from('schedule_templates').update({ name, data }).eq('id', id)
    : await supabase.from('schedule_templates').insert({ name, data });
  if (error) throw error;
}

export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await supabase.from('schedule_templates').delete().eq('id', id);
  if (error) throw error;
}

// ── 관리자: 선생님 명단 ──────────────────────────────────────────────

export async function addTeacher(name: string, order: number): Promise<void> {
  const { error } = await supabase.from('teachers').insert({ name: name.trim(), sort_order: order });
  if (error) throw error;
}

export async function updateTeacher(id: string, patch: { name?: string; order?: number }): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.order !== undefined) row.sort_order = patch.order;
  const { error } = await supabase.from('teachers').update(row).eq('id', id);
  if (error) throw error;
}

export async function deleteTeacher(id: string): Promise<void> {
  const { error } = await supabase.from('teachers').delete().eq('id', id);
  if (error) throw error;
}
