import { supabaseFor } from '@/lib/supabaseServer';
import { sendAlimtalk, solapiReady } from '@/lib/solapi';

// 선생님이 만든 보낼 알림 보내기 — { ids } (supabase/teacher-schedule-post.sql)
// 선생님은 알림 표를 직접 못 읽어서, 내가 방금 만든 것만 돌려주는 함수(teacher_outbox_rows)로 읽고 결과는 teacher_mark_outbox 로 적는다.
// 관리자에게 가는 알림(번호 없음)은 관리자 번호(Vercel 환경 변수 ALIMTALK_ADMIN_PHONE)로.

const ADMIN_TEMPLATES = ['teacher_schedule_admin', 'lesson_cancel_admin'];

export async function POST(request: Request) {
  const db = supabaseFor(request);
  const { data: isTeacher } = await db.rpc('is_teacher');
  if (!isTeacher) return Response.json({ error: '선생님만 보낼 수 있어요' }, { status: 403 });
  if (!solapiReady()) return Response.json({ error: '솔라피 키가 없어요 (Vercel 환경 변수)' }, { status: 400 });

  const { ids } = await request.json().catch(() => ({}));
  if (!Array.isArray(ids) || !ids.length) return Response.json({ sent: 0, failed: 0, skipped: 0, waiting: 0 });
  const { data: rows, error } = await db.rpc('teacher_outbox_rows', { p_ids: ids });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const mark = (id: string, status: string, err: string | null) => db.rpc('teacher_mark_outbox', { p_id: id, p_status: status, p_error: err });

  let sent = 0, failed = 0, skipped = 0, waiting = 0;
  for (const r of (rows ?? []) as { id: string; template_id: string; solapi_id: string | null; phone: string | null; vars: Record<string, string> }[]) {
    if (!r.solapi_id) { waiting++; await mark(r.id, 'pending', '솔라피 템플릿 ID가 아직 없어요'); continue; }
    const phone = r.phone ?? (ADMIN_TEMPLATES.includes(r.template_id) ? process.env.ALIMTALK_ADMIN_PHONE : null);
    if (!phone) { skipped++; await mark(r.id, 'skipped', '번호 없음'); continue; }
    const variables = Object.fromEntries(Object.entries(r.vars ?? {}).map(([k, v]) => [`#{${k}}`, String(v)]));
    try {
      const res = await sendAlimtalk({ to: phone, templateId: r.solapi_id, variables });
      if (res.ok) { sent++; await mark(r.id, 'sent', null); }
      else { failed++; await mark(r.id, 'failed', String(res.data?.errorMessage ?? res.data?.message ?? `오류 ${res.status}`).slice(0, 300)); }
    } catch (e) {
      failed++; await mark(r.id, 'failed', (e as Error).message.slice(0, 300));
    }
  }
  return Response.json({ sent, failed, skipped, waiting });
}
