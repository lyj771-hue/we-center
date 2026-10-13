import { supabaseFor } from '@/lib/supabaseServer';
import { koreanHolidays } from '@/lib/holidays';

/** 고정 수업 시작일이 없을 때 (처음 시간표를 넣은 날) */
const FIXED_DEFAULT_START = '2026-10-01';

// "이 날부터 고정" (관리자 전용) — { from, teacherId, weekday, time, center, input }
// 이전 고정 수업은 from 전날까지(지난 날짜는 그날 칸으로 남겨 시간표·결제 기록이 그대로 보이게), from 부터 새 고정 수업.
// input 이 없거나 이름이 비면 이 날부터 고정 수업 없음.

type Row = Record<string, unknown>;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
/** 고정 수업 시작일 이후 첫 그 요일 */
function firstDayFor(weekday: number, startDate = FIXED_DEFAULT_START): string {
  const d = new Date(`${startDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + ((weekday - d.getUTCDay() + 7) % 7));
  return ymd(d);
}

export async function POST(request: Request) {
  const db = supabaseFor(request);
  const { data: isAdmin } = await db.rpc('is_admin');
  if (!isAdmin) return Response.json({ error: 'forbidden' }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const { from, teacherId, weekday, time, input } = body as {
    from: string; teacherId: string; weekday: number; time: string;
    input: { childId?: string | null; name?: string; payment?: string; oral?: boolean; kind?: 'exercise' | 'oral' | null; note?: string } | null;
  };
  const center = (body.center as string) ?? 'eunpyeong';

  try {
    const { data: oldRow } = await db.from('fixed_lessons').select('*').match({ center, teacher_id: teacherId, weekday, time }).maybeSingle();
    const old = oldRow as Row | null;
    const startOf = (r: Row) => ((r.start_date as string) ?? FIXED_DEFAULT_START);

    if (old && startOf(old) < from) {
      // 1) 지난 날짜(이전 시작일 ~ 전날)는 그날 칸으로 남긴다 (공휴일·이미 바꾼 날은 빼고)
      const holidays = await koreanHolidays(startOf(old), from);
      const { data: cells } = await db.from('board_cells').select('day').match({ center, teacher_id: teacherId, time, side: 'fixed' }).lt('day', from);
      const has = new Set((cells ?? []).map(c => c.day as string));
      const rows: Row[] = [];
      for (let d = firstDayFor(weekday, startOf(old)); d < from; d = ymd(new Date(new Date(`${d}T00:00:00Z`).getTime() + 7 * 86400000))) {
        if (has.has(d) || holidays.includes(d)) continue;
        rows.push({ center, day: d, teacher_id: teacherId, time, side: 'fixed', status: 'child', child_id: old.child_id, name: old.name, payment: old.payment, oral: old.oral, ...(old.kind !== undefined ? { kind: old.kind } : {}), ...(old.note ? { note: old.note } : {}), absent: false, moved: false });
      }
      if (rows.length) {
        const { error } = await db.from('board_cells').insert(rows);
        if (error) throw new Error(error.message);
      }
    }

    // 2) 새 고정 수업
    if (input && (input.name ?? '').trim()) {
      const row = {
        center, weekday, teacher_id: teacherId, time, child_id: input.childId ?? null, name: input.name!.trim(), payment: (input.payment ?? '').trim(),
        oral: input.kind !== undefined ? input.kind === 'oral' : !!input.oral, ...(input.kind !== undefined ? { kind: input.kind } : {}),
        ...(input.note !== undefined ? { note: input.note.trim() || null } : {}), start_date: from,
      };
      const { error } = await db.from('fixed_lessons').upsert(row, { onConflict: 'center,teacher_id,weekday,time' });
      if (error) throw new Error(error.message);
      // 메모는 이 날부터 그날 바꾼 칸(결석·결제 등, 같은 아이)에도 똑같이
      if (input.note !== undefined && row.child_id) {
        const { data: same } = await db.from('board_cells').select('id, day')
          .match({ center, teacher_id: teacherId, time, side: 'fixed', child_id: row.child_id }).gte('day', from);
        const ids = (same ?? []).filter(c => new Date(`${c.day}T12:00:00Z`).getUTCDay() === weekday).map(c => c.id as string);
        if (ids.length) {
          const { error: e2 } = await db.from('board_cells').update({ note: input.note.trim() || null }).in('id', ids);
          if (e2) throw new Error(e2.message);
        }
      }
    } else if (old) {
      const { error } = await db.from('fixed_lessons').delete().match({ center, weekday, teacher_id: teacherId, time });
      if (error) throw new Error(error.message);
    }
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
