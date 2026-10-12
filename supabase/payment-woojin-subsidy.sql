-- WE 소아재활센터 — 결제 항목에 우진학교·지원금 더하기 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
-- (child-payment-flags.sql 다음에 실행)
--
-- 아이 명단 체크(uses_woojin·uses_subsidy), 시간표 결제방식(woojin·subsidy), 이번 달 사용 횟수, 마이페이지 결제 현황.

alter table children add column if not exists uses_woojin boolean not null default false;
alter table children add column if not exists uses_subsidy boolean not null default false;
update children c set
  uses_woojin = c.uses_woojin or coalesce(p.woojin, false),
  uses_subsidy = c.uses_subsidy or coalesce(p.subsidy, false)
from profiles p where p.user_id = c.guardian_user_id;

alter table lesson_payments drop constraint if exists lesson_payments_method_check;
alter table lesson_payments add constraint lesson_payments_method_check
  check (method in ('voucher', 'gusen', 'kkumideun', 'woojin', 'subsidy', 'prepaid', 'card', 'cash', 'other'));

alter table child_month_usage drop constraint if exists child_month_usage_method_check;
alter table child_month_usage add constraint child_month_usage_method_check
  check (method in ('voucher', 'gusen', 'kkumideun', 'woojin', 'subsidy', 'prepaid'));

drop function if exists public.my_child();
create function public.my_child()
returns table (
  member_code text,
  child_name text,
  child_number int,
  payment text,
  oral boolean,
  voucher boolean,
  gusen boolean,
  kkumideun boolean,
  woojin boolean,
  subsidy boolean,
  prepaid_eunpyeong int,
  prepaid_uijeongbu int,
  uses_voucher boolean,
  uses_gusen boolean,
  uses_kkumideun boolean,
  uses_prepaid boolean,
  uses_woojin boolean,
  uses_subsidy boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select c.member_code, c.name, c.number, ''::text, c.oral,
         coalesce(p.voucher, false), coalesce(p.gusen, false), coalesce(p.kkumideun, false),
         coalesce(p.woojin, false), coalesce(p.subsidy, false),
         coalesce(p.prepaid_eunpyeong, 0), coalesce(p.prepaid_uijeongbu, 0),
         coalesce(c.uses_voucher, false), coalesce(c.uses_gusen, false), coalesce(c.uses_kkumideun, false), coalesce(c.uses_prepaid, false),
         coalesce(c.uses_woojin, false), coalesce(c.uses_subsidy, false)
  from profiles p
  left join children c on c.guardian_user_id = p.user_id
  where p.user_id = auth.uid();
$$;
revoke all on function public.my_child() from public, anon;
grant execute on function public.my_child() to authenticated;

drop function if exists public.my_payments();
create function public.my_payments()
returns table (method text, used int, total int)
language sql
stable
security definer
set search_path = public
as $$
  with c as (select * from children where guardian_user_id = auth.uid() limit 1),
  month_used as (
    select lp.method, count(*)::int as n from lesson_payments lp, c
    where lp.child_id = c.id and lp.confirmed and lp.day >= date_trunc('month', current_date)::date
      and lp.day < (date_trunc('month', current_date) + interval '1 month')::date
    group by lp.method
  ),
  manual as (
    select u.method, u.used from child_month_usage u, c where u.child_id = c.id and u.month = date_trunc('month', current_date)::date
  ),
  all_prepaid as (
    select count(*)::int as n from lesson_payments lp, c where lp.child_id = c.id and lp.confirmed and lp.method = 'prepaid'
  )
  select 'voucher', coalesce((select used from manual where method = 'voucher'), (select n from month_used where method = 'voucher'), 0), c.voucher_limit from c
  union all select 'gusen', coalesce((select used from manual where method = 'gusen'), (select n from month_used where method = 'gusen'), 0), c.gusen_limit from c
  union all select 'kkumideun', coalesce((select used from manual where method = 'kkumideun'), (select n from month_used where method = 'kkumideun'), 0), c.kkumideun_limit from c
  union all select 'woojin', coalesce((select used from manual where method = 'woojin'), (select n from month_used where method = 'woojin'), 0), 0 from c
  union all select 'subsidy', coalesce((select used from manual where method = 'subsidy'), (select n from month_used where method = 'subsidy'), 0), 0 from c
  union all select 'prepaid', (select n from all_prepaid), c.prepaid_total from c;
$$;
revoke all on function public.my_payments() from public, anon;
grant execute on function public.my_payments() to authenticated;

select 'ok' as result;
