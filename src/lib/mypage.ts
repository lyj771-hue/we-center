import { supabase } from './supabaseClient';

// 마이페이지(보호자) — DB 함수 my_child / my_lessons (supabase/mypage.sql) 로 내 아이 것만 읽는다.

export interface MyChild {
  memberCode?: string;
  childName?: string;
  childNumber?: number;
  payment: string;
  oral: boolean;
  supports: { voucher: boolean; gusen: boolean; kkumideun: boolean; woojin: boolean; subsidy: boolean };
  /** 아이 명단에서 체크한 쓰는 결제 */
  uses: { voucher: boolean; gusen: boolean; jangmatchum: boolean; kkumideun: boolean; woojin: boolean; subsidy: boolean; prepaid: boolean };
}

export interface MyLesson {
  day: string;
  time: string;
  teacher: string;
  teacherId: string;
  side: 'fixed' | 'open';
  source: 'fixed' | 'override' | 'booking';
  status: 'child' | 'undecided' | 'off' | 'none' | 'cancelled' | 'cancel_requested';
  name?: string;
  payment: string;
  oral: boolean;
  absent: boolean;
  moved: boolean;
  note?: string;
  /** 지점 — 'eunpyeong'(수색) / 'uijeongbu'(의정부) */
  center: BranchKey;
}

export async function getMyChild(center?: BranchKey): Promise<MyChild | null> {
  const { data, error } = await supabase.rpc('my_child', center ? { p_center: center } : {});
  if (error) throw error;
  const r = (data ?? [])[0];
  if (!r) return null;
  return {
    memberCode: r.member_code ?? undefined,
    childName: r.child_name ?? undefined,
    childNumber: r.child_number ?? undefined,
    payment: r.payment ?? '',
    oral: !!r.oral,
    supports: { voucher: !!r.voucher, gusen: !!r.gusen, kkumideun: !!r.kkumideun, woojin: !!r.woojin, subsidy: !!r.subsidy },
    uses: { voucher: !!r.uses_voucher, gusen: !!r.uses_gusen, jangmatchum: !!r.uses_jangmatchum, kkumideun: !!r.uses_kkumideun, woojin: !!r.uses_woojin, subsidy: !!r.uses_subsidy, prepaid: !!r.uses_prepaid },
  };
}

export async function getMyLessons(from: string, to: string): Promise<MyLesson[]> {
  const { data, error } = await supabase.rpc('my_lessons', { p_from: from, p_to: to });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    day: r.day as string,
    time: r.lesson_time as string,
    teacher: r.teacher_name as string,
    teacherId: r.teacher_id as string,
    side: r.side as MyLesson['side'],
    source: r.source as MyLesson['source'],
    status: r.status as MyLesson['status'],
    name: (r.name as string) ?? undefined,
    payment: (r.payment as string) ?? '',
    oral: !!r.oral,
    absent: !!r.absent,
    moved: !!r.moved,
    note: (r.note as string) ?? undefined,
    center: r.center === 'uijeongbu' ? 'uijeongbu' : 'eunpyeong',
  }));
}

/** 보호자 수업 취소 — 수업 시작 전이면 바로 취소 (supabase/lesson-cancel.sql). ok / ok_late(2시간 안 남음) / not_found / too_late / no_login */
export async function cancelMyLesson(l: MyLesson): Promise<string> {
  const { data, error } = await supabase.rpc('cancel_my_lesson', { p_day: l.day, p_time: l.time, p_teacher: l.teacherId, p_side: l.side });
  if (error) throw error;
  return data as string;
}

/** 마이페이지에서 취소할 수 있는 수업 — 진행할 수업이고 아직 시작 전 */
export const canCancel = (l: MyLesson, now = new Date()) =>
  (l.status === 'child' || l.status === 'cancel_requested') && !l.moved && !l.absent
  && new Date(`${l.day}T${l.time.length === 4 ? `0${l.time}` : l.time}:00`) > now;

/** 실제로 하는 수업인지 — 비움·미정·안 함·옮김·취소 승인은 뺀다 */
export const isRealLesson = (l: MyLesson) => (l.status === 'child' || l.status === 'cancel_requested') && !l.moved;

/** 결제 현황 — 바우처·굳센·장맞춤·꿈이든은 이번 달 사용/제공(매월 1일 새로), 선결제는 지금까지 사용/충전(남은 = 충전 − 사용). 확정된 결제만 */
export interface MyPayment { method: 'voucher' | 'gusen' | 'jangmatchum' | 'kkumideun' | 'woojin' | 'subsidy' | 'prepaid'; used: number; total: number }

export async function getMyPayments(center?: BranchKey): Promise<MyPayment[]> {
  const { data, error } = await supabase.rpc('my_payments', center ? { p_center: center } : {});
  if (error) throw error;
  return (data ?? []) as MyPayment[];
}

/** 결제별 사용 기록 전부 (바우처·굳센·꿈이든·지원금·우진학교) — [결제 완료]로 확정된 수업. 지난 달도 쌓인다 */
export interface MyPaymentUse { day: string; method: MyPayment['method']; time: string; teacher: string; note?: string; center: BranchKey }

export async function getMyPaymentHistory(): Promise<MyPaymentUse[]> {
  const { data, error } = await supabase.rpc('my_payment_history');
  if (error) throw error;
  return (data ?? []).map((r: { day: string; method: MyPayment['method']; lesson_time: string; teacher_name: string | null; note: string | null; center?: string | null }) => ({
    day: r.day, method: r.method, time: r.lesson_time, teacher: r.teacher_name ?? '', note: r.note ?? undefined,
    center: r.center === 'uijeongbu' ? 'uijeongbu' as const : 'eunpyeong' as const,
  }));
}

/** 계정에 이어진 아이들이 다니는 지점 — 두 지점 아이가 이어져 있으면 마이페이지에서 둘 다 본다 */
export async function getMyChildCenters(): Promise<BranchKey[]> {
  const { data, error } = await supabase.rpc('my_child_centers');
  if (error) throw error;
  return ((data ?? []) as string[]).map(c => (c === 'uijeongbu' ? 'uijeongbu' : 'eunpyeong'));
}

// ── 지점(수색/의정부) 가입 ─────────────────────────────────────────────

export type BranchKey = 'eunpyeong' | 'uijeongbu';
export const BRANCHES: { key: BranchKey; label: string }[] = [{ key: 'eunpyeong', label: '수색점' }, { key: 'uijeongbu', label: '의정부점' }];

/** 내 지점 가입 상태 — 처음 가입한 지점은 프로필(승인일), 다른 지점은 member_centers(신청·승인) */
export type BranchStatus = 'primary' | 'approved' | 'pending' | 'none';
export interface MyBranch { key: BranchKey; label: string; status: BranchStatus }

export async function getMyBranches(userId: string, primary: BranchKey | 'none'): Promise<MyBranch[]> {
  const { data } = await supabase.from('member_centers').select('center, approved_at').eq('user_id', userId);
  const rows = new Map((data ?? []).map(r => [r.center as string, r.approved_at as string | null]));
  return BRANCHES.map(b => ({
    ...b,
    status: b.key === primary ? 'primary' : !rows.has(b.key) ? 'none' : rows.get(b.key) ? 'approved' : 'pending',
  }));
}

/** 지점 가입 신청 (관리자가 그 지점 회원관리에서 승인) — 가입한 지점이 없으면 그 지점이 기본 지점 */
export async function requestBranch(_userId: string, center: BranchKey): Promise<void> {
  const { data, error } = await supabase.rpc('join_center', { p_center: center });
  if (error) throw error;
  if (data !== 'ok' && data !== 'already') throw new Error(data as string);
}

/** 지점 가입 취소 — 그 지점 아이 연결을 끊고 빠진다. 마지막 지점이면 'last'(계정은 남고 미승인으로) */
export async function leaveBranch(center: BranchKey): Promise<'ok' | 'last' | string> {
  const { data, error } = await supabase.rpc('leave_center', { p_center: center });
  if (error) throw error;
  return data as string;
}

/** 회원 탈퇴 — 아이 연결·지점 가입·프로필·로그인 계정을 지운다(수업·결제 기록은 센터 아이 명단에 남는다) */
export async function withdrawMember(): Promise<void> {
  const { data, error } = await supabase.rpc('withdraw_member');
  if (error) throw error;
  if (data !== 'ok') throw new Error(data as string);
}
