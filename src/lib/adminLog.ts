import { supabase } from './supabaseClient';

// 관리 내역 — 관리자가 한 일 (supabase/admin-logs.sql). 알림 → [관리 내역] 탭

export interface AdminLog { id: string; center: string; kind: string; title: string; detail?: string; actor?: string; refId?: string; createdAt: string }

/** 한 줄 남기기 — 실패해도 하던 일은 막지 않는다(SQL 전 등) */
export async function addAdminLog(log: { center: string; kind: string; title: string; detail?: string; refId?: string }): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const email = data.session?.user.email ?? '';
    const actor = email.startsWith('staff@') ? '직원' : email.startsWith('admin@') ? '관리자' : email;
    await supabase.from('admin_logs').insert({ center: log.center, kind: log.kind, title: log.title, detail: log.detail || null, actor, ref_id: log.refId ?? null });
  } catch { /* 남기지 못해도 괜찮다 */ }
}

export async function getAdminLogs(limit = 300): Promise<AdminLog[]> {
  const { data, error } = await supabase.from('admin_logs').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []).map(r => ({
    id: r.id, center: r.center, kind: r.kind, title: r.title, detail: r.detail ?? undefined, actor: r.actor ?? undefined,
    refId: r.ref_id ?? undefined, createdAt: r.created_at,
  }));
}
