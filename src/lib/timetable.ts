import { supabase } from './supabaseClient';
import { parseYmd } from './schedule';

// 관리자 시간표 — 표 구조는 supabase/timetable.sql 참고.
// 날짜별 표의 왼쪽(고정) 칸 = 그날 바꾼 칸(board_cells) ?? 요일 고정 수업(fixed_lessons)
// 오른쪽(빈타임) 칸 = 그날 직접 넣은 칸(board_cells) ?? 보호자가 수업스케쥴에서 신청한 시간(slots)

export interface Child {
  id: string;
  /** 회원 코드 (W0001 …) — 가입한 보호자 계정과 이을 때 쓴다 */
  memberCode?: string;
  name: string;
  /** 구강 수업 아이 (S) */
  oral?: boolean;
  /** 대표 보호자 전화번호 뒷 4자리 */
  phoneLast4?: string;
  number?: number;
  payment: string;
  memo?: string;
  /** 연결된 보호자 계정 — 계정 하나 = 아이 한 명 (홈페이지 가입 안 한 아이는 없음) */
  guardianUserId?: string;
}

/** 표 한 칸에 보이는 내용 */
export interface CellView {
  status: 'child' | 'undecided' | 'off' | 'none' | 'empty';
  name?: string;
  /** 보호자 신청 칸: 관리자 닉네임(보호자 닉네임과 다를 때) — 이름 아래 작게 */
  subName?: string;
  number?: number;
  payment: string;
  oral: boolean;
  absent: boolean;
  moved: boolean;
  note?: string;
  childId?: string;
  /** 어디서 온 칸인지 — fixed = 요일 고정, override = 그날 바꾼 칸, booking = 보호자 신청 */
  source: 'fixed' | 'override' | 'booking' | 'none';
}

export interface CellInput {
  status: 'child' | 'undecided' | 'off' | 'none';
  childId?: string | null;
  name?: string;
  payment?: string;
  oral?: boolean;
  absent?: boolean;
  moved?: boolean;
  note?: string;
}

// ── 시간 줄 ─────────────────────────────────────────────────────────

/** 월~금 시간 줄 — 12:20 점심, 16:30 쉬는 시간 (센터 스케줄표와 같다) */
const WEEKDAY_ROWS = ['09:00', '09:50', '10:40', '11:30', '12:20', '13:10', '14:00', '14:50', '15:40', '16:30', '16:50', '17:40', '18:30', '19:20'];
const SATURDAY_ROWS = ['09:00', '09:50', '10:40', '11:30', '12:20', '13:10', '13:30', '14:20', '15:10', '16:00', '16:50', '17:40', '18:30', '19:20'];
/** 아무도 없을 때 칸에 흐리게 보이는 글 */
export const ROW_LABEL: Record<string, string> = { '12:20': 'Lunch', '16:30': '쉬는 시간' };

export const rowsForWeekday = (weekday: number) => (weekday === 6 || weekday === 0 ? SATURDAY_ROWS : WEEKDAY_ROWS);
export const rowsForDay = (day: string) => rowsForWeekday(parseYmd(day).getDay());

/** 결제 글자 → 글자 색. b(바우처)=하늘색, 결제 글자 없음=빨강, 그 밖(e 굳센·c 꿈이든·v …)=검정 */
export function paymentColor(payment: string): string {
  const p = payment.toLowerCase().replace(/x/g, '');
  if (p.includes('b')) return '#0ea5e9';
  if (!p.trim()) return '#e11d48';
  return '#27272a';
}

const key = (teacherId: string, time: string) => `${teacherId}|${time}`;

// ── 아이 명단 ───────────────────────────────────────────────────────

export async function getChildren(): Promise<Child[]> {
  const { data, error } = await supabase.from('children').select('*').order('name');
  if (error) throw error;
  return (data ?? []).map(r => ({
    id: r.id, memberCode: r.member_code ?? undefined, name: r.name, oral: !!r.oral, phoneLast4: r.phone_last4 ?? undefined,
    number: r.number ?? undefined, payment: r.payment ?? '', memo: r.memo ?? undefined,
    guardianUserId: r.guardian_user_id ?? undefined,
  }));
}

export async function saveChild(c: Omit<Child, 'id'> & { id?: string }): Promise<void> {
  const row = {
    name: c.name.trim(), number: c.number ?? null, payment: c.payment.trim(), memo: c.memo?.trim() || null, oral: !!c.oral,
    phone_last4: c.phoneLast4 && /^\d{4}$/.test(c.phoneLast4) ? c.phoneLast4 : null,
  };
  const { error } = c.id ? await supabase.from('children').update(row).eq('id', c.id) : await supabase.from('children').insert(row);
  if (error) throw error;
}

/** 아이를 보호자 계정과 잇는다(계정 하나 = 아이 한 명). null 이면 연결을 끊는다 */
export async function linkChild(childId: string, userId: string | null): Promise<void> {
  if (userId) {
    // 이 계정에 이미 이어진 다른 아이가 있으면 먼저 끊는다
    const { error: e1 } = await supabase.from('children').update({ guardian_user_id: null }).eq('guardian_user_id', userId).neq('id', childId);
    if (e1) throw e1;
  }
  const { error } = await supabase.from('children').update({ guardian_user_id: userId }).eq('id', childId);
  if (error) throw error;
}

/** 아이별 고정 수업 — 아이 id → ["월 14:00 이정길 b", …] */
export async function getFixedByChild(): Promise<Map<string, { weekday: number; time: string; teacher: string; payment: string; oral: boolean }[]>> {
  const { data, error } = await supabase.from('fixed_lessons').select('child_id, weekday, time, payment, oral, teachers(name, sort_order)').order('weekday').order('time');
  if (error) throw error;
  const m = new Map<string, { weekday: number; time: string; teacher: string; payment: string; oral: boolean }[]>();
  for (const r of data ?? []) {
    if (!r.child_id) continue;
    const t = r.teachers as unknown as { name: string } | null;
    const list = m.get(r.child_id) ?? [];
    list.push({ weekday: r.weekday, time: r.time, teacher: t?.name ?? '', payment: r.payment ?? '', oral: !!r.oral });
    m.set(r.child_id, list);
  }
  return m;
}

export async function deleteChild(id: string): Promise<void> {
  const { error } = await supabase.from('children').delete().eq('id', id);
  if (error) throw error;
}

// ── 읽기 ────────────────────────────────────────────────────────────

const blank: CellView = { status: 'empty', payment: '', oral: false, absent: false, moved: false, source: 'none' };

type Row = Record<string, unknown>;

function fromRow(r: Row, source: CellView['source'], children: Map<string, Child>): CellView {
  const child = r.child_id ? children.get(r.child_id as string) : undefined;
  return {
    status: (r.status as CellView['status']) ?? 'child',
    name: (r.name as string) ?? child?.name,
    number: child?.number,
    payment: (r.payment as string) ?? '',
    oral: !!r.oral,
    absent: !!r.absent,
    moved: !!r.moved,
    note: (r.note as string) ?? undefined,
    childId: (r.child_id as string) ?? undefined,
    source,
  };
}

/** 요일 고정 시간표 — "선생님|시간" → 칸 */
export async function getFixedBoard(weekday: number, children: Child[]): Promise<Map<string, CellView>> {
  const byId = new Map(children.map(c => [c.id, c]));
  const { data, error } = await supabase.from('fixed_lessons').select('*').eq('weekday', weekday);
  if (error) throw error;
  return new Map((data ?? []).map(r => [key(r.teacher_id, r.time), fromRow({ ...r, status: 'child' }, 'fixed', byId)]));
}

/** 날짜별 표 — { fixed, open } 각각 "선생님|시간" → 칸 */
export async function getDayBoard(day: string, children: Child[]): Promise<{ fixed: Map<string, CellView>; open: Map<string, CellView> }> {
  const byId = new Map(children.map(c => [c.id, c]));
  const byName = new Map(children.map(c => [c.name, c]));
  const weekday = parseYmd(day).getDay();
  const [fixedRes, cellsRes, slotsRes] = await Promise.all([
    supabase.from('fixed_lessons').select('*').eq('weekday', weekday),
    supabase.from('board_cells').select('*').eq('day', day),
    supabase.from('slots').select('id, teacher_id, time, booked_by, cancel_state').eq('day', day).not('booked_by', 'is', null),
  ]);
  if (fixedRes.error) throw fixedRes.error;
  if (cellsRes.error) throw cellsRes.error;
  if (slotsRes.error) throw slotsRes.error;

  const fixed = new Map<string, CellView>();
  const open = new Map<string, CellView>();
  for (const r of fixedRes.data ?? []) fixed.set(key(r.teacher_id, r.time), fromRow({ ...r, status: 'child' }, 'fixed', byId));

  // 보호자 신청 — 보호자 닉네임(관리자 닉네임이 다르면 아래 작게). 아이 명단에서 그 보호자의 아이(또는 관리자 닉네임과 같은 이름)를 찾아 결제 글자를 붙인다
  const booked = slotsRes.data ?? [];
  if (booked.length) {
    const ids = [...new Set(booked.map(s => s.booked_by as string))];
    const { data: ps } = await supabase.from('profiles').select('user_id, nickname, center_nickname').in('user_id', ids);
    const prof = new Map((ps ?? []).map(p => [p.user_id as string, p]));
    for (const s of booked) {
      if (s.cancel_state === 'approved') continue;
      const p = prof.get(s.booked_by);
      const center = p?.center_nickname ?? undefined;
      const child = children.find(c => c.guardianUserId === s.booked_by) ?? (center ? byName.get(center) : undefined) ?? (p ? byName.get(p.nickname) : undefined);
      open.set(key(s.teacher_id, s.time), {
        ...blank, status: 'child', name: p?.nickname ?? '신청', subName: center && center !== p?.nickname ? center : undefined,
        number: child?.number, payment: child?.payment ?? '', childId: child?.id, source: 'booking',
        note: s.cancel_state === 'requested' ? '취소 신청 중' : undefined,
      });
    }
  }

  for (const r of cellsRes.data ?? []) {
    (r.side === 'fixed' ? fixed : open).set(key(r.teacher_id, r.time), fromRow(r, 'override', byId));
  }
  return { fixed, open };
}

export const cellOf = (m: Map<string, CellView>, teacherId: string, time: string): CellView => m.get(key(teacherId, time)) ?? blank;

// ── 쓰기 ────────────────────────────────────────────────────────────

const toRow = (c: CellInput) => ({
  status: c.status,
  child_id: c.childId ?? null,
  name: c.name?.trim() || null,
  payment: c.payment?.trim() ?? '',
  oral: !!c.oral,
  absent: !!c.absent,
  moved: !!c.moved,
  note: c.note?.trim() || null,
});

/** 날짜별 칸 저장 (그날만) */
export async function saveDayCell(day: string, teacherId: string, time: string, side: 'fixed' | 'open', c: CellInput): Promise<void> {
  const { error } = await supabase.from('board_cells').upsert(
    { day, teacher_id: teacherId, time, side, ...toRow(c), updated_at: new Date().toISOString() },
    { onConflict: 'day,teacher_id,time,side' },
  );
  if (error) throw error;
}

/** 날짜별 칸 되돌리기 — 고정 칸은 요일 고정 수업대로, 빈타임 칸은 비거나 보호자 신청대로 */
export async function resetDayCell(day: string, teacherId: string, time: string, side: 'fixed' | 'open'): Promise<void> {
  const { error } = await supabase.from('board_cells').delete().match({ day, teacher_id: teacherId, time, side });
  if (error) throw error;
}

/** 요일 고정 수업 저장 */
export async function saveFixed(weekday: number, teacherId: string, time: string, c: CellInput): Promise<void> {
  const { error } = await supabase.from('fixed_lessons').upsert(
    { weekday, teacher_id: teacherId, time, child_id: c.childId ?? null, name: c.name?.trim() ?? '', payment: c.payment?.trim() ?? '', oral: !!c.oral },
    { onConflict: 'teacher_id,weekday,time' },
  );
  if (error) throw error;
}

export async function deleteFixed(weekday: number, teacherId: string, time: string): Promise<void> {
  const { error } = await supabase.from('fixed_lessons').delete().match({ weekday, teacher_id: teacherId, time });
  if (error) throw error;
}

// ── 구글 캘린더 ─────────────────────────────────────────────────────

export type TimetableSync =
  | { action: 'full' }
  | { action: 'fixed'; teacherId: string; weekday: number; time: string }
  | { action: 'cell'; day: string; teacherId: string; time: string; side: 'fixed' | 'open' };

/** 시간표를 선생님 구글 캘린더에 맞춘다 (관리자). 결과를 그대로 돌려준다 */
export async function syncTimetable(body: TimetableSync): Promise<Record<string, unknown>> {
  const { data } = await supabase.auth.getSession();
  const res = await fetch('/api/calendar/timetable', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}) },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `오류 ${res.status}`);
  return json;
}
