import { createClient } from '@supabase/supabase-js';
import { sendAlimtalk, solapiReady } from '@/lib/solapi';

// 예약 게시 5분 전 '스케줄 게시 예정 알림' 보내기 (supabase/schedule-reserve.sql)
// Supabase 예약 작업(pg_cron)이 매분, 5분 안에 게시될 글이 있을 때만 부른다 — Authorization: Bearer <비밀 글자>.
// 비밀 글자는 DB(app_secrets)에만 있고, 맞는지는 DB 함수가 확인한다. 로그인 토큰이 아니라서 익명 키로만 부른다.

export async function POST(request: Request) {
  const secret = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!secret) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!solapiReady()) return Response.json({ error: '솔라피 키가 없어요 (Vercel 환경 변수)' }, { status: 400 });
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: rows, error } = await db.rpc('cron_schedule_prealert', { p_secret: secret });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const mark = (id: string, status: string, err: string | null) => db.rpc('cron_mark_outbox', { p_secret: secret, p_id: id, p_status: status, p_error: err });

  let sent = 0, failed = 0, skipped = 0, waiting = 0;
  for (const r of (rows ?? []) as { id: string; solapi_id: string | null; phone: string | null; vars: Record<string, string> }[]) {
    if (!r.solapi_id) { waiting++; await mark(r.id, 'pending', '솔라피 템플릿 ID가 아직 없어요'); continue; }
    if (!r.phone) { skipped++; await mark(r.id, 'skipped', '번호 없음'); continue; }
    const variables = Object.fromEntries(Object.entries(r.vars ?? {}).map(([k, v]) => [`#{${k}}`, String(v)]));
    try {
      const res = await sendAlimtalk({ to: r.phone, templateId: r.solapi_id, variables });
      if (res.ok) { sent++; await mark(r.id, 'sent', null); }
      else { failed++; await mark(r.id, 'failed', String(res.data?.errorMessage ?? res.data?.message ?? `오류 ${res.status}`).slice(0, 300)); }
    } catch (e) {
      failed++; await mark(r.id, 'failed', (e as Error).message.slice(0, 300));
    }
  }
  return Response.json({ sent, failed, skipped, waiting });
}
