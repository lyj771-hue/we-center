import { createClient } from '@supabase/supabase-js';

// API 라우트에서 쓰는 Supabase — 요청한 사람의 로그인 토큰을 그대로 실어서, DB 보안 정책이 그 사람 기준으로 적용되게 한다.
export function supabaseFor(request: Request) {
  const auth = request.headers.get('authorization') ?? '';
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: auth ? { Authorization: auth } : {} },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
