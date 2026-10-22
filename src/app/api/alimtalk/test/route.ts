import { supabaseFor } from '@/lib/supabaseServer';
import { sendAlimtalk, solapiReady } from '@/lib/solapi';

// 알림톡 테스트 보내기 (관리자만) — { to, templateId, variables: { '#{이름}': … } }

export async function POST(request: Request) {
  const db = supabaseFor(request);
  const { data: isAdmin } = await db.rpc('is_admin');
  if (!isAdmin) return Response.json({ error: '관리자만 보낼 수 있어요' }, { status: 403 });
  if (!solapiReady()) return Response.json({ error: '솔라피 키가 아직 없어요 — Vercel 환경 변수 SOLAPI_API_KEY · SOLAPI_API_SECRET · SOLAPI_PFID 를 넣어 주세요' }, { status: 400 });

  const { to, templateId, variables } = await request.json().catch(() => ({}));
  if (!to || String(to).replace(/\D/g, '').length < 10) return Response.json({ error: '받는 번호를 확인해 주세요' }, { status: 400 });
  if (!templateId) return Response.json({ error: '솔라피 템플릿 ID를 넣어 주세요' }, { status: 400 });
  try {
    const r = await sendAlimtalk({ to: String(to), templateId: String(templateId), variables: variables ?? {} });
    return Response.json(r, { status: r.ok ? 200 : 502 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
