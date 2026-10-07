import { supabaseFor } from '@/lib/supabaseServer';
import {
  fixedEventId, koreanHolidays, listFixedEventIds, openCellEventId, removeEvent, setFixedOccurrence, upsertFixedLesson, upsertOpenCell,
  type LessonText,
} from '@/lib/googleCalendar';

// 관리자 시간표 → 선생님 구글 캘린더 (관리자 전용)
//   { action: 'full' }                               전부 다시 맞추기 — 고정 수업 반복 일정 + 이번 주부터 그날 바꾼 칸
//   { action: 'fixed', teacherId, weekday, time }    고정 수업 하나
//   { action: 'cell', day, teacherId, time, side }   날짜별 칸 하나
// 고정 수업은 이번 주 월요일부터 매주 반복, 대한민국 공휴일은 뺀다(앞으로 1년치 공휴일을 반영).

export const maxDuration = 300;   // 전체 반영은 일정이 많아 오래 걸릴 수 있다

type Row = Record<string, unknown>;
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const PAY: Record<string, string> = { b: '바우처', e: '굳센', c: '꿈이든' };

function seoulToday(): Date {
  const d = new Date(Date.now() + 9 * 3600000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
const ymd = (d: Date) => d.toISOString().slice(0, 10);
function thisMondayYmd(): string {
  const d = seoulToday();
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return ymd(d);
}
function firstDayFor(weekday: number): string {
  const d = new Date(`${thisMondayYmd()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + ((weekday + 6) % 7));
  return ymd(d);
}

/** 캘린더 일정 글 — 시간표 칸과 같은 모양(3S김채현b), 결석이면 뒤에 "결석" */
function lessonText(r: Row, child: Row | undefined, kind: '고정' | '빈타임', absent = false, centerName?: string): LessonText {
  const name = (r.name as string) || (child?.name as string) || '';
  const pay = (r.payment as string) || '';
  const code = (child?.member_code as string) || undefined;
  const summary = `${child?.number ?? ''}${r.oral ? 'S' : ''}${name}${pay}${absent ? ' 결석' : ''}`;
  const lines = [`WE 소아재활센터${centerName && centerName !== '은평' ? ` ${centerName}` : ''} ${kind} 수업`];
  if (code) lines.push(`회원 코드 ${code}`);
  if (pay) lines.push(`결제 ${pay.split('').map(c => PAY[c] ?? c).join('/')}`);
  if (r.note) lines.push(`메모 ${r.note}`);
  return { summary, description: lines.join('\n'), memberCode: code };
}

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  const errors: string[] = [];
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) {
      const x = items[i++];
      try { await fn(x); } catch (e) { errors.push((e as Error).message); }
    }
  }));
  return errors;
}

export async function POST(request: Request) {
  const db = supabaseFor(request);
  const { data: isAdmin } = await db.rpc('is_admin');
  if (!isAdmin) return Response.json({ error: 'forbidden' }, { status: 403 });
  const body = await request.json().catch(() => ({}));

  const [tRes, fRes, cRes] = await Promise.all([
    db.from('teachers').select('id, name, google_calendar_id'),
    db.from('fixed_lessons').select('*'),
    db.from('children').select('id, name, number, member_code'),
  ]);
  const calOf = new Map((tRes.data ?? []).filter(t => t.google_calendar_id).map(t => [t.id as string, t.google_calendar_id as string]));
  const childOf = new Map((cRes.data ?? []).map(c => [c.id as string, c as Row]));
  const fixedRows = (fRes.data ?? []) as Row[];
  const fixedAt = (teacherId: string, weekday: number, time: string, center: string) =>
    fixedRows.find(f => f.teacher_id === teacherId && f.weekday === weekday && f.time === time && (f.center ?? 'eunpyeong') === center);
  const centerOf = (r: Row) => ((r.center as string) ?? 'eunpyeong');
  const CENTER_NAME: Record<string, string> = { eunpyeong: '은평', uijeongbu: '의정부' };
  const monday = thisMondayYmd();

  // 그날 바꾼 칸 하나 반영
  const applyCell = async (c: Row) => {
    const cal = calOf.get(c.teacher_id as string);
    if (!cal) return;
    const day = c.day as string;
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
    if (c.side === 'fixed') {
      const off = c.status !== 'child' || c.moved;
      await setFixedOccurrence(cal, c.teacher_id as string, weekday, c.time as string, day,
        off ? null : lessonText(c, childOf.get(c.child_id as string), '고정', !!c.absent), centerOf(c));
    } else if (c.status === 'child' && !c.moved) {
      await upsertOpenCell(cal, day, c.teacher_id as string, c.time as string, lessonText(c, childOf.get(c.child_id as string), '빈타임', !!c.absent), centerOf(c));
    } else {
      await removeEvent(cal, openCellEventId(day, c.teacher_id as string, c.time as string, centerOf(c)));
    }
  };

  try {
    if (body.action === 'full') {
      const holidays = await koreanHolidays(monday, ymd(new Date(Date.now() + 400 * 86400000)));
      const want = fixedRows.filter(f => calOf.has(f.teacher_id as string));
      const errors = await pool(want, 2, async f => {
        await upsertFixedLesson(calOf.get(f.teacher_id as string)!, f.teacher_id as string, f.weekday as number, f.time as string,
          firstDayFor(f.weekday as number), holidays, lessonText(f, childOf.get(f.child_id as string), '고정', false, CENTER_NAME[centerOf(f)]), centerOf(f));
      });
      // 시간표에서 지운 고정 수업의 반복 일정 지우기
      let removed = 0;
      for (const [teacherId, cal] of calOf) {
        const keep = new Set(want.filter(f => f.teacher_id === teacherId).map(f => fixedEventId(teacherId, f.weekday as number, f.time as string, centerOf(f))));
        const extra = (await listFixedEventIds(cal)).filter(id => !keep.has(id));
        errors.push(...await pool(extra, 2, async id => { await removeEvent(cal, id); removed++; }));
      }
      // 이번 주부터 그날 바꾼 칸
      const { data: cells } = await db.from('board_cells').select('*').gte('day', monday);
      errors.push(...await pool((cells ?? []) as Row[], 2, applyCell));
      return Response.json({ fixed: want.length, removed, cells: cells?.length ?? 0, holidays: holidays.length, errors: errors.slice(0, 5), errorCount: errors.length });
    }

    if (body.action === 'fixed') {
      const { teacherId, weekday, time } = body as { teacherId: string; weekday: number; time: string };
      const center = (body.center as string) ?? 'eunpyeong';
      const cal = calOf.get(teacherId);
      if (!cal) return Response.json({ skipped: 'no calendar' });
      const f = fixedAt(teacherId, weekday, time, center);
      if (f) {
        const holidays = await koreanHolidays(monday, ymd(new Date(Date.now() + 400 * 86400000)));
        await upsertFixedLesson(cal, teacherId, weekday, time, firstDayFor(weekday), holidays, lessonText(f, childOf.get(f.child_id as string), '고정', false, CENTER_NAME[center]), center);
        // 그날 바꾼 칸은 다시 씌운다
        const { data: cells } = await db.from('board_cells').select('*').eq('center', center).eq('teacher_id', teacherId).eq('time', time).eq('side', 'fixed').gte('day', monday);
        for (const c of (cells ?? []) as Row[]) if (new Date(`${c.day}T12:00:00Z`).getUTCDay() === weekday) await applyCell(c);
      } else {
        await removeEvent(cal, fixedEventId(teacherId, weekday, time, center));
      }
      return Response.json({ synced: f ? 'upsert' : 'remove' });
    }

    if (body.action === 'cell') {
      const { day, teacherId, time, side } = body as { day: string; teacherId: string; time: string; side: 'fixed' | 'open' };
      const center = (body.center as string) ?? 'eunpyeong';
      const cal = calOf.get(teacherId);
      if (!cal) return Response.json({ skipped: 'no calendar' });
      const { data: c } = await db.from('board_cells').select('*').match({ center, day, teacher_id: teacherId, time, side }).maybeSingle();
      if (c) await applyCell(c as Row);
      else if (side === 'fixed') {
        // 그날 바꾼 것을 지웠다 — 고정 수업대로 되돌린다
        const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
        const f = fixedAt(teacherId, weekday, time, center);
        if (f) await setFixedOccurrence(cal, teacherId, weekday, time, day, lessonText(f, childOf.get(f.child_id as string), '고정', false, CENTER_NAME[center]), center);
      } else {
        await removeEvent(cal, openCellEventId(day, teacherId, time, center));
      }
      return Response.json({ synced: 'cell', at: `${DOW[new Date(`${day}T12:00:00Z`).getUTCDay()]} ${time}` });
    }

    return Response.json({ error: 'action' }, { status: 400 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
