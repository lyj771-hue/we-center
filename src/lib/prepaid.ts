import { supabase } from './supabaseClient';

// 선결제 카드 — 충전(prepaid_charges)과 [결제 완료]로 확정된 선결제 사용(lesson_payments)을 날짜 순으로 늘어놓고 남은 횟수를 붙인다.
// 표 구조는 supabase/prepaid-charges.sql 참고.

export interface LedgerRow {
  day: string;
  kind: 'charge' | 'use' | 'adjust';
  /** 충전 = 충전한 횟수(+), 사용 = 그날 사용한 횟수, 수정 = 남은 횟수를 맞추느라 더하거나 뺀 횟수(±) */
  count: number;
  memo?: string;
  /** 충전 기록 id (관리자가 지울 때) */
  chargeId?: string;
  /** 넣은 시각 — 같은 날 여러 줄이면 이 순서로 */
  at?: string;
  /** 이 줄까지의 남은 횟수 */
  balance: number;
}

type Raw = Omit<LedgerRow, 'balance'>;

/** 날짜 순(같은 날은 넣은 시각 순)으로 정렬하고 남은 횟수를 붙인다 */
export function buildLedger(rows: Raw[]): LedgerRow[] {
  const sorted = [...rows].sort((a, b) => a.day.localeCompare(b.day) || (a.at && b.at ? a.at.localeCompare(b.at) : 0));
  let bal = 0;
  return sorted.map(r => {
    bal += r.kind === 'use' ? -r.count : r.count;
    return { ...r, balance: bal };
  });
}

/** 관리자: 아이 한 명의 카드 내역 */
export async function getChildLedger(childId: string): Promise<LedgerRow[]> {
  const [charges, uses] = await Promise.all([
    supabase.from('prepaid_charges').select('*').eq('child_id', childId),
    supabase.from('lesson_payments').select('day, created_at').eq('child_id', childId).eq('method', 'prepaid').eq('confirmed', true),
  ]);
  if (charges.error) throw charges.error;
  if (uses.error) throw uses.error;
  // 사용은 날짜마다 한 줄 — 시각은 그날 마지막 확정 시각
  const perDay = new Map<string, { count: number; at: string }>();
  for (const u of uses.data ?? []) {
    const p = perDay.get(u.day as string) ?? { count: 0, at: '' };
    perDay.set(u.day as string, { count: p.count + 1, at: (u.created_at as string) > p.at ? (u.created_at as string) : p.at });
  }
  return buildLedger([
    // 충전 기록: adjust = [수정](남은 횟수 맞춤, ±), − 횟수 = 관리자가 직접 넣은 차감(임시) — 사용 줄로
    ...(charges.data ?? []).map(c => {
      const n = c.count as number;
      const base = { day: c.day as string, memo: (c.memo as string | null) ?? undefined, chargeId: c.id as string, at: c.created_at as string };
      if (c.adjust) return { ...base, kind: 'adjust' as const, count: n };
      return { ...base, kind: n < 0 ? 'use' as const : 'charge' as const, count: Math.abs(n) };
    }),
    ...[...perDay].map(([day, v]) => ({ day, kind: 'use' as const, count: v.count, at: v.at })),
  ]);
}

/** 관리자: 충전 기록 넣기 / 지우기 (아이의 충전 총 횟수는 디비가 자동으로 맞춘다) */
export async function addCharge(childId: string, day: string, count: number, memo?: string, adjust = false): Promise<void> {
  const { error } = await supabase.from('prepaid_charges').insert({ child_id: childId, day, count, memo: memo?.trim() || null, ...(adjust ? { adjust: true } : {}) });
  if (error) throw error;
}
export async function deleteCharge(id: string): Promise<void> {
  const { error } = await supabase.from('prepaid_charges').delete().eq('id', id);
  if (error) throw error;
}

/** 보호자: 내 아이 카드 내역 */
export async function getMyLedger(): Promise<LedgerRow[]> {
  const { data, error } = await supabase.rpc('my_prepaid_ledger');
  if (error) throw error;
  return buildLedger((data ?? []).map((r: { day: string; kind: 'charge' | 'use' | 'adjust'; count: number; memo: string | null; at?: string | null }) =>
    r.kind === 'charge' && r.count < 0
      ? { day: r.day, kind: 'use' as const, count: -r.count, memo: r.memo ?? undefined, at: r.at ?? undefined }   // 관리자가 직접 넣은 차감
      : { day: r.day, kind: r.kind, count: r.count, memo: r.memo ?? undefined, at: r.at ?? undefined }));
}
