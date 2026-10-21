-- WE 소아재활센터 — 선생님 시간표 보기에 결제방식 칸 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
--
-- teacher_lessons(teacher-login.sql)에 결제방식을 더한다 — 빈타임 오른쪽 "결제" 칸.
--   payment      칸의 결제 글자(b·e·장·c …) = 기본 결제
--   pay_method   시간표 관리에서 고른/확정한 결제 (lesson_payments)
--   pay_note     직접 작성한 결제
--   pay_confirmed [결제 완료]로 확정됐는지

drop function if exists public.teacher_lessons(date, date);
create function public.teacher_lessons(p_from date, p_to date)
returns table (
  day date,
  lesson_time text,
  teacher_id uuid,
  side text,
  source text,
  status text,
  name text,
  child_number int,
  absent boolean,
  moved boolean,
  note text,
  center text,
  payment text,
  pay_method text,
  pay_note text,
  pay_confirmed boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.is_teacher() or public.is_admin()) then
    raise exception 'not allowed';
  end if;
  if p_to - p_from > 40 then
    raise exception 'too long';
  end if;
  return query
    select l.day, l.lesson_time, l.teacher_id, l.side, l.source, l.status, l.name, c.number, l.absent, l.moved, l.note, l.center,
           l.payment, lp.method, lp.note, lp.confirmed
    from public.lessons_between(p_from, p_to) l
    left join children c on c.id = l.child_id
    left join lesson_payments lp on lp.child_id = l.child_id and lp.day = l.day and lp.time = l.lesson_time;
end;
$$;
revoke all on function public.teacher_lessons(date, date) from public, anon;
grant execute on function public.teacher_lessons(date, date) to authenticated;
