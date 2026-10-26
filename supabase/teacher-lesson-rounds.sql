-- WE 소아재활센터 — 선생님 시간표 보기에도 "바우처3"처럼 월 회차 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
--
-- 시간표 관리(관리자)는 화면에서 이번 달 1일~그날 수업을 읽어 아이마다 바우처·굳센·꿈이든 몇 번째인지 센다.
-- 선생님은 그 표들을 읽을 수 없어서, 같은 규칙으로 디비에서 세어 넘겨 준다.
--   · 그 칸의 수업 하나(빈타임 칸에 아이가 있으면 빈타임, 없으면 고정 칸)
--   · 결석·옮김·미정·수업 안 함, 공휴일의 요일 고정 수업, 그날 뺀 선생님 수업은 세지 않는다
--   · 결제는 고른/확정한 결제(lesson_payments), 없으면 고정 칸의 결제 글자(b·e·c)
--   · 아이 · 결제마다 그 달 날짜·시간 순으로 1, 2, 3 …
-- p_holidays — 그 달 공휴일(화면이 알려 준다. 디비엔 공휴일 표가 없다)

drop function if exists public.teacher_lesson_rounds(date, date, date[]);
create function public.teacher_lesson_rounds(p_from date, p_to date, p_holidays date[] default '{}')
returns table (day date, lesson_time text, teacher_id uuid, side text, method text, n int)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not (public.is_teacher() or public.is_admin()) then
    raise exception 'not allowed';
  end if;
  if p_to - p_from > 40 then
    raise exception 'too long';
  end if;
  return query
  with l as (
    select * from public.lessons_between(date_trunc('month', p_from)::date, p_to)
  ),
  eff as (   -- 칸마다 수업 하나 — 빈타임 칸 아이가 먼저
    select distinct on (l.day, l.center, l.teacher_id, l.lesson_time) l.*
    from l
    where l.status in ('child', 'cancel_requested') and not l.moved and not l.absent and l.child_id is not null
      and not (l.source = 'fixed' and l.day = any(p_holidays))
      and not exists (select 1 from teacher_day_assign a where a.day = l.day and a.center = l.center and a.teacher_id = l.teacher_id and a.off)
    order by l.day, l.center, l.teacher_id, l.lesson_time, (l.side = 'open') desc
  ),
  m as (
    select e.day, e.lesson_time, e.teacher_id, e.side, e.child_id,
           coalesce(lp.method, case when e.side = 'fixed' then
             case substring(regexp_replace(lower(coalesce(e.payment, '')), '[^bec]', '', 'g') from 1 for 1)
               when 'b' then 'voucher' when 'e' then 'gusen' when 'c' then 'kkumideun' end end) as method
    from eff e
    left join lesson_payments lp on lp.child_id = e.child_id and lp.day = e.day and lp.time = e.lesson_time
  ),
  r as (
    select m.*, row_number() over (partition by m.child_id, m.method order by m.day, m.lesson_time)::int as n
    from m where m.method in ('voucher', 'gusen', 'kkumideun')
  )
  select r.day, r.lesson_time, r.teacher_id, r.side, r.method, r.n from r where r.day between p_from and p_to;
end;
$$;
revoke all on function public.teacher_lesson_rounds(date, date, date[]) from public, anon;
grant execute on function public.teacher_lesson_rounds(date, date, date[]) to authenticated;

select 'ok' as result;
