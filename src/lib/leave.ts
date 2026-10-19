import { supabase } from './supabaseClient';
import type { Center } from './timetable';

// 선생님 휴무 · 보낼 알림 (supabase/teacher-leave.sql) — 관리자만

export interface TeacherLeave { id: string; day: string; teacherId: string; center: Center; times: string[] | null; reason: string }

/** 그날 이 센터 휴무 기록 */
export async function getDayLeaves(day: string, center: Center): Promise<TeacherLeave[]> {
  const { data, error } = await supabase.from('teacher_leaves').select('*').eq('day', day).eq('center', center).order('created_at');
  if (error) throw error;
  return (data ?? []).map(r => ({
    id: r.id as string, day: r.day as string, teacherId: r.teacher_id as string, center: r.center === 'uijeongbu' ? 'uijeongbu' : 'eunpyeong',
    times: (r.times as string[] | null) ?? null, reason: (r.reason as string | null) ?? '',
  }));
}

export async function addLeave(l: Omit<TeacherLeave, 'id'>): Promise<string> {
  const { data, error } = await supabase.from('teacher_leaves')
    .insert({ day: l.day, teacher_id: l.teacherId, center: l.center, times: l.times, reason: l.reason.trim() || null })
    .select('id').single();
  if (error) throw error;
  return data.id as string;
}

// ── 보낼 알림 ─────────────────────────────────────────────────────

export type OutboxStatus = 'pending' | 'sent' | 'failed' | 'skipped';
export interface OutboxMessage {
  id: string; templateId: string; refId?: string; childId?: string; userId?: string; childName: string; phone?: string;
  vars: Record<string, string>; status: OutboxStatus; error?: string; createdAt: string; sentAt?: string;
}

export async function addOutbox(list: Omit<OutboxMessage, 'id' | 'status' | 'createdAt'>[]): Promise<void> {
  if (!list.length) return;
  const { error } = await supabase.from('outbox_messages').insert(list.map(m => ({
    template_id: m.templateId, ref_id: m.refId ?? null, child_id: m.childId ?? null, user_id: m.userId ?? null,
    child_name: m.childName, phone: m.phone ?? null, vars: m.vars,
  })));
  if (error) throw error;
}

export async function getOutbox(limit = 200): Promise<OutboxMessage[]> {
  const { data, error } = await supabase.from('outbox_messages').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []).map(r => ({
    id: r.id as string, templateId: r.template_id as string, refId: (r.ref_id as string | null) ?? undefined,
    childId: (r.child_id as string | null) ?? undefined, userId: (r.user_id as string | null) ?? undefined,
    childName: (r.child_name as string | null) ?? '', phone: (r.phone as string | null) ?? undefined,
    vars: (r.vars as Record<string, string>) ?? {}, status: r.status as OutboxStatus, error: (r.error as string | null) ?? undefined,
    createdAt: r.created_at as string, sentAt: (r.sent_at as string | null) ?? undefined,
  }));
}

export async function deleteOutbox(id: string): Promise<void> {
  const { error } = await supabase.from('outbox_messages').delete().eq('id', id);
  if (error) throw error;
}

