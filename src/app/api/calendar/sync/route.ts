import { supabaseFor } from '@/lib/supabaseServer';
import { removeLesson, upsertLesson } from '@/lib/googleCalendar';

// 시간 칸 하나를 구글 캘린더에 맞춘다 — 신청돼 있으면(취소 승인 전) 선생님 캘린더에 50분 수업 일정을 넣고, 아니면 지운다.
// 신청·취소 승인·관리자 취소 뒤에 화면에서 부른다. DB 상태를 그대로 옮길 뿐이라 여러 번 불러도 괜찮다.
// 부른 사람이 그 칸을 볼 수 있어야 한다(승인된 보호자·관리자 — DB 정책이 막는다).

export async function POST(request: Request) {
  const { slotId } = await request.json().catch(() => ({}));
  if (typeof slotId !== 'string') return Response.json({ error: 'slotId' }, { status: 400 });
  const db = supabaseFor(request);

  const { data: slot, error } = await db
    .from('slots').select('id, day, time, booked_by, cancel_state, teacher_id, teachers(name, google_calendar_id)')
    .eq('id', slotId).maybeSingle();
  if (error || !slot) return Response.json({ error: 'not found' }, { status: 404 });

  const teacher = slot.teachers as unknown as { name: string; google_calendar_id: string | null } | null;
  const calendarId = teacher?.google_calendar_id;
  if (!calendarId) return Response.json({ skipped: 'no calendar' });

  try {
    if (slot.booked_by && slot.cancel_state !== 'approved') {
      const { data: b } = await db
        .from('bookings').select('nickname, label')
        .eq('slot_id', slotId).eq('kind', 'book').order('created_at', { ascending: false }).limit(1).maybeSingle();
      const who = b?.nickname ?? '보호자';
      const state = slot.cancel_state === 'requested' ? ' (취소 신청 중)' : '';
      await upsertLesson(calendarId, slotId, slot.day, slot.time, `${who} 수업${state}`, `${b?.label ?? ''}\nWE 소아재활센터 수업스케쥴에서 신청`);
      return Response.json({ synced: 'upsert' });
    }
    await removeLesson(calendarId, slotId);
    return Response.json({ synced: 'remove' });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
