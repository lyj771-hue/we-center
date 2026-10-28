import { supabase } from './supabaseClient';

// 대시보드 · 스케줄 잡기 (관리자) — 수업스케쥴 게시글마다 보호자들이 얼마나 빨리, 몇 개를 잡았고, 몇 번 한발 늦었는지.
// 잡은 것 = bookings(kind = book), 한발 늦음 = booking_misses(supabase/booking-misses.sql),
// 10분 안 취소 = bookings(kind = cancel_free), 관리자 취소 = book 기록에 cancelled_at 이 있고 cancel_free 가 없는 것.

export type RaceRow = { scheduleId: string; slotId?: string; userId: string; at: string };

export interface RaceData {
  books: (RaceRow & { cancelledAt?: string })[];
  freeCancels: RaceRow[];
  misses: (RaceRow & { winnerId?: string })[];
  /** 게시글별 시간 수 */
  slotCount: Map<string, number>;
}

/** 게시글들의 신청·취소·한발 늦음 기록 */
export async function getRaceData(scheduleIds: string[]): Promise<RaceData> {
  const empty: RaceData = { books: [], freeCancels: [], misses: [], slotCount: new Map() };
  if (!scheduleIds.length) return empty;
  const [b, m, s] = await Promise.all([
    supabase.from('bookings').select('schedule_id, slot_id, user_id, kind, created_at, cancelled_at').in('schedule_id', scheduleIds).in('kind', ['book', 'cancel_free']),
    supabase.from('booking_misses').select('schedule_id, slot_id, user_id, winner_id, created_at').in('schedule_id', scheduleIds),
    supabase.from('slots').select('schedule_id').in('schedule_id', scheduleIds),
  ]);
  if (b.error) throw b.error;
  const row = (r: Record<string, string | null>): RaceRow => ({ scheduleId: r.schedule_id!, slotId: r.slot_id ?? undefined, userId: r.user_id!, at: r.created_at! });
  const slotCount = new Map<string, number>();
  for (const r of s.data ?? []) slotCount.set(r.schedule_id, (slotCount.get(r.schedule_id) ?? 0) + 1);
  return {
    books: (b.data ?? []).filter(r => r.kind === 'book' && r.user_id).map(r => ({ ...row(r), cancelledAt: r.cancelled_at ?? undefined })),
    freeCancels: (b.data ?? []).filter(r => r.kind === 'cancel_free' && r.user_id).map(row),
    // 표가 아직 없으면(SQL 전) 한발 늦음은 0
    misses: m.error ? [] : (m.data ?? []).map(r => ({ ...row(r), winnerId: r.winner_id ?? undefined })),
    slotCount,
  };
}

export interface GuardianRace {
  userId: string;
  /** 지금 잡고 있는 수 */
  got: number;
  /** 한발 늦음 */
  missed: number;
  /** 게시 후 10분 안에 스스로 취소 */
  freeCancelled: number;
  /** 관리자가 취소 */
  adminCancelled: number;
  /** 처음 누른 시각 (잡았거나 늦었거나) */
  firstAt: string;
}

/** 게시글 하나 — 보호자별로 모아 처음 누른 순서대로 */
export function raceByGuardian(data: RaceData, scheduleId: string): GuardianRace[] {
  const map = new Map<string, GuardianRace>();
  const of = (userId: string, at: string) => {
    let g = map.get(userId);
    if (!g) { g = { userId, got: 0, missed: 0, freeCancelled: 0, adminCancelled: 0, firstAt: at }; map.set(userId, g); }
    if (at < g.firstAt) g.firstAt = at;
    return g;
  };
  const freeSlots = new Set(data.freeCancels.filter(r => r.scheduleId === scheduleId).map(r => `${r.userId}|${r.slotId}`));
  for (const r of data.books.filter(x => x.scheduleId === scheduleId)) {
    const g = of(r.userId, r.at);
    if (!r.cancelledAt) g.got++;
    else if (freeSlots.has(`${r.userId}|${r.slotId}`)) g.freeCancelled++;
    else g.adminCancelled++;
  }
  for (const r of data.misses.filter(x => x.scheduleId === scheduleId)) of(r.userId, r.at).missed++;
  return [...map.values()].sort((a, b) => a.firstAt.localeCompare(b.firstAt));
}
