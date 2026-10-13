import type { NextRequest } from 'next/server';
import { supabaseFor } from '@/lib/supabaseServer';
import { koreanHolidayList, koreanHolidays } from '@/lib/holidays';

// 관리자 전용 — 대한민국 공휴일 날짜들. 시간표 관리에서 공휴일엔 고정 수업을 비운다.
// ?from=YYYY-MM-DD&to=YYYY-MM-DD
// &names=1 — 날짜와 이름(마이페이지 주별 시간표). 누구나 보는 정보라 로그인 없이, 하루 동안 캐시

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const from = q.get('from');
  const to = q.get('to');
  if (!from || !to) return Response.json({ error: 'params' }, { status: 400 });

  if (q.get('names')) {
    try {
      return Response.json({ holidays: await koreanHolidayList(from, to) }, { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=86400' } });
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 502 });
    }
  }

  const db = supabaseFor(request);
  const { data: isAdmin } = await db.rpc('is_admin');
  if (!isAdmin) return Response.json({ error: 'forbidden' }, { status: 403 });

  try {
    return Response.json({ holidays: await koreanHolidays(from, to) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
