import { supabase } from './supabaseClient';

// 마이페이지(보호자) — DB 함수 my_child / my_lessons (supabase/mypage.sql) 로 내 아이 것만 읽는다.

export interface MyChild {
  memberCode?: string;
  childName?: string;
  childNumber?: number;
  payment: string;
  oral: boolean;
  supports: { voucher: boolean; gusen: boolean; kkumideun: boolean; woojin: boolean; subsidy: boolean };
}

export interface MyLesson {
  day: string;
  time: string;
  teacher: string;
  side: 'fixed' | 'open';
  source: 'fixed' | 'override' | 'booking';
  status: 'child' | 'undecided' | 'off' | 'none' | 'cancelled' | 'cancel_requested';
  name?: string;
  payment: string;
  oral: boolean;
  absent: boolean;
  moved: boolean;
  note?: string;
}

export async function getMyChild(): Promise<MyChild | null> {
  const { data, error } = await supabase.rpc('my_child');
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
  };
}

export async function getMyLessons(from: string, to: string): Promise<MyLesson[]> {
  const { data, error } = await supabase.rpc('my_lessons', { p_from: from, p_to: to });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    day: r.day as string,
    time: r.lesson_time as string,
    teacher: r.teacher_name as string,
    side: r.side as MyLesson['side'],
    source: r.source as MyLesson['source'],
    status: r.status as MyLesson['status'],
    name: (r.name as string) ?? undefined,
    payment: (r.payment as string) ?? '',
    oral: !!r.oral,
    absent: !!r.absent,
    moved: !!r.moved,
    note: (r.note as string) ?? undefined,
  }));
}

/** 실제로 하는 수업인지 — 비움·미정·안 함·옮김·취소 승인은 뺀다 */
export const isRealLesson = (l: MyLesson) => (l.status === 'child' || l.status === 'cancel_requested') && !l.moved;

/** 결제 현황 — 바우처·굳센·꿈이든은 이번 달 사용/제공, 선결제는 지금까지 사용/충전 */
export interface MyPayment { method: 'voucher' | 'gusen' | 'kkumideun' | 'prepaid'; used: number; total: number }

export async function getMyPayments(): Promise<MyPayment[]> {
  const { data, error } = await supabase.rpc('my_payments');
  if (error) throw error;
  return (data ?? []) as MyPayment[];
}
