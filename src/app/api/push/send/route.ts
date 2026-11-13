import webpush from 'web-push';
import { supabaseFor } from '@/lib/supabaseServer';

// 앱 푸시 보내기 (관리자만) — { target, targetLabel, title, body, url }
// target: all = 알림 켠 모든 보호자 / eunpyeong·uijeongbu = 그 지점에 승인된 보호자 / user:<id> = 한 보호자
// 앱을 지웠거나 알림을 끈 기기(404·410)는 등록을 지운다. 결과는 push_log 에 남긴다.
// 키: NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (Vercel 환경 변수)

export async function POST(request: Request) {
  const db = supabaseFor(request);
  const { data: isAdmin } = await db.rpc('is_admin');
  if (!isAdmin) return Response.json({ error: '관리자만 보낼 수 있어요' }, { status: 403 });

  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return Response.json({ error: '푸시 키가 없어요 (Vercel 환경 변수 VAPID)' }, { status: 400 });
  webpush.setVapidDetails('mailto:admin@we-center.local', pub, priv);

  const { target, targetLabel, title, body, url } = await request.json().catch(() => ({}));
  if (!title || typeof target !== 'string') return Response.json({ error: '제목과 받는 사람을 정해 주세요' }, { status: 400 });

  // 받는 보호자
  let q = db.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth');
  if (target.startsWith('user:')) {
    q = q.eq('user_id', target.slice(5));
  } else if (target === 'eunpyeong' || target === 'uijeongbu') {
    const [{ data: profiles }, { data: extra }] = await Promise.all([
      db.from('profiles').select('user_id, center, approved_at'),
      db.from('member_centers').select('user_id, center, approved_at'),
    ]);
    const ids = new Set<string>();
    for (const p of profiles ?? []) if ((p.center ?? 'eunpyeong') === target && p.approved_at) ids.add(p.user_id);
    for (const m of extra ?? []) if (m.center === target && m.approved_at) ids.add(m.user_id);
    if (!ids.size) return Response.json({ devices: 0, sent: 0, failed: 0, removed: 0 });
    q = q.in('user_id', [...ids]);
  } else if (target !== 'all') {
    return Response.json({ error: '받는 사람이 올바르지 않아요' }, { status: 400 });
  }
  const { data: subs, error } = await q;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const payload = JSON.stringify({ title, body: body ?? '', url: url || '/app' });
  let sent = 0, failed = 0;
  const gone: string[] = [];
  await Promise.all((subs ?? []).map(async s => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24 });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) gone.push(s.id); else failed++;
    }
  }));
  if (gone.length) await db.from('push_subscriptions').delete().in('id', gone);

  const devices = subs?.length ?? 0;
  await db.from('push_log').insert({ title, body: body ?? '', url: url || '/app', target, target_label: targetLabel ?? target, devices, sent, failed, removed: gone.length });
  return Response.json({ devices, sent, failed, removed: gone.length });
}
