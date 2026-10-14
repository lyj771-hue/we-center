// 카카오 로그인 직후 — 카카오 접근 토큰으로 카카오계정 전화번호를 읽어 온다 (가입 창 뒷번호 칸 미리 채우기·알림톡용).
// 브라우저에서 카카오 API를 바로 부르면 막혀서(CORS) 서버가 대신 부른다. 토큰은 저장하지 않는다.
// { token } → { phone: "010-1234-5678" | null }

/** "+82 10-1234-5678" → "010-1234-5678" */
function toLocal(p: string): string {
  const d = p.replace(/^\+82\s*/, '0').replace(/[^\d]/g, '');
  return d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : d;
}

export async function POST(request: Request) {
  const { token } = await request.json().catch(() => ({}));
  if (!token || typeof token !== 'string') return Response.json({ error: 'token' }, { status: 400 });
  const res = await fetch('https://kapi.kakao.com/v2/user/me?property_keys=' + encodeURIComponent('["kakao_account.phone_number"]'), {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) return Response.json({ error: `kakao ${res.status}` }, { status: 502 });
  const data = await res.json();
  const raw = data?.kakao_account?.phone_number as string | undefined;
  return Response.json({ phone: raw ? toLocal(raw) : null });
}
