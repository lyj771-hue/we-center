import { supabase } from './supabaseClient';

// 선생님 카카오 로그인 · 시간표 보기 (supabase/teacher-login.sql)

export interface MyTeacher { teacherId: string; name: string; memberCode?: string; centers: string[] }

/** 이 카카오 계정과 이어진 선생님 — 없으면 null */
export async function getMyTeacher(): Promise<MyTeacher | null> {
  const { data, error } = await supabase.rpc('my_teacher');
  if (error) return null;   // SQL 전이면 선생님 없음으로
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
  }));
}

// ── 관리자: 회원관리 "선생님" 탭 ─────────────────────────────

export interface TeacherLogin { teacherId: string; name: string; centers: string[]; phone?: string; memberCode?: string; userId?: string; linkedAt?: string }

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
      phone: (x?.phone as string | null) ?? undefined, memberCode: (x?.member_code as string | null) ?? undefined,
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
