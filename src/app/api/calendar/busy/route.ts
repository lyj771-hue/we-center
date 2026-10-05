import type { NextRequest } from 'next/server';
import { supabaseFor } from '@/lib/supabaseServer';
import { busyTimes } from '@/lib/googleCalendar';

// 관리자 전용 — 선생님 구글 캘린더의 바쁜 시간들. 스케쥴 올릴 때 "캘린더 빈 시간"으로 쓴다.
// ?teacherId=...&from=YYYY-MM-DD&to=YYYY-MM-DD

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const teacherId = q.get('teacherId');
  const from = q.get('from');
  const to = q.get('to');
  if (!teacherId || !from || !to) return Response.json({ error: 'params' }, { status: 400 });

  const db = supabaseFor(request);
  const { data: isAdmin } = await db.rpc('is_admin');
  if (!isAdmin) return Response.json({ error: 'forbidden' }, { status: 403 });

  const { data: teacher } = await db.from('teachers').select('google_calendar_id').eq('id', teacherId).maybeSingle();
  if (!teacher?.google_calendar_id) return Response.json({ error: '이 선생님은 캘린더가 연결돼 있지 않아요' }, { status: 404 });

  try {
    return Response.json({ busy: await busyTimes(teacher.google_calendar_id, from, to) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
