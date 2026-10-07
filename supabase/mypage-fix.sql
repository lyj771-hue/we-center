-- 마이페이지 my_lessons 고침 (칸 이름 겹침) — SQL Editor 에서 Run
drop function if exists public.my_lessons(date, date);
-- 보호자: 내 아이 수업만 (한 번에 최대 100일)
create function public.my_lessons(p_from date, p_to date)
returns table (
  day date,
  lesson_time text,                          -- "time" 은 SQL 예약어라 이름을 바꿨다
  teacher_id uuid,
  teacher_name text,
  side text,
  source text,
  status text,
  child_id uuid,
  name text,
  guardian_user_id uuid,
  guardian_nickname text,
  center_nickname text,
  payment text,
  oral boolean,
  absent boolean,
  moved boolean,
  note text,
  booked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_child uuid;
begin
  if p_to - p_from > 100 then
    raise exception 'too long';
  end if;
  select id into v_child from children where guardian_user_id = auth.uid();
  return query
    select * from public.lessons_between(p_from, p_to) l
    where (v_child is not null and l.child_id = v_child) or l.guardian_user_id = auth.uid();
end;
$$;
revoke all on function public.my_lessons(date, date) from public, anon;
grant execute on function public.my_lessons(date, date) to authenticated;
select 'ok' as result;
