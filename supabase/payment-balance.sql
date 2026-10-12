-- WE 소아재활센터 — 우진학교·지원금 남은 금액 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
-- (payment-woojin-subsidy.sql 다음에 실행)
--
-- 우진학교·지원금은 횟수가 아니라 남은 금액(원)을 보여 준다. 관리자가 아이 명단에서 적는다.
-- 마이페이지 결제 현황(my_payments)의 total 칸에 우진학교·지원금은 남은 금액을 담는다.

alter table children add column if not exists woojin_balance int not null default 0;
alter table children add column if not exists subsidy_balance int not null default 0;

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
  union all select 'woojin', coalesce((select used from manual where method = 'woojin'), (select n from month_used where method = 'woojin'), 0), c.woojin_balance from c
  union all select 'subsidy', coalesce((select used from manual where method = 'subsidy'), (select n from month_used where method = 'subsidy'), 0), c.subsidy_balance from c
  union all select 'prepaid', (select n from all_prepaid), c.prepaid_total from c;
$$;
revoke all on function public.my_payments() from public, anon;
grant execute on function public.my_payments() to authenticated;

select 'ok' as result;
