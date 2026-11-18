import { supabase } from './supabaseClient';
import type { MessageTemplate } from './messages';
import { renderNotification, specRows, type Rendered } from './notifyRender';

// 앱 🔔 알림 내역 (supabase/push-first.sql) — 나에게 온 알림(앱 푸시·알림톡 모두) + 관리자가 직접 보낸 앱 푸시

export interface AppNotification extends Rendered { id: string; at: string; manual: boolean }

export async function getMyNotifications(limit = 100): Promise<AppNotification[]> {
  const [{ data, error }, { data: tpls }] = await Promise.all([
    supabase.rpc('my_notifications', { p_limit: limit }),
    supabase.rpc('notification_templates'),
  ]);
  if (error) throw error;
  const rows = specRows((tpls ?? []) as MessageTemplate[]);
  return ((data ?? []) as { id: string; kind: string; template_id: string | null; vars: Record<string, string> | null; title: string | null; body: string | null; url: string | null; created_at: string }[])
    .map(n => n.kind === 'manual'
      ? { id: n.id, at: n.created_at, manual: true, title: n.title ?? '', items: [], body: n.body ?? '', pushText: n.body ?? '',
          button: n.url && n.url !== '/app' ? { name: '열기', url: n.url } : undefined }
      : { id: n.id, at: n.created_at, manual: false, ...renderNotification(n.template_id ?? '', n.vars ?? {}, rows) });
}

export async function getUnreadCount(): Promise<number> {
  const { data, error } = await supabase.rpc('my_unread_notifications');
  if (error) return 0;
  return (data as number) ?? 0;
}

export async function markNotificationsRead(): Promise<void> {
  await supabase.rpc('mark_my_notifications_read');
  window.dispatchEvent(new Event('notifications-read'));
}
