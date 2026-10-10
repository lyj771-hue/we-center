-- WE 소아재활센터 — 결제방식 "선택"과 "확정" 나누기 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
--
-- 시간표에서 결제방식을 고르고 [스케줄 변경 완료] = 선택(confirmed = false), [결제 완료] = 확정(confirmed = true).
-- 지금까지 저장된 결제는 모두 [결제 완료]로 저장된 것이라 확정으로 둔다. 남은 횟수·마이페이지는 확정만 센다.

alter table lesson_payments add column if not exists confirmed boolean not null default true;
alter table lesson_payments alter column confirmed set default false;

-- 마이페이지 결제 현황 — 확정된 결제만
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
  all_prepaid as (
    select count(*)::int as n from lesson_payments lp, c where lp.child_id = c.id and lp.confirmed and lp.method = 'prepaid'
  )
  select 'voucher', coalesce((select n from month_used where method = 'voucher'), 0), c.voucher_limit from c
  union all select 'gusen', coalesce((select n from month_used where method = 'gusen'), 0), c.gusen_limit from c
  union all select 'kkumideun', coalesce((select n from month_used where method = 'kkumideun'), 0), c.kkumideun_limit from c
  union all select 'prepaid', (select n from all_prepaid), c.prepaid_total from c;
$$;
revoke all on function public.my_payments() from public, anon;
grant execute on function public.my_payments() to authenticated;

select 'ok' as result;
