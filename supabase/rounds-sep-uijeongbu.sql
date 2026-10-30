-- WE 소아재활센터 — 2026년 9월 의정부 이원재 선생님 수업을 선생님 시간표 월 회차에서 빼기 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
-- (payment-retro.sql 의 teacher_lesson_rounds 와 같고 이 조건만 더했다. 기록은 지우지 않는다)

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
      and not (l.center = 'uijeongbu' and l.day between date '2026-09-01' and date '2026-09-30'
               and l.teacher_id in (select t.id from teachers t where t.name = '이원재'))
      and not exists (select 1 from teacher_day_assign a where a.day = l.day and a.center = l.center and a.teacher_id = l.teacher_id and a.off)
    order by l.day, l.center, l.teacher_id, l.lesson_time, (l.side = 'open') desc
  ),
  m as (
    select e.day, e.lesson_time, e.teacher_id, e.side, e.child_id,
           coalesce(case lp.method when 'voucher_retro' then 'voucher' when 'gusen_retro' then 'gusen'
                      when 'jangmatchum_retro' then 'jangmatchum' when 'kkumideun_retro' then 'kkumideun' else lp.method end,
             case when e.side = 'fixed' then
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
