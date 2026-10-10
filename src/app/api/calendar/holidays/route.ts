import type { NextRequest } from 'next/server';
import { supabaseFor } from '@/lib/supabaseServer';
import { koreanHolidays } from '@/lib/googleCalendar';

// 관리자 전용 — 대한민국 공휴일 날짜들. 시간표 관리에서 공휴일엔 고정 수업을 비운다.
// ?from=YYYY-MM-DD&to=YYYY-MM-DD

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const from = q.get('from');
  const to = q.get('to');
  if (!from || !to) return Response.json({ error: 'params' }, { status: 400 });

  const db = supabaseFor(request);
  const { data: isAdmin } = await db.rpc('is_admin');
  if (!isAdmin) return Response.json({ error: 'forbidden' }, { status: 403 });

  try {
    return Response.json({ holidays: await koreanHolidays(from, to) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
