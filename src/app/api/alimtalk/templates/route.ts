import { supabaseFor } from '@/lib/supabaseServer';
import { solapiFetch, solapiReady } from '@/lib/solapi';
import type { MessageSpec } from '@/lib/messages';

// 알림톡 템플릿 심사 (관리자만)
//   GET  — 솔라피에 올린 템플릿 목록(이름 · 상태 · 반려 사유)
//   POST — { items: [{ key, name, spec }] } 를 솔라피에 등록하고 바로 카카오 검수 요청
// 카테고리 · 메시지 유형 · We 로고 그림은 이미 통과한 "시간표 신청 확정/취소" 템플릿(booking_result)을 그대로 따른다.
// 선결제 카드 그림은 사이트의 /alimtalk/card.png 를 솔라피에 올려서 쓴다.

type Item = { key: string; name: string; spec: MessageSpec };
type Tpl = {
  templateId: string; name: string; status: string; categoryCode?: string; messageType?: string; emphasizeType?: string;
  imageId?: string | null; header?: string | null; highlight?: { title?: string; description?: string; imageId?: string | null } | null;
  comments?: { content?: string; dateCreated?: string }[]; dateCreated?: string; isDeleted?: boolean;
};

async function guard(request: Request) {
  const db = supabaseFor(request);
  const { data: isAdmin } = await db.rpc('is_admin');
  if (!isAdmin) return { db, error: Response.json({ error: '관리자만 할 수 있어요' }, { status: 403 }) };
  if (!solapiReady()) return { db, error: Response.json({ error: '솔라피 키가 없어요 — 실제 사이트(we-center.vercel.app)에서 해 주세요' }, { status: 400 }) };
  return { db, error: null };
}

const errText = (d: { errorMessage?: string; message?: string; errorCode?: string }) => d?.errorMessage ?? d?.message ?? d?.errorCode ?? '알 수 없는 오류';

export async function GET(request: Request) {
  const { error } = await guard(request);
  if (error) return error;
  const list: Tpl[] = [];
  let next = '';
  for (let i = 0; i < 10; i++) {
    const r = await solapiFetch(`/kakao/v2/templates?limit=100${next ? `&startKey=${encodeURIComponent(next)}` : ''}`);
    if (!r.ok) return Response.json({ error: errText(r.data) }, { status: 502 });
    list.push(...((r.data.templateList ?? []) as Tpl[]));
    next = r.data.nextKey ?? '';
    if (!next) break;
  }
  return Response.json({
    templates: list.filter(t => !t.isDeleted).map(t => ({
      templateId: t.templateId, name: t.name, status: t.status, dateCreated: t.dateCreated,
      comment: [...(t.comments ?? [])].reverse().find(c => c.content)?.content ?? '',
    })),
  });
}

export async function POST(request: Request) {
  const { db, error } = await guard(request);
  if (error) return error;
  const { items } = (await request.json().catch(() => ({}))) as { items?: Item[] };
  if (!items?.length) return Response.json({ error: '올릴 템플릿을 골라 주세요' }, { status: 400 });

  // 기준 = 이미 통과한 booking_result 템플릿
  const { data: refRow } = await db.from('alimtalk_templates').select('template_id').eq('id', 'booking_result').maybeSingle();
  if (!refRow?.template_id) return Response.json({ error: '통과한 "시간표 신청 확정/취소" 템플릿 ID가 저장돼 있어야 해요 (테스트 보내기 화면에서 [ID 저장])' }, { status: 400 });
  const ref = await solapiFetch(`/kakao/v2/templates/${refRow.template_id}`);
  if (!ref.ok) return Response.json({ error: `기준 템플릿을 못 읽었어요 — ${errText(ref.data)}` }, { status: 502 });
  const base = ref.data as Tpl;
  const logoImageId = base.imageId ?? base.highlight?.imageId ?? null;

  // 선결제 카드 그림 — 필요할 때 한 번만 올린다
  let cardImageId: string | null = null;
  const cardImage = async () => {
    if (cardImageId) return cardImageId;
    const png = await fetch(new URL('/alimtalk/card.png', request.url), { cache: 'no-store' });
    if (!png.ok) throw new Error('선결제 카드 그림(/alimtalk/card.png)을 못 읽었어요');
    const file = Buffer.from(await png.arrayBuffer()).toString('base64');
    const up = await solapiFetch('/storage/v1/files', { method: 'POST', body: { file, type: 'ATA', name: 'prepaid-card.png' } });
    if (!up.ok || !up.data.fileId) throw new Error(`카드 그림 올리기 실패 — ${errText(up.data)}`);
    cardImageId = up.data.fileId as string;
    return cardImageId;
  };

  const results: { key: string; ok: boolean; templateId?: string; error?: string }[] = [];
  for (const it of items) {
    try {
      const s = it.spec;
      const imageId = s.image === 'card' ? await cardImage() : s.image === 'logo' ? logoImageId : null;
      const body = {
        channelId: process.env.SOLAPI_PFID,
        name: it.name,
        content: s.body,
        categoryCode: base.categoryCode,
        messageType: base.messageType ?? 'BA',
        emphasizeType: 'ITEM_LIST',
        ...(base.header ? { header: s.title } : { highlight: { title: s.title, description: s.sub } }),
        item: { list: s.items.filter(i => i.name.trim() && i.value.trim()).map(i => ({ title: i.name, description: i.value })) },
        ...(imageId ? { imageId } : {}),
        buttons: s.button.name.trim() ? [{ buttonType: 'WL', buttonName: s.button.name, linkMo: s.button.url, linkPc: s.button.url }] : [],
      };
      const made = await solapiFetch('/kakao/v2/templates', { method: 'POST', body });
      if (!made.ok || !made.data.templateId) { results.push({ key: it.key, ok: false, error: `등록 실패 — ${errText(made.data)}` }); continue; }
      const templateId = made.data.templateId as string;
      const insp = await solapiFetch(`/kakao/v2/templates/${templateId}/inspection`, {
        method: 'PUT', body: { comment: '소아재활센터 이용 보호자에게 보내는 수업·이용 안내(정보성) 메시지입니다.' },
      });
      results.push(insp.ok ? { key: it.key, ok: true, templateId } : { key: it.key, ok: false, templateId, error: `등록은 됐지만 검수 요청 실패 — ${errText(insp.data)}` });
    } catch (e) {
      results.push({ key: it.key, ok: false, error: (e as Error).message });
    }
  }
  return Response.json({ results });
}
