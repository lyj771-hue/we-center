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
  /** 구강 수업 아이 (예전 칸 — lessonKind 와 맞춘다) */
  oral?: boolean;
  /** 이 아이 수업 종류 기본값 — 시간표에 넣을 때 처음 고른다 */
  lessonKind?: LessonKind;
  /** 대표 보호자 전화번호 뒷 4자리 */
  phoneLast4?: string;
  /** 한 달 제공 횟수(0 = 안 씀) — 바우처·굳센·꿈이든. 선결제는 지금까지 충전한 횟수 */
  voucherLimit?: number;
  gusenLimit?: number;
  kkumideunLimit?: number;
  prepaidTotal?: number;
  number?: number;
  memo?: string;
  /** 연결된 보호자 계정 — 계정 하나 = 아이 한 명 (홈페이지 가입 안 한 아이는 없음) */
  guardianUserId?: string;
  /** 쓰는 결제 (아이 명단 체크박스) */
  uses?: UsesFlags;
  /** 다니는 센터 — 수색(은평) / 의정부 */
  center?: Center;
  /** 우진학교·지원금 남은 금액(원) — 관리자가 적는다 */
  woojinBalance?: number;
  subsidyBalance?: number;
}

/** 수업 종류 — 운동 / 구강 / 없음(null, "-") */
export type LessonKind = 'exercise' | 'oral' | null;
export const LESSON_KINDS: { key: LessonKind; label: string }[] = [{ key: 'exercise', label: '운동' }, { key: 'oral', label: '구강' }, { key: null, label: '-' }];
export const kindLabel = (k?: LessonKind) => (k === 'exercise' ? '운동' : k === 'oral' ? '구강' : '');
/** 칸·고정 수업 줄 → 수업 종류 (kind 가 없던 예전 줄은 구강 체크로) */
const kindOf = (r: Record<string, unknown>): LessonKind => (r.kind === 'exercise' || r.kind === 'oral' ? r.kind : r.oral ? 'oral' : null);

export type UsesKey = 'voucher' | 'gusen' | 'kkumideun' | 'woojin' | 'subsidy' | 'prepaid';
export type UsesFlags = Record<UsesKey, boolean>;

/** 아이 이름 + 동명이인 숫자 (예: 김채현3) — 시간표·검색에서 이렇게 보인다 */
export const childLabel = (c: { name: string; number?: number }) => `${c.name}${c.number ?? ''}`;

/** 표 한 칸에 보이는 내용 */
export interface CellView {
  status: 'child' | 'undecided' | 'off' | 'none' | 'empty';
  name?: string;
  /** 보호자 신청 칸: 관리자 닉네임(보호자 닉네임과 다를 때) — 이름 아래 작게 */
  subName?: string;
  number?: number;
  payment: string;
  oral: boolean;
  /** 수업 종류 (운동 / 구강 / 없음) */
  kind?: LessonKind;
  absent: boolean;
  moved: boolean;
  note?: string;
  childId?: string;
  /** 고정 수업 시작일 (요일 고정 칸) */
  startDate?: string;
  /** 어디서 온 칸인지 — fixed = 요일 고정, override = 그날 바꾼 칸, booking = 보호자 신청 */
  source: 'fixed' | 'override' | 'booking' | 'none';
}

export interface CellInput {
  status: 'child' | 'undecided' | 'off' | 'none';
  childId?: string | null;
  name?: string;
  payment?: string;
  oral?: boolean;
  kind?: LessonKind;
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
    id: r.id, memberCode: r.member_code ?? undefined, name: r.name, oral: !!r.oral, lessonKind: r.lesson_kind === 'exercise' || r.lesson_kind === 'oral' ? r.lesson_kind : r.oral ? 'oral' : null, phoneLast4: r.phone_last4 ?? undefined,
    voucherLimit: r.voucher_limit ?? 0, gusenLimit: r.gusen_limit ?? 0, kkumideunLimit: r.kkumideun_limit ?? 0, prepaidTotal: r.prepaid_total ?? 0,
    number: r.number ?? undefined, memo: r.memo ?? undefined,
    guardianUserId: r.guardian_user_id ?? undefined,
    woojinBalance: r.woojin_balance ?? 0, subsidyBalance: r.subsidy_balance ?? 0,
    center: r.center === 'uijeongbu' ? 'uijeongbu' : 'eunpyeong',
    uses: { voucher: !!r.uses_voucher, gusen: !!r.uses_gusen, kkumideun: !!r.uses_kkumideun, woojin: !!r.uses_woojin, subsidy: !!r.uses_subsidy, prepaid: !!r.uses_prepaid },
  }));
}

/** 우진학교·지원금 남은 금액(원) 적기 */
export async function setChildBalance(childId: string, key: 'woojin' | 'subsidy', won: number): Promise<void> {
  const { error } = await supabase.from('children').update({ [`${key}_balance`]: Math.max(0, Math.floor(won) || 0) }).eq('id', childId);
  if (error) throw error;
}

/** 쓰는 결제 체크 켜기·끄기 */
export async function setChildUses(childId: string, key: UsesKey, on: boolean): Promise<void> {
  const { error } = await supabase.from('children').update({ [`uses_${key}`]: on }).eq('id', childId);
  if (error) throw error;
}

/** 그 달 사용 횟수를 직접 적은 값 — 아이 id → { voucher?: n, … } (month = 그 달 1일) */
export async function getMonthUsage(month: string): Promise<Map<string, Partial<Record<UsesKey, number>>>> {
  const { data, error } = await supabase.from('child_month_usage').select('child_id, method, used').eq('month', month);
  if (error) throw error;
  const m = new Map<string, Partial<Record<UsesKey, number>>>();
  for (const r of data ?? []) m.set(r.child_id as string, { ...m.get(r.child_id as string), [r.method as UsesKey]: r.used as number });
  return m;
}

/** 그 달 사용 횟수 적기 (null = 지우고 [결제 완료]로 센 횟수로) */
export async function setMonthUsage(childId: string, month: string, method: UsesKey, used: number | null): Promise<void> {
  const q = supabase.from('child_month_usage');
  const { error } = used === null
    ? await q.delete().match({ child_id: childId, month, method })
    : await q.upsert({ child_id: childId, month, method, used, updated_at: new Date().toISOString() }, { onConflict: 'child_id,month,method' });
  if (error) throw error;
}

export async function saveChild(c: Omit<Child, 'id'> & { id?: string }): Promise<void> {
  const row = {
    name: c.name.trim(), number: c.number ?? null, memo: c.memo?.trim() || null, oral: !!c.oral,
    ...(c.lessonKind !== undefined ? { lesson_kind: c.lessonKind, oral: c.lessonKind === 'oral' } : {}),
    ...(c.center ? { center: c.center } : {}),
    phone_last4: c.phoneLast4 && /^\d{4}$/.test(c.phoneLast4) ? c.phoneLast4 : null,
    ...(c.voucherLimit !== undefined ? { voucher_limit: Math.max(0, Math.floor(c.voucherLimit) || 0) } : {}),
    ...(c.gusenLimit !== undefined ? { gusen_limit: Math.max(0, Math.floor(c.gusenLimit) || 0) } : {}),
    ...(c.kkumideunLimit !== undefined ? { kkumideun_limit: Math.max(0, Math.floor(c.kkumideunLimit) || 0) } : {}),
    ...(c.prepaidTotal !== undefined ? { prepaid_total: Math.max(0, Math.floor(c.prepaidTotal) || 0) } : {}),
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
export async function getFixedByChild(): Promise<Map<string, { weekday: number; time: string; teacher: string; payment: string; oral: boolean; kind: LessonKind }[]>> {
  const { data, error } = await supabase.from('fixed_lessons').select('*, teachers(name, sort_order)').order('weekday').order('time');
  if (error) throw error;
  const m = new Map<string, { weekday: number; time: string; teacher: string; payment: string; oral: boolean; kind: LessonKind }[]>();
  for (const r of data ?? []) {
    if (!r.child_id) continue;
    const t = r.teachers as unknown as { name: string } | null;
    const list = m.get(r.child_id) ?? [];
    list.push({ weekday: r.weekday, time: r.time, teacher: t?.name ?? '', payment: r.payment ?? '', oral: !!r.oral, kind: kindOf(r) });
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
    kind: kindOf(r),
    absent: !!r.absent,
    moved: !!r.moved,
    note: (r.note as string) ?? undefined,
    childId: (r.child_id as string) ?? undefined,
    startDate: (r.start_date as string) ?? undefined,
    source,
  };
}

/** 센터 — 은평(수색) / 의정부. 시간표는 센터마다 따로다(설영수 선생님은 두 센터 모두) */
export type Center = 'eunpyeong' | 'uijeongbu';
export const CENTERS: { key: Center; label: string }[] = [
  { key: 'eunpyeong', label: '은평' },
  { key: 'uijeongbu', label: '의정부' },
];

/** 요일 고정 시간표 — "선생님|시간" → 칸 */
export async function getFixedBoard(weekday: number, children: Child[], center: Center = 'eunpyeong'): Promise<Map<string, CellView>> {
  const byId = new Map(children.map(c => [c.id, c]));
  const { data, error } = await supabase.from('fixed_lessons').select('*').eq('weekday', weekday).eq('center', center);
  if (error) throw error;
  return new Map((data ?? []).map(r => [key(r.teacher_id, r.time), fromRow({ ...r, status: 'child' }, 'fixed', byId)]));
}

/** 날짜별 표 — { fixed, open } 각각 "선생님|시간" → 칸 */
export async function getDayBoard(day: string, children: Child[], center: Center = 'eunpyeong'): Promise<{ fixed: Map<string, CellView>; open: Map<string, CellView> }> {
  const byId = new Map(children.map(c => [c.id, c]));
  const byName = new Map(children.map(c => [c.name, c]));
  const weekday = parseYmd(day).getDay();
  const [fixedRes, cellsRes, slotsRes, teachersRes] = await Promise.all([
    // 고정 수업은 시작일(start_date, 2026-10-01부터) 이후 날짜에만
    supabase.from('fixed_lessons').select('*').eq('weekday', weekday).eq('center', center).lte('start_date', day),
    supabase.from('board_cells').select('*').eq('day', day).eq('center', center),
    supabase.from('slots').select('*, schedules(*)').eq('day', day).not('booked_by', 'is', null),
    supabase.from('teachers').select('id, centers'),
  ]);
  if (fixedRes.error) throw fixedRes.error;
  if (cellsRes.error) throw cellsRes.error;
  if (slotsRes.error) throw slotsRes.error;
  if (teachersRes.error) throw teachersRes.error;
  // 수업스케쥴 신청은 은평에서 일하는 선생님이면 은평, 의정부만 다니는 선생님(공휴일 스케쥴)이면 의정부 표에
  const slotCenter = new Map((teachersRes.data ?? []).map(t => [t.id as string, ((t.centers as string[] | null) ?? ['eunpyeong']).includes('eunpyeong') ? 'eunpyeong' : 'uijeongbu']));

  const fixed = new Map<string, CellView>();
  const open = new Map<string, CellView>();
  for (const r of fixedRes.data ?? []) fixed.set(key(r.teacher_id, r.time), fromRow({ ...r, status: 'child' }, 'fixed', byId));

  // 보호자 신청 — 보호자 닉네임(관리자 닉네임이 다르면 아래 작게). 아이 명단에서 그 보호자의 아이(또는 관리자 닉네임과 같은 이름)를 찾아 결제 글자를 붙인다
  const booked = (slotsRes.data ?? []).filter(sl => ((sl.schedules as { center?: string } | null)?.center ?? slotCenter.get(sl.teacher_id) ?? 'eunpyeong') === center);
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
        number: child?.number, payment: '', childId: child?.id, source: 'booking',
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
  oral: c.kind !== undefined ? c.kind === 'oral' : !!c.oral,
  ...(c.kind !== undefined ? { kind: c.kind } : {}),
  absent: !!c.absent,
  moved: !!c.moved,
  note: c.note?.trim() || null,
});

/** 날짜별 칸 저장 (그날만) */
export async function saveDayCell(day: string, teacherId: string, time: string, side: 'fixed' | 'open', c: CellInput, center: Center = 'eunpyeong'): Promise<void> {
  const { error } = await supabase.from('board_cells').upsert(
    { center, day, teacher_id: teacherId, time, side, ...toRow(c), updated_at: new Date().toISOString() },
    { onConflict: 'center,day,teacher_id,time,side' },
  );
  if (error) throw error;
}

/** 날짜별 칸 되돌리기 — 고정 칸은 요일 고정 수업대로, 빈타임 칸은 비거나 보호자 신청대로 */
export async function resetDayCell(day: string, teacherId: string, time: string, side: 'fixed' | 'open', center: Center = 'eunpyeong'): Promise<void> {
  const { error } = await supabase.from('board_cells').delete().match({ center, day, teacher_id: teacherId, time, side });
  if (error) throw error;
}

/** 요일 고정 수업 저장 */
export async function saveFixed(weekday: number, teacherId: string, time: string, c: CellInput, center: Center = 'eunpyeong'): Promise<void> {
  const { error } = await supabase.from('fixed_lessons').upsert(
    { center, weekday, teacher_id: teacherId, time, child_id: c.childId ?? null, name: c.name?.trim() ?? '', payment: c.payment?.trim() ?? '',
      oral: c.kind !== undefined ? c.kind === 'oral' : !!c.oral, ...(c.kind !== undefined ? { kind: c.kind } : {}) },
    { onConflict: 'center,teacher_id,weekday,time' },
  );
  if (error) throw error;
}

export async function deleteFixed(weekday: number, teacherId: string, time: string, center: Center = 'eunpyeong'): Promise<void> {
  const { error } = await supabase.from('fixed_lessons').delete().match({ center, weekday, teacher_id: teacherId, time });
  if (error) throw error;
}

// ── 구글 캘린더 ─────────────────────────────────────────────────────

export type TimetableSync =
  | { action: 'full' }
  | { action: 'fixed'; teacherId: string; weekday: number; time: string; center?: Center; start?: string }
  | { action: 'fixedFrom'; from: string; teacherId: string; weekday: number; time: string; center?: Center; input: CellInput | null }
  | { action: 'cell'; day: string; teacherId: string; time: string; side: 'fixed' | 'open'; center?: Center };

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

// ── 결제 체크 (수업이 끝나면 관리자가 어떤 결제로 했는지) ────────────────

export type PayMethod = 'voucher' | 'gusen' | 'kkumideun' | 'woojin' | 'subsidy' | 'prepaid' | 'card' | 'cash' | 'other';
export const PAY_METHODS: { key: PayMethod; label: string; short: string }[] = [
  { key: 'voucher', label: '바우처', short: 'b' },
  { key: 'gusen', label: '굳센', short: 'e' },
  { key: 'kkumideun', label: '꿈이든', short: 'c' },
  { key: 'woojin', label: '우진학교', short: '우' },
  { key: 'subsidy', label: '지원금', short: '지' },
  { key: 'prepaid', label: '선결제', short: '선' },
  { key: 'card', label: '신용카드', short: '카' },
  { key: 'cash', label: '현금', short: '현' },
];

/** 결제 체크 하나 — 직접 적은 결제는 method = 'other' + note */
export interface PayEntry {
  method: PayMethod;
  note?: string;
  /** true = [결제 완료]로 확정, false = 고르기만 함([스케줄 변경 완료]로 저장) */
  confirmed?: boolean;
}

/** 그날 결제 체크 — "아이|시간" → 결제 */
export async function getDayPayments(day: string): Promise<Map<string, PayEntry>> {
  const { data, error } = await supabase.from('lesson_payments').select('*').eq('day', day);
  if (error) throw error;
  return new Map((data ?? []).map(r => [`${r.child_id}|${r.time}`, { method: r.method as PayMethod, note: (r.note as string | null) ?? undefined, confirmed: r.confirmed !== false }]));
}

/** 결제 체크 저장 / 지우기(entry = null) */
export async function setLessonPayment(childId: string, day: string, time: string, teacherId: string, center: Center, entry: PayEntry | null): Promise<void> {
  if (!entry) {
    const { error } = await supabase.from('lesson_payments').delete().match({ child_id: childId, day, time });
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from('lesson_payments').upsert(
    { child_id: childId, day, time, teacher_id: teacherId, center, method: entry.method, note: entry.note ?? null, confirmed: !!entry.confirmed },
    { onConflict: 'child_id,day,time' },
  );
  if (error) throw error;
}

export interface PayCount { voucher: number; gusen: number; kkumideun: number; woojin: number; subsidy: number; prepaid: number }

/** 아이마다 사용 횟수(확정된 결제만) — 바우처·굳센·꿈이든은 이번 달, 선결제는 지금까지 */
export async function getPaymentCounts(monthStart: string, monthEnd: string): Promise<Map<string, PayCount>> {
  const [month, prepaid] = await Promise.all([
    supabase.from('lesson_payments').select('child_id, method').eq('confirmed', true).gte('day', monthStart).lte('day', monthEnd).in('method', ['voucher', 'gusen', 'kkumideun', 'woojin', 'subsidy']),
    supabase.from('lesson_payments').select('child_id').eq('confirmed', true).eq('method', 'prepaid'),
  ]);
  if (month.error) throw month.error;
  if (prepaid.error) throw prepaid.error;
  const m = new Map<string, PayCount>();
  const get = (id: string) => { const c = m.get(id) ?? { voucher: 0, gusen: 0, kkumideun: 0, woojin: 0, subsidy: 0, prepaid: 0 }; m.set(id, c); return c; };
  for (const r of month.data ?? []) get(r.child_id)[r.method as 'voucher' | 'gusen' | 'kkumideun' | 'woojin' | 'subsidy']++;
  for (const r of prepaid.data ?? []) get(r.child_id).prepaid++;
  return m;
}

// ── 센터별 출근 요일 · 날짜별 선생님 추가 ─────────────────────────────

/** 이 선생님이 그 요일에 그 센터에서 일하는지 (출근 요일이 따로 없으면 그 센터 모든 요일) */
export function worksAt(t: { centers: string[]; workDays?: Record<string, number[]> }, center: Center, weekday: number): boolean {
  if (!t.centers.includes(center)) return false;
  const days = t.workDays?.[center];
  return !days || days.includes(weekday);
}

/** 그날 그 센터에 더한(added)·뺀(removed) 선생님 id 들 */
export async function getDayAssigns(day: string, center: Center): Promise<{ added: string[]; removed: string[] }> {
  const { data, error } = await supabase.from('teacher_day_assign').select('*').eq('day', day).eq('center', center);
  if (error) throw error;
  const rows = data ?? [];
  return {
    added: rows.filter(r => !r.off).map(r => r.teacher_id as string),
    removed: rows.filter(r => r.off).map(r => r.teacher_id as string),
  };
}

/** 그날만 선생님 더하기('add') · 빼기('off') · 원래대로(null) */
export async function setDayAssign(day: string, teacherId: string, center: Center, state: 'add' | 'off' | null): Promise<void> {
  const q = supabase.from('teacher_day_assign');
  const { error } = state
    ? await q.upsert({ day, teacher_id: teacherId, center, off: state === 'off' }, { onConflict: 'day,teacher_id,center' })
    : await q.delete().match({ day, teacher_id: teacherId, center });
  if (error) throw error;
}

/** 시간표(테스트) — 이 아이의 결제 기록·그날 칸·이번 달 사용 횟수를 모두 지운다. 지운 칸을 돌려준다(캘린더 맞추기용) */
export async function clearChildTestData(childId: string): Promise<{ day: string; teacher_id: string; time: string; side: 'fixed' | 'open'; center: Center }[]> {
  const { data: cells, error: e0 } = await supabase.from('board_cells').select('day, teacher_id, time, side, center').eq('child_id', childId);
  if (e0) throw e0;
  const [a, b, c] = await Promise.all([
    supabase.from('lesson_payments').delete().eq('child_id', childId),
    supabase.from('board_cells').delete().eq('child_id', childId),
    supabase.from('child_month_usage').delete().eq('child_id', childId),
  ]);
  for (const r of [a, b]) if (r.error) throw r.error;
  void c;   // 표가 없어도(SQL 전) 괜찮다
  return (cells ?? []) as { day: string; teacher_id: string; time: string; side: 'fixed' | 'open'; center: Center }[];
}

// ── 결제내역(월별) ──────────────────────────────────────────────────

export interface MonthUse { voucher: number; gusen: number; kkumideun: number; woojin: number; subsidy: number; prepaid: number }

/** 그 달 아이마다 결제별 사용 횟수(확정된 것) — 선결제는 결제 완료 + 선결제 카드의 직접 차감 */
export async function getMonthUses(month: string): Promise<Map<string, MonthUse>> {
  const [y, m] = month.split('-').map(Number);
  const start = `${month}-01`;
  const end = `${y}-${String(m).padStart(2, '0')}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
  const [lp, pc] = await Promise.all([
    supabase.from('lesson_payments').select('child_id, method').eq('confirmed', true).gte('day', start).lte('day', end),
    supabase.from('prepaid_charges').select('*').gte('day', start).lte('day', end).lt('count', 0),
  ]);
  if (lp.error) throw lp.error;
  const map = new Map<string, MonthUse>();
  const get = (id: string) => { const c = map.get(id) ?? { voucher: 0, gusen: 0, kkumideun: 0, woojin: 0, subsidy: 0, prepaid: 0 }; map.set(id, c); return c; };
  for (const r of lp.data ?? []) if (r.method in get(r.child_id)) (get(r.child_id) as unknown as Record<string, number>)[r.method]++;
  for (const r of pc.data ?? []) if (!r.adjust) get(r.child_id as string).prepaid += -(r.count as number);
  return map;
}

/** 그 달 메모 — 아이 id → 메모 */
export async function getMonthNotes(month: string): Promise<Map<string, string>> {
  const { data, error } = await supabase.from('child_month_notes').select('child_id, memo').eq('month', `${month}-01`);
  if (error) throw error;
  return new Map((data ?? []).map(r => [r.child_id as string, (r.memo as string) ?? '']));
}

export async function setMonthNote(childId: string, month: string, memo: string): Promise<void> {
  const q = supabase.from('child_month_notes');
  const { error } = memo.trim()
    ? await q.upsert({ child_id: childId, month: `${month}-01`, memo: memo.trim(), updated_at: new Date().toISOString() }, { onConflict: 'child_id,month' })
    : await q.delete().match({ child_id: childId, month: `${month}-01` });
  if (error) throw error;
}

/** 수업 현황 — 그 달 결제 기록 전부(선생님·결제방식·확정 여부·센터) */
export async function getMonthLessonPayments(month: string): Promise<{ teacher_id: string | null; method: PayMethod; confirmed: boolean; center: string }[]> {
  const [y, m] = month.split('-').map(Number);
  const end = `${y}-${String(m).padStart(2, '0')}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
  const { data, error } = await supabase.from('lesson_payments').select('teacher_id, method, confirmed, center').gte('day', `${month}-01`).lte('day', end);
  if (error) throw error;
  return (data ?? []).map(r => ({ teacher_id: r.teacher_id as string | null, method: r.method as PayMethod, confirmed: r.confirmed !== false, center: (r.center as string) ?? 'eunpyeong' }));
}
