import { supabaseFor } from '@/lib/supabaseServer';
import { sendAlimtalk, solapiReady } from '@/lib/solapi';

// 보낼 알림(outbox_messages) 보내기 (관리자만) — { ids: [...] }
// 알림 종류마다 솔라피 템플릿 ID(alimtalk_templates)가 있어야 보낸다. 결과는 그 줄에 적는다(보냄·실패·안 보냄).

export async function POST(request: Request) {
  const db = supabaseFor(request);
  const { data: isAdmin } = await db.rpc('is_admin');
  if (!isAdmin) return Response.json({ error: '관리자만 보낼 수 있어요' }, { status: 403 });
  if (!solapiReady()) return Response.json({ error: '솔라피 키가 없어요 (Vercel 환경 변수)' }, { status: 400 });

  const { ids } = await request.json().catch(() => ({}));
  if (!Array.isArray(ids) || !ids.length) return Response.json({ sent: 0, failed: 0, skipped: 0 });
  const [{ data: rows, error }, { data: tpls }] = await Promise.all([
    db.from('outbox_messages').select('*').in('id', ids).eq('status', 'pending'),
    db.from('alimtalk_templates').select('id, template_id'),
  ]);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const tid = new Map((tpls ?? []).map(t => [t.id as string, t.template_id as string]));

  let sent = 0, failed = 0, skipped = 0, waiting = 0;
  for (const r of rows ?? []) {
    const templateId = tid.get(r.template_id);
    if (!templateId) { waiting++; await db.from('outbox_messages').update({ error: '솔라피 템플릿 ID가 아직 없어요' }).eq('id', r.id); continue; }
    if (!r.phone) { skipped++; await db.from('outbox_messages').update({ status: 'skipped', error: '번호 없음' }).eq('id', r.id); continue; }
    const variables = Object.fromEntries(Object.entries((r.vars ?? {}) as Record<string, string>).map(([k, v]) => [`#{${k}}`, String(v)]));
    try {
      const res = await sendAlimtalk({ to: r.phone, templateId, variables });
      const msg = res.data?.errorMessage ?? res.data?.message;
      if (res.ok) { sent++; await db.from('outbox_messages').update({ status: 'sent', error: null, sent_at: new Date().toISOString() }).eq('id', r.id); }
      else { failed++; await db.from('outbox_messages').update({ status: 'failed', error: String(msg ?? `오류 ${res.status}`).slice(0, 300) }).eq('id', r.id); }
    } catch (e) {
      failed++; await db.from('outbox_messages').update({ status: 'failed', error: (e as Error).message.slice(0, 300) }).eq('id', r.id);
    }
  }
  return Response.json({ sent, failed, skipped, waiting });
}
