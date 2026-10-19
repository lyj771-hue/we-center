import { supabase } from './supabaseClient';

// 관리자 알림 (supabase/admin-alerts.sql) — 보호자가 가입·수업 신청 등을 하면 DB 트리거가 쌓는다. 관리자만

/** 알림을 확인하면 이 이벤트 → 관리자 띠의 빨간 숫자도 새로 */
export const ALERTS_CHANGED = 'admin-alerts-changed';

export type AlertKind = 'signup' | 'branch' | 'book' | 'cancel_request' | 'cancel_withdraw' | 'lesson_cancel';
export const ALERT_KINDS: { key: AlertKind; label: string }[] = [
  { key: 'signup', label: '가입 신청' },
  { key: 'branch', label: '다른 지점 가입' },
  { key: 'book', label: '수업 신청' },
  { key: 'cancel_request', label: '취소 신청' },
  { key: 'cancel_withdraw', label: '취소 철회' },
  { key: 'lesson_cancel', label: '수업 취소' },   // 보호자가 마이페이지에서 바로 취소 (lesson-cancel.sql)
];

export interface AdminAlert { id: string; kind: AlertKind; center: 'eunpyeong' | 'uijeongbu'; title: string; detail?: string; createdAt: string; readAt?: string }

export async function getAdminAlerts(limit = 300): Promise<AdminAlert[]> {
  const { data, error } = await supabase.from('admin_alerts').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []).map(r => ({
    id: r.id as string, kind: r.kind as AlertKind, center: r.center === 'uijeongbu' ? 'uijeongbu' : 'eunpyeong',
    title: r.title as string, detail: (r.detail as string | null) ?? undefined, createdAt: r.created_at as string, readAt: (r.read_at as string | null) ?? undefined,
  }));
}

/** 아직 안 본 알림 수 — 표가 없으면(SQL 전) 0 */
export async function getUnreadAlertCount(): Promise<number> {
  const { count, error } = await supabase.from('admin_alerts').select('id', { count: 'exact', head: true }).is('read_at', null);
  if (error) return 0;
  return count ?? 0;
}

/** 확인함 표시 (ids 가 없으면 전부) */
export async function markAlertsRead(ids?: string[]): Promise<void> {
  let q = supabase.from('admin_alerts').update({ read_at: new Date().toISOString() }).is('read_at', null);
  if (ids) q = q.in('id', ids);
  const { error } = await q;
  if (error) throw error;
}

/** 알림을 누르면 갈 곳 */
export const alertLink = (a: AdminAlert) => {
  const uj = a.center === 'uijeongbu';
  if (a.kind === 'signup' || a.kind === 'branch') return uj ? '/members/uijeongbu' : '/members';
  return uj ? '/admin/timetable/uijeongbu' : '/admin/timetable';
};
