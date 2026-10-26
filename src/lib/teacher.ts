import { supabase } from './supabaseClient';
import { notifyScheduleChanged } from './sync';

// 선생님 카카오 로그인 · 시간표 보기 (supabase/teacher-login.sql)

export interface MyTeacher { teacherId: string; name: string; memberCode?: string; centers: string[] }

/** 이 카카오 계정과 이어진 선생님 — 없으면 null. 확인 자체가 실패하면(세션이 막 붙는 중 등) 던진다 — 선생님 아님으로 착각하지 않게 */
export async function getMyTeacher(): Promise<MyTeacher | null> {
  const { data, error } = await supabase.rpc('my_teacher');
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') return null;   // SQL 전(함수 없음)이면 선생님 없음으로
    throw error;
  }
  const r = (data ?? [])[0];
  return r ? { teacherId: r.teacher_id, name: r.name, memberCode: r.member_code ?? undefined, centers: (r.centers as string[] | null) ?? ['eunpyeong'] } : null;
}

/** 선생님 인증 — ok / bad_phone / no_match / taken */
export async function claimTeacher(name: string, phone: string): Promise<string> {
  const { data, error } = await supabase.rpc('claim_teacher', { p_name: name.trim(), p_phone: phone });
  if (error) throw error;
  return data as string;
}

export interface TeacherLesson {
  day: string; time: string; teacherId: string; side: 'fixed' | 'open'; source: 'fixed' | 'override' | 'booking';
  status: string; name?: string; number?: number; absent: boolean; moved: boolean; note?: string; center: string;
  /** 결제 — payment = 칸의 결제 글자(기본), payMethod·payNote = 고른/확정한 결제 (teacher-lessons-payment.sql 전엔 없음) */
  payment?: string; payMethod?: string; payNote?: string; payConfirmed?: boolean;
}

/** 시간표 보기 — 그 기간 두 센터 수업 (선생님·관리자만) */
export async function getTeacherLessons(from: string, to: string): Promise<TeacherLesson[]> {
  const { data, error } = await supabase.rpc('teacher_lessons', { p_from: from, p_to: to });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    day: r.day as string, time: r.lesson_time as string, teacherId: r.teacher_id as string,
    side: r.side as TeacherLesson['side'], source: r.source as TeacherLesson['source'], status: r.status as string,
    name: (r.name as string | null) ?? undefined, number: (r.child_number as number | null) ?? undefined,
    absent: !!r.absent, moved: !!r.moved, note: (r.note as string | null) ?? undefined,
    center: r.center === 'uijeongbu' ? 'uijeongbu' : 'eunpyeong',
    payment: (r.payment as string | null) ?? undefined, payMethod: (r.pay_method as string | null) ?? undefined,
    payNote: (r.pay_note as string | null) ?? undefined, payConfirmed: r.pay_confirmed === true,
  }));
}

// ── 관리자: 회원관리 "선생님" 탭 ─────────────────────────────

export interface TeacherLogin { teacherId: string; name: string; centers: string[]; phone?: string; kakaoPhone?: string; memberCode?: string; userId?: string; linkedAt?: string }

export async function getTeacherLogins(): Promise<TeacherLogin[]> {
  await supabase.rpc('ensure_teacher_logins');
  const [t, l] = await Promise.all([
    supabase.from('teachers').select('id, name, centers, sort_order').order('sort_order'),
    supabase.from('teacher_logins').select('*'),
  ]);
  if (t.error) throw t.error;
  if (l.error) throw l.error;
  const byId = new Map((l.data ?? []).map(r => [r.teacher_id as string, r]));
  // 회원 코드 순 (코드가 없으면 뒤로)
  return (t.data ?? []).map(r => {
    const x = byId.get(r.id as string);
    return {
      teacherId: r.id as string, name: r.name as string, centers: (r.centers as string[] | null) ?? ['eunpyeong'],
      phone: (x?.phone as string | null) ?? undefined, kakaoPhone: (x?.kakao_phone as string | null) ?? undefined, memberCode: (x?.member_code as string | null) ?? undefined,
      userId: (x?.user_id as string | null) ?? undefined, linkedAt: (x?.linked_at as string | null) ?? undefined,
    };
  }).sort((a, b) => (a.memberCode ?? '~').localeCompare(b.memberCode ?? '~'));
}

export async function saveTeacherPhone(teacherId: string, phone: string): Promise<void> {
  const { error } = await supabase.from('teacher_logins').update({ phone: phone.trim() || null }).eq('teacher_id', teacherId);
  if (error) throw error;
}

/** 카카오 연결 끊기 — 다음에 로그인하면 다시 인증한다 */
export async function unlinkTeacher(teacherId: string): Promise<void> {
  const { error } = await supabase.from('teacher_logins').update({ user_id: null, linked_at: null }).eq('teacher_id', teacherId);
  if (error) throw error;
}

// ── 선생님: 수업스케쥴 게시글에서 내 시간 내리기 · 더하기 (supabase/teacher-schedule-post.sql) ─────────────

/** 칸마다 신청한 사람(아이 이름) — 관리자·선생님. 칸 id → 이름 */
export async function getSlotOwners(scheduleId: string): Promise<Map<string, string>> {
  const { data, error } = await supabase.rpc('schedule_slot_owners', { p_schedule: scheduleId });
  if (error) return new Map();
  return new Map((data ?? []).map((r: Record<string, string>) => [r.slot_id, r.name]));
}

/** 선생님이 만든 보낼 알림 보내기 */
async function sendTeacherOutbox(ids: string[]): Promise<{ sent: number; failed: number; skipped: number; waiting: number }> {
  if (!ids.length) return { sent: 0, failed: 0, skipped: 0, waiting: 0 };
  const { data: s } = await supabase.auth.getSession();
  const res = await fetch('/api/alimtalk/teacher-send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(s.session ? { Authorization: `Bearer ${s.session.access_token}` } : {}) },
    body: JSON.stringify({ ids }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? `오류 ${res.status}`);
  return j;
}

/** 내 시간 내리기 — 그 사이 신청된 게 있으면 하나도 안 내리고 result 'booked' + booked(칸 id·이름). 관리자 알림톡(내렸어요), 보호자 없음 */
export async function teacherRemoveSlots(scheduleId: string, slotIds: string[]) {
  const { data, error } = await supabase.rpc('teacher_remove_slots', { p_schedule: scheduleId, p_slots: slotIds });
  if (error) throw error;
  const r = data as { result: string; count?: number; ids?: string[]; booked?: { slot_id: string; name: string }[] };
  if (r.result === 'ok') { notifyScheduleChanged(); await sendTeacherOutbox(r.ids ?? []).catch(() => {}); }
  return r;
}

/** 내 시간 더하기 — 보호자(스케줄 수정 알림)·관리자(추가했어요) 알림톡 */
export async function teacherAddSlots(scheduleId: string, times: { day: string; time: string }[]) {
  const { data, error } = await supabase.rpc('teacher_add_slots', { p_schedule: scheduleId, p_times: times });
  if (error) throw error;
  const r = data as { result: string; count?: number; ids?: string[] };
  let sent: Awaited<ReturnType<typeof sendTeacherOutbox>> | null = null;
  if (r.result === 'ok') { notifyScheduleChanged(); sent = await sendTeacherOutbox(r.ids ?? []).catch(() => null); }
  return { ...r, sent };
}
