import type { NextRequest } from 'next/server';
import { supabaseFor } from '@/lib/supabaseServer';

// 링크 카드 — 주소의 제목·설명·대표 그림(og 태그)을 읽어 온다. 관리자만 (글쓰기 에디터에서)
// ?url=https://…  →  { title, description, image }

const pick = (html: string, keys: string[]) => {
  for (const k of keys) {
    const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]*content=["']([^"']*)["']`, 'i'))
      ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${k}["']`, 'i'));
    if (m?.[1]) return m[1].trim();
  }
  return '';
};
const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

export async function GET(request: NextRequest) {
  const db = supabaseFor(request);
  const { data: isAdmin } = await db.rpc('is_admin');
  if (!isAdmin) return Response.json({ error: 'forbidden' }, { status: 403 });

  let url: URL;
  try { url = new URL(request.nextUrl.searchParams.get('url') ?? ''); } catch { return Response.json({ error: 'url' }, { status: 400 }); }
  // 외부 사이트만 (안쪽 주소는 읽지 않는다)
  if (!/^https?:$/.test(url.protocol) || /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[)/.test(url.hostname)) {
    return Response.json({ error: 'url' }, { status: 400 });
  }
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (link preview)' }, signal: AbortSignal.timeout(6000), redirect: 'follow' });
    const html = (await res.text()).slice(0, 300_000);
    const title = pick(html, ['og:title', 'twitter:title']) || (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '').trim();
    const description = pick(html, ['og:description', 'twitter:description', 'description']);
    let image = pick(html, ['og:image', 'twitter:image']);
    if (image) { try { image = new URL(image, url).toString(); } catch { image = ''; } }
    return Response.json({ title: decode(title), description: decode(description).slice(0, 160), image });
  } catch {
    return Response.json({ title: '', description: '', image: '' });
  }
}
