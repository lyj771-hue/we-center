import { supabase } from './supabaseClient';
import { notifyScheduleChanged } from './sync';

// 수업스케쥴 — 표 구조는 supabase/schedule.sql 참고.
// 날짜는 시간대 문제를 피하려고 'YYYY-MM-DD' 문자열로만 다룬다.

export interface Teacher {
  id: string;
  name: string;
  order: number;
  /** 일하는 센터 — eunpyeong(은평) / uijeongbu(의정부) */
  centers: string[];
  /** 센터마다 출근 요일(0=일 … 6=토). 그 센터가 없으면 그 센터 모든 요일 */
  workDays?: Record<string, number[]>;
}

/** 쉬는 날 — teacherId 가 없으면 센터 공휴일, 있으면 그 선생님만 휴무(label 은 사유) */
export interface Holiday {
  date: string;
  label: string;
  teacherId?: string;
}

export interface Slot {
  id: string;
  teacherId: string;
  day: string;
  time: string;
  bookedBy?: string;
  /** 관리자 화면에서만: 신청한 보호자의 닉네임 */
  owner?: string;
  /** 관리자 화면에서만: 관리자 닉네임(보호자 닉네임과 다를 때만) */
  ownerCenter?: string;
  /** 보호자 취소 — requested = 취소중(관리자 승인 전), approved = 취소완료(시간은 계속 마감) */
  cancelState?: 'requested' | 'approved';
}

export interface Booking {
  id: string;
  slotId?: string;
  userId?: string;
  nickname: string;
  label: string;
  createdAt: string;
  cancelledAt?: string;
  /** book = 신청, cancel_request = 취소 신청, cancel_withdraw = 취소 신청 철회, cancel_approved = 취소 승인 */
  kind: 'book' | 'cancel_request' | 'cancel_withdraw' | 'cancel_approved';
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
  /** 어느 센터 스케쥴인지 — 'eunpyeong'(수색) / 'uijeongbu'(의정부) */
  center: 'eunpyeong' | 'uijeongbu';
  /** 숨긴 글 — 보호자에겐 안 보인다 */
  hiddenAt?: string;
  /** 예약 게시 시각 — 그 전에는 보호자에게 안 보인다(supabase/schedule-reserve.sql). 없으면 만든 즉시 게시 */
  publishAt?: string;
  /** 게시 후 10분 동안 보호자가 바로 취소할 수 있는 글 */
  freeCancel?: boolean;
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

/** 내일이 들어 있는 주의 월요일 — 마이페이지 주별 시간표 기본 주. 평일·토요일엔 이번 주, 일요일엔(내일이 월요일) 다음 주 */
export function tomorrowsMonday(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return toYmd(d);
}

/** 그 날짜가 들어 있는 주의 월요일 ("2026/10/20"·"2026-10-20" 둘 다). 날짜가 아니면 null */
export function mondayOf(s: string): string | null {
  const m = s.trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  if (isNaN(d.getTime())) return null;
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

/** 수업스케쥴용 선생님 — 지금은 은평 선생님만 */
// 수업스케쥴 선생님 — 두 센터 모두 (이번 주·다음 주 편집기는 은평 선생님만, 공휴일은 모두 보여 준다)
export async function getScheduleTeachers(): Promise<Teacher[]> {
  return getTeachers();
}

/** 잠시 빼 둔 선생님 — 선생님 시간표·수업 현황·수업스케쥴에는 안 나온다. 시간표 관리에서는 맨 오른쪽에 접어서 보인다(includeHidden).
 *  다시 다 넣으려면 이름을 지운다 */
export const HIDDEN_TEACHERS = ['이원재'];

export async function getTeachers(opts: { includeHidden?: boolean } = {}): Promise<Teacher[]> {
  const { data, error } = await supabase.from('teachers').select('*').order('sort_order');
  if (error) throw error;
  const rows = (data ?? []).filter(r => opts.includeHidden || !HIDDEN_TEACHERS.includes((r.name as string).trim()));
  // 빼 둔 선생님은 맨 뒤로
  rows.sort((x, y) => Number(HIDDEN_TEACHERS.includes((x.name as string).trim())) - Number(HIDDEN_TEACHERS.includes((y.name as string).trim())));
  return rows.map(r => ({
    id: r.id, name: r.name, order: r.sort_order,
    centers: (r.centers as string[] | null) ?? ['eunpyeong'],
    workDays: (r.work_days as Record<string, number[]> | null) ?? undefined,
  }));
}

/** 목록에 쓰는 스케쥴 한 줄 (시간·신청은 빼고) */
export interface ScheduleSummary {
  id: string;
  weekStart: string;
  days?: string[];
  title: string;
  createdAt: string;
  center: 'eunpyeong' | 'uijeongbu';
  /** 숨긴 글 — 보호자 목록에 안 보인다(신청 수업은 그대로) */
  hiddenAt?: string;
  /** 예약 게시 시각 */
  publishAt?: string;
}

type ScheduleRow = {
  id: string; week_start: string; days: unknown; title: string; notice: string; holidays: unknown; created_at: string; center?: string;
};

/** 스케쥴 목록 — 최신 주가 위 */
export async function listSchedules(): Promise<ScheduleSummary[]> {
  const { data, error } = await supabase
    .from('schedules').select('*')
    .order('week_start', { ascending: false }).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(r => ({
    id: r.id,
    weekStart: r.week_start,
    days: Array.isArray(r.days) && r.days.length ? (r.days as string[]) : undefined,
    title: r.title,
    createdAt: r.created_at,
    center: r.center === 'uijeongbu' ? 'uijeongbu' : 'eunpyeong',
    hiddenAt: r.hidden_at ?? undefined,
    publishAt: r.publish_at ?? undefined,
  }));
}

/** 스케쥴 하나 — 시간 칸과 신청 기록까지. 없거나 볼 권한이 없으면 null */
export async function getSchedule(id: string): Promise<Schedule | null> {
  const { data: r, error } = await supabase.from('schedules').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!r) return null;
  const row = r as ScheduleRow;
  const [slotsRes, bookingsRes] = await Promise.all([
    supabase.from('slots').select('*').eq('schedule_id', id),
    supabase.from('bookings').select('*').eq('schedule_id', id).order('created_at'),
  ]);
  if (slotsRes.error) throw slotsRes.error;
  if (bookingsRes.error) throw bookingsRes.error;

  const bookings: Booking[] = (bookingsRes.data ?? []).map(b => ({
    id: b.id, slotId: b.slot_id ?? undefined, userId: b.user_id ?? undefined,
    nickname: b.nickname, label: b.label, createdAt: b.created_at, cancelledAt: b.cancelled_at ?? undefined,
    kind: b.kind ?? 'book',
  }));
  // 칸마다 마지막 신청 기록의 닉네임 (관리자 화면용 — 취소 승인된 칸도 누구였는지 보이게)
  const ownerOf = new Map(bookings.filter(b => b.kind === 'book' && b.slotId).map(b => [b.slotId!, b.nickname]));
  // 지금 회원 정보의 이름 (관리자만 다른 보호자 것을 읽을 수 있다)
  const bookedIds = [...new Set((slotsRes.data ?? []).map(s => s.booked_by).filter(Boolean))] as string[];
  const names = new Map<string, { nickname: string; center?: string }>();
  if (bookedIds.length) {
    const { data: ps } = await supabase.from('profiles').select('user_id, nickname').in('user_id', bookedIds);
    for (const p of ps ?? []) names.set(p.user_id, { nickname: p.nickname });
  }

  return {
    id: row.id,
    weekStart: row.week_start,
    days: Array.isArray(row.days) && row.days.length ? (row.days as string[]) : undefined,
    title: row.title,
    notice: row.notice,
    holidays: (row.holidays ?? []) as Holiday[],
    createdAt: row.created_at,
    hiddenAt: (r as { hidden_at?: string | null }).hidden_at ?? undefined,
    publishAt: (r as { publish_at?: string | null }).publish_at ?? undefined,
    freeCancel: !!(r as { free_cancel?: boolean }).free_cancel,
    center: row.center === 'uijeongbu' ? 'uijeongbu' : 'eunpyeong',
    slots: (slotsRes.data ?? [])
      .map(s => ({
        id: s.id, teacherId: s.teacher_id, day: s.day, time: s.time,
        bookedBy: s.booked_by ?? undefined,
        owner: s.booked_by ? (names.get(s.booked_by)?.nickname ?? ownerOf.get(s.id)) : undefined,
        ownerCenter: s.booked_by && names.get(s.booked_by)?.center !== names.get(s.booked_by)?.nickname ? names.get(s.booked_by)?.center : undefined,
        cancelState: s.cancel_state ?? undefined,
      }))
      .sort((a, b) => (a.day + a.time).localeCompare(b.day + b.time)),
    bookings,
  };
}

// ── 신청 · 취소 ──────────────────────────────────────────────────────

/** 신청 — ok / taken(다른 분이 먼저) / not_approved / conflict(같은 시간에 이미 우리 아이 수업) */
export async function bookSlot(slotId: string): Promise<'ok' | 'taken' | 'not_approved' | 'conflict'> {
  const { data, error } = await supabase.rpc('book_slot', { p_slot: slotId });
  if (error) throw error;
  if (data === 'ok') notifyScheduleChanged();
  // 한발 늦음 — 대시보드(스케줄 잡기)에서 센다 (supabase/booking-misses.sql). 실패해도 그만
  if (data === 'taken') supabase.rpc('log_booking_miss', { p_slot: slotId }).then(() => {}, () => {});
  return data;
}

/** 신청 직후 — 그 보호자에게 '수업 확정' 알림톡 (실패해도 신청은 그대로) */
export async function notifyBooked(slotId: string): Promise<void> {
  try {
    await fetch('/api/alimtalk/booked', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeader()) }, body: JSON.stringify({ slotId }) });
  } catch { /* 알림이 안 가도 신청은 됐다 */ }
}

// ── 공휴일 (구글 공개 "대한민국의 휴일" 캘린더를 서버에서 읽는다) ─────────────

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}


/** 관리자: 대한민국 공휴일 날짜들 — 해마다 한 번만 불러 둔다 */
const holidayCache = new Map<string, Promise<string[]>>();
export function getKoreanHolidays(year: string): Promise<string[]> {
  let p = holidayCache.get(year);
  if (!p) {
    p = (async () => {
      const res = await fetch(`/api/calendar/holidays?${new URLSearchParams({ from: `${year}-01-01`, to: `${year}-12-31` })}`, { headers: await authHeader() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `오류 ${res.status}`);
      return (data.holidays ?? []) as string[];
    })();
    p.catch(() => holidayCache.delete(year));
    holidayCache.set(year, p);
  }
  return p;
}

/** 누구나: 공휴일 날짜 → 이름 (마이페이지 주별 시간표) — 해마다 한 번만 불러 둔다 */
const holidayNameCache = new Map<string, Promise<Record<string, string>>>();
export function getHolidayNames(year: string): Promise<Record<string, string>> {
  let p = holidayNameCache.get(year);
  if (!p) {
    p = (async () => {
      const res = await fetch(`/api/calendar/holidays?${new URLSearchParams({ from: `${year}-01-01`, to: `${year}-12-31`, names: '1' })}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `오류 ${res.status}`);
      return Object.fromEntries(((data.holidays ?? []) as { date: string; name: string }[]).map(h => [h.date, h.name]));
    })();
    p.catch(() => holidayNameCache.delete(year));
    holidayNameCache.set(year, p);
  }
  return p;
}

/** 게시됐는지 — 예약 게시 시각이 지났거나 예약이 없으면 */
export const isPublished = (s: Pick<Schedule, 'publishAt'>, now = Date.now()) => !s.publishAt || new Date(s.publishAt).getTime() <= now;
/** 자유 취소가 끝나는 시각(ms) — 게시(없으면 만든) 시각 + 10분. 자유 취소 글이 아니면 null */
export const FREE_CANCEL_MIN = 10;
export const freeCancelUntil = (s: Pick<Schedule, 'publishAt' | 'createdAt' | 'freeCancel'>) =>
  s.freeCancel ? new Date(s.publishAt ?? s.createdAt).getTime() + FREE_CANCEL_MIN * 60000 : null;
/** "2026/10/30(금) 15:30" */
export function publishLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}(${DOW[d.getDay()]}) ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 보호자: 게시 후 10분 안 — 내 신청을 바로 취소(시간이 다시 열린다). ok / too_late / not_allowed */
export async function freeCancelSlot(slotId: string): Promise<string> {
  const { data, error } = await supabase.rpc('free_cancel_slot', { p_slot: slotId });
  if (error) throw error;
  notifyScheduleChanged();
  return data;
}

/** 보호자: 아직 게시 전인 글 — 제목·게시 시각만 (알림톡 버튼으로 미리 들어왔을 때). 없으면 null */
export async function getSchedulePreview(id: string): Promise<{ title: string; center: string; publishAt: string } | null> {
  const { data, error } = await supabase.rpc('schedule_preview', { p_id: id });
  if (error || !data) return null;
  return { title: data.title, center: data.center, publishAt: data.publish_at };
}

/** 관리자: 신청을 지우고 시간을 다시 연다 */
export async function cancelSlot(slotId: string): Promise<void> {
  const { data, error } = await supabase.rpc('cancel_slot', { p_slot: slotId });
  if (error) throw error;
  if (data !== 'ok') throw new Error(data);
  notifyScheduleChanged();
}

// ── 관리자: 스케쥴 올리기 · 고치기 · 지우기 ─────────────────────────────

export interface ScheduleDraft {
  weekStart: string;
  /** 공휴일 스케쥴의 날짜들 (월~토 한 주면 비움) */
  days?: string[];
  title: string;
  notice: string;
  holidays: Holiday[];
  /** 센터 — 새로 올릴 때만 쓴다 */
  center?: 'eunpyeong' | 'uijeongbu';
  /** 올릴 칸들 (선생님·날짜·시간) */
  slots: { teacherId: string; day: string; time: string }[];
  /** 예약 게시 시각(ISO) — null 이면 바로 게시, undefined 면 그대로 둔다 */
  publishAt?: string | null;
  /** 게시 후 10분 자유 취소 — undefined 면 그대로 둔다 */
  freeCancel?: boolean;
}

const sameTime = (a?: string | null, b?: string | null) => (a ? new Date(a).getTime() : 0) === (b ? new Date(b).getTime() : 0);
const slotKey = (s: { teacherId: string; day: string; time: string }) => `${s.teacherId}|${s.day}|${s.time}`;

/** 새로 올리거나(id 없음) 고친다. 고칠 땐 신청된 칸은 그대로 두고, 빈 칸만 넣고 뺀다 */
export async function saveSchedule(draft: ScheduleDraft, existing?: Schedule): Promise<string> {
  const head = {
    week_start: draft.weekStart,
    days: draft.days?.length ? draft.days : null,
    title: draft.title.trim(),
    notice: draft.notice,
    holidays: draft.holidays,
    // 예약 칸 — SQL(schedule-reserve.sql) 전에도 저장되게 바꿀 때만 넣는다. 게시 시각이 바뀌면 5분 전 알림을 다시
    ...(draft.publishAt !== undefined && (draft.publishAt || existing?.publishAt)
      ? { publish_at: draft.publishAt, ...(!sameTime(draft.publishAt, existing?.publishAt) ? { prealert_at: null } : {}) } : {}),
    ...(draft.freeCancel !== undefined && (draft.freeCancel || existing?.freeCancel) ? { free_cancel: draft.freeCancel } : {}),
  };
  let id = existing?.id;
  if (id) {
    const { error } = await supabase.from('schedules').update(head).eq('id', id);
    if (error) throw error;
  } else {
    const { data, error } = await supabase.from('schedules').insert({ ...head, ...(draft.center ? { center: draft.center } : {}) }).select('id').single();
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
  notifyScheduleChanged();
  return id!;
}

/** 글 숨기기 / 다시 보이기 */
export async function setScheduleHidden(id: string, hidden: boolean): Promise<void> {
  const { error } = await supabase.from('schedules').update({ hidden_at: hidden ? new Date().toISOString() : null }).eq('id', id);
  if (error) throw error;
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

/** 선생님을 앞으로 계속 이 센터·요일에 나오게 — 센터를 더하고, 그 센터 출근 요일에 요일을 더한다(요일 목록이 없던 센터는 이 요일만) */
export async function addTeacherWorkDay(id: string, center: 'eunpyeong' | 'uijeongbu', weekday: number): Promise<void> {
  const { data, error } = await supabase.from('teachers').select('centers, work_days').eq('id', id).single();
  if (error) throw error;
  const centers = (data.centers as string[] | null) ?? ['eunpyeong'];
  const days = { ...((data.work_days as Record<string, number[]> | null) ?? {}) };
  const had = centers.includes(center);
  if (had && !days[center]) return;   // 이미 이 센터 모든 요일
  days[center] = [...new Set([...(had ? days[center] ?? [] : []), weekday])].sort();
  const { error: e2 } = await supabase.from('teachers').update({ centers: had ? centers : [...centers, center], work_days: days }).eq('id', id);
  if (e2) throw e2;
}

/** 선생님을 앞으로 이 센터·요일에서 빼기 — 그 센터 출근 요일에서 요일을 뺀다(요일 목록이 없던 센터는 월~토에서 뺀다) */
export async function removeTeacherWorkDay(id: string, center: 'eunpyeong' | 'uijeongbu', weekday: number): Promise<void> {
  const { data, error } = await supabase.from('teachers').select('centers, work_days').eq('id', id).single();
  if (error) throw error;
  const centers = (data.centers as string[] | null) ?? ['eunpyeong'];
  if (!centers.includes(center)) return;
  const days = { ...((data.work_days as Record<string, number[]> | null) ?? {}) };
  days[center] = (days[center] ?? [1, 2, 3, 4, 5, 6]).filter(d => d !== weekday);
  const { error: e2 } = await supabase.from('teachers').update({ work_days: days }).eq('id', id);
  if (e2) throw e2;
}

export async function deleteTeacher(id: string): Promise<void> {
  const { error } = await supabase.from('teachers').delete().eq('id', id);
  if (error) throw error;
}

/** 그날 그 센터에 게시 중인(아직 신청 없는) 시간 — "선생님|시간". 시간표에서 쉬는 시간을 연 칸은 빈칸으로 보이게 (관리자·선생님) */
export async function getPostedOpenSlots(day: string, center: 'eunpyeong' | 'uijeongbu'): Promise<Map<string, string>> {
  const { data: scs } = await supabase.from('schedules').select('*').eq('center', center).is('hidden_at', null);
  // 예약 게시 글(게시 전)의 시간은 "게시 예정"
  const reserved = new Set((scs ?? []).filter(r => r.publish_at && new Date(r.publish_at).getTime() > Date.now()).map(r => r.id as string));
  const ids = (scs ?? []).map(r => r.id as string);
  if (!ids.length) return new Map();
  const { data } = await supabase.from('slots').select('teacher_id, time, schedule_id').eq('day', day).is('booked_by', null).in('schedule_id', ids);
  const out = new Map<string, string>();
  for (const r of data ?? []) {
    const k = `${r.teacher_id}|${r.time}`;
    if (!reserved.has(r.schedule_id)) out.set(k, '게시 중'); else if (!out.has(k)) out.set(k, '게시 예정');
  }
  return out;
}
