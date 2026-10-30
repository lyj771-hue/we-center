-- WE 소아재활센터 — 이원재 선생님 수업은 날짜·지점 상관없이 모든 횟수에서 빼기 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
-- (prepaid-abc.sql 다음에 실행. rounds-sep-uijeongbu.sql 은 9월만 빼는 것이라 이 파일로 대신한다 — 그 파일은 다시 실행하지 않는다)
--
-- 마이페이지 결제 현황·바우처 등 카드·선결제 카드, 선생님 시간표 회차에서 뺀다. 기록은 지우지 않고, 시간표에는 그대로 보인다.
-- 복직하면 이 조건을 빼야 한다(src/lib/timetable.ts 의 COUNT_EXCLUDE 도 함께).

drop function if exists public.my_payment_history();
create function public.my_payment_history()
returns table (day date, method text, lesson_time text, teacher_name text, note text, at timestamptz, center text)
language sql
stable
security definer
set search_path = public
as $$
  select lp.day, lp.method, lp.time, t.name, lp.note, lp.created_at, coalesce(lp.center, 'eunpyeong')
  from lesson_payments lp
  left join teachers t on t.id = lp.teacher_id
  where lp.child_id in (select c.id from children c where c.guardian_user_id = auth.uid())
    and lp.confirmed
    and not exists (select 1 from teachers x where x.id = lp.teacher_id and x.name = '이원재')
    and lp.method in ('voucher', 'gusen', 'jangmatchum', 'kkumideun', 'subsidy', 'woojin', 'woojin_ext', 'woojin_self')
  order by lp.day, lp.time;
$$;
revoke all on function public.my_payment_history() from public, anon;
grant execute on function public.my_payment_history() to authenticated;

drop function if exists public.my_payments();
drop function if exists public.my_payments(text);
create function public.my_payments(p_center text default null)
returns table (method text, used int, total int)
language sql
stable
security definer
set search_path = public
as $$
  with c as (select * from children where id = public.my_center_child(p_center)),
  month_used as (
    select lp.method, count(*)::int as n from lesson_payments lp, c
    where lp.child_id = c.id and lp.confirmed and not exists (select 1 from teachers x where x.id = lp.teacher_id and x.name = '이원재') and lp.day >= date_trunc('month', current_date)::date
      and lp.day < (date_trunc('month', current_date) + interval '1 month')::date
    group by lp.method
  ),
  manual as (
    select u.method, u.used from child_month_usage u, c where u.child_id = c.id and u.month = date_trunc('month', current_date)::date
  ),
  all_prepaid as (
    select lp.method, count(*)::int as n from lesson_payments lp, c
    where lp.child_id = c.id and lp.confirmed and not exists (select 1 from teachers x where x.id = lp.teacher_id and x.name = '이원재') and lp.method in ('prepaid', 'prepaid_b', 'prepaid_c')
    group by lp.method
  )
  select 'voucher', coalesce((select used from manual where method = 'voucher'), (select n from month_used where method = 'voucher'), 0), c.voucher_limit from c
  union all select 'gusen', coalesce((select used from manual where method = 'gusen'), (select n from month_used where method = 'gusen'), 0), c.gusen_limit from c
  union all select 'jangmatchum', coalesce((select used from manual where method = 'jangmatchum'), (select n from month_used where method = 'jangmatchum'), 0), 8 from c
  union all select 'kkumideun', coalesce((select used from manual where method = 'kkumideun'), (select n from month_used where method = 'kkumideun'), 0), c.kkumideun_limit from c
  union all select 'woojin_ext', coalesce((select n from month_used where method = 'woojin_ext'), 0), c.woojin_ext_balance from c
  union all select 'woojin_self', coalesce((select n from month_used where method = 'woojin_self'), 0), c.woojin_self_balance from c
  union all select 'subsidy', coalesce((select used from manual where method = 'subsidy'), (select n from month_used where method = 'subsidy'), 0), c.subsidy_balance from c
  union all select 'prepaid', coalesce((select n from all_prepaid where method = 'prepaid'), 0), c.prepaid_total from c
  union all select 'prepaid_b', coalesce((select n from all_prepaid where method = 'prepaid_b'), 0), c.prepaid_b_total from c
  union all select 'prepaid_c', coalesce((select n from all_prepaid where method = 'prepaid_c'), 0), c.prepaid_c_total from c;
$$;
revoke all on function public.my_payments(text) from public, anon;
grant execute on function public.my_payments(text) to authenticated;

drop function if exists public.my_prepaid_ledger();
drop function if exists public.my_prepaid_ledger(text);
create function public.my_prepaid_ledger(p_center text default null)
returns table (day date, kind text, count int, memo text, at timestamptz, method text)
language sql
stable
security definer
set search_path = public
as $$
  with c as (select public.my_center_child(p_center) as id)
  select pc.day, case when pc.adjust then 'adjust' else 'charge' end, pc.count, pc.memo, pc.created_at, pc.method from prepaid_charges pc, c where pc.child_id = c.id
  union all
  select lp.day, 'use'::text, count(*)::int, null, max(lp.created_at), lp.method from lesson_payments lp, c
  where lp.child_id = c.id and lp.method in ('prepaid', 'prepaid_b', 'prepaid_c') and lp.confirmed
    and not exists (select 1 from teachers x where x.id = lp.teacher_id and x.name = '이원재')
  group by lp.day, lp.method
  order by 1, 5;
$$;
revoke all on function public.my_prepaid_ledger(text) from public, anon;
grant execute on function public.my_prepaid_ledger(text) to authenticated;

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
      and l.teacher_id not in (select t.id from teachers t where t.name = '이원재')
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
