import { supabaseFor } from '@/lib/supabaseServer';
import { sendAlimtalk, solapiReady } from '@/lib/solapi';

// 보호자가 수업스케쥴에서 신청한 직후 — 그 보호자에게 '수업 확정' 알림톡 (supabase/booking-alimtalk.sql)
// { slotId } — 보호자 본인 계정으로 부른다. 내 신청일 때만, 내 번호로만 간다.

export async function POST(request: Request) {
  if (!solapiReady()) return Response.json({ skipped: 'no_keys' });
  const db = supabaseFor(request);
  const { slotId } = await request.json().catch(() => ({}));
  if (!slotId) return Response.json({ error: 'slotId' }, { status: 400 });
  const { data: p, error } = await db.rpc('prepare_booking_alimtalk', { p_slot: slotId });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!p || !p.template_id || !p.phone) return Response.json({ skipped: !p ? 'not_mine' : !p.phone ? 'no_phone' : 'no_template' });
  const variables = Object.fromEntries(Object.entries(p.vars as Record<string, string>).map(([k, v]) => [`#{${k}}`, String(v)]));
  try {
    const r = await sendAlimtalk({ to: p.phone, templateId: p.template_id, variables });
    const msg = r.ok ? null : String(r.data?.errorMessage ?? r.data?.message ?? `오류 ${r.status}`).slice(0, 300);
    await db.rpc('mark_my_outbox', { p_id: p.id, p_status: r.ok ? 'sent' : 'failed', p_error: msg });
    return Response.json({ sent: r.ok });
  } catch (e) {
    await db.rpc('mark_my_outbox', { p_id: p.id, p_status: 'failed', p_error: (e as Error).message.slice(0, 300) });
    return Response.json({ sent: false });
  }
}
