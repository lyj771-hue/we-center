import webpush from 'web-push';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MessageTemplate } from './messages';
import { renderNotification, specRows } from './notifyRender';

// 서버 전용 — 보낼 알림(outbox_messages)을 앱 푸시로 먼저 보낸다 (supabase/push-first.sql).
// 받는 사람 기기 하나라도 받으면 그 줄은 '보냄'(앱 푸시)으로 끝, 아니면 이유(push_error)를 적고 알림톡으로 넘긴다.
// 돌려주는 값 = 앱 푸시로 간 줄 id — 나머지만 알림톡으로 보내면 된다.

type Sub = { id: string; endpoint: string; p256dh: string; auth: string };
type Target = { id: string; user_id: string | null; template_id: string; vars: Record<string, string>; subs: Sub[] };

const pushReady = () => !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

export async function pushFirst(db: SupabaseClient, ids: string[], secret?: string | null): Promise<Set<string>> {
  const pushed = new Set<string>();
  if (!ids.length) return pushed;
  const [{ data, error }, { data: tpls }] = await Promise.all([
    db.rpc('outbox_delivery', { p_ids: ids, p_secret: secret ?? null }),
    db.rpc('notification_templates'),
  ]);
  if (error) { console.error('outbox_delivery', error.message); return pushed; }   // push-first.sql 전이면 알림톡만
  const rows = specRows((tpls ?? []) as MessageTemplate[]);
  if (pushReady()) webpush.setVapidDetails('https://we-center.vercel.app', process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);

  await Promise.all(((data ?? []) as Target[]).map(async t => {
    const mark = (ok: boolean, reason: string | null, gone: string[] = []) =>
      db.rpc('outbox_mark_push', { p_id: t.id, p_ok: ok, p_push_error: reason, p_gone: gone, p_secret: secret ?? null });
    const isAdminMsg = /_admin(_\d+)?$/.test(t.template_id);
    if (!t.user_id && !isAdminMsg) { await mark(false, '앱 계정과 이어지지 않은 보호자예요'); return; }
    if (!pushReady()) { await mark(false, '앱 푸시 키가 없어요 (Vercel 환경 변수 VAPID)'); return; }
    if (!t.subs?.length) { await mark(false, isAdminMsg ? '관리자 계정이 앱 알림을 켜지 않았어요' : '앱 알림을 켜지 않았어요 (앱 미설치 또는 알림 꺼짐)'); return; }

    const r = renderNotification(t.template_id, t.vars ?? {}, rows);
    const payload = JSON.stringify({ title: r.title, body: r.pushText, url: r.button?.url ?? '/app/notifications', tag: t.id });
    const gone: string[] = [];
    const errs: string[] = [];
    let ok = 0;
    await Promise.all(t.subs.map(async s => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24 });
        ok++;
      } catch (e) {
        const err = e as { statusCode?: number; body?: string; message?: string };
        if (err.statusCode === 404 || err.statusCode === 410) { gone.push(s.id); return; }
        errs.push(`${err.statusCode ?? ''} ${(err.body || err.message || '').toString().slice(0, 120)}`.trim());
      }
    }));
    if (ok > 0) { pushed.add(t.id); await mark(true, null, gone); return; }
    const reason = errs.length ? `앱 푸시 보내기 실패: ${[...new Set(errs)].join(' / ')}` : '앱을 지웠거나 휴대폰에서 알림을 껐어요';
    await mark(false, reason, gone);
  }));
  return pushed;
}
