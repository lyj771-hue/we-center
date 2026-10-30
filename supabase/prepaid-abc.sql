-- WE 소아재활센터 — 선결제를 선결제A · 선결제B · 선결제C로 나누기 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
--
-- 지금까지의 선결제(method = 'prepaid', 충전 기록, 체크, 결제 글자 '선')는 그대로 선결제A가 된다.
-- 선결제B = 'prepaid_b'(결제 글자 '비'), 선결제C = 'prepaid_c'(결제 글자 '씨')를 새로 더한다.
-- 충전 기록은 prepaid_charges.method 로 나뉘고, 아이의 충전 총 횟수도 종류마다 따로 저절로 맞춘다.

-- 1. 칸
alter table children add column if not exists prepaid_b_total int not null default 0;
alter table children add column if not exists prepaid_c_total int not null default 0;
alter table children add column if not exists uses_prepaid_b boolean not null default false;
alter table children add column if not exists uses_prepaid_c boolean not null default false;
alter table prepaid_charges add column if not exists method text not null default 'prepaid';
alter table prepaid_charges drop constraint if exists prepaid_charges_method_check;
alter table prepaid_charges add constraint prepaid_charges_method_check check (method in ('prepaid', 'prepaid_b', 'prepaid_c'));

-- 2. 충전 기록이 바뀌면 그 아이의 충전 총 횟수를 종류마다 다시 센다
create or replace function public.sync_prepaid_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_child uuid := coalesce(new.child_id, old.child_id);
begin
  update children set
    prepaid_total = greatest(0, coalesce((select sum(count) from prepaid_charges where child_id = v_child and method = 'prepaid'), 0)),
    prepaid_b_total = greatest(0, coalesce((select sum(count) from prepaid_charges where child_id = v_child and method = 'prepaid_b'), 0)),
    prepaid_c_total = greatest(0, coalesce((select sum(count) from prepaid_charges where child_id = v_child and method = 'prepaid_c'), 0))
  where id = v_child;
  if tg_op = 'UPDATE' and old.child_id <> new.child_id then
    update children set
      prepaid_total = greatest(0, coalesce((select sum(count) from prepaid_charges where child_id = old.child_id and method = 'prepaid'), 0)),
      prepaid_b_total = greatest(0, coalesce((select sum(count) from prepaid_charges where child_id = old.child_id and method = 'prepaid_b'), 0)),
      prepaid_c_total = greatest(0, coalesce((select sum(count) from prepaid_charges where child_id = old.child_id and method = 'prepaid_c'), 0))
    where id = old.child_id;
  end if;
  return null;
end;
$$;

-- 3. 결제 기록에 선결제B·C 허용
alter table lesson_payments drop constraint if exists lesson_payments_method_check;
alter table lesson_payments add constraint lesson_payments_method_check
  check (method in ('voucher', 'gusen', 'jangmatchum', 'kkumideun', 'woojin', 'woojin_ext', 'woojin_self', 'subsidy', 'prepaid', 'prepaid_b', 'prepaid_c', 'card', 'cash', 'other',
                    'voucher_retro', 'gusen_retro', 'jangmatchum_retro', 'kkumideun_retro', 'unpaid'));
alter table child_month_usage drop constraint if exists child_month_usage_method_check;
alter table child_month_usage add constraint child_month_usage_method_check
  check (method in ('voucher', 'gusen', 'jangmatchum', 'kkumideun', 'woojin', 'woojin_ext', 'woojin_self', 'subsidy', 'prepaid', 'prepaid_b', 'prepaid_c'));

-- 4. 마이페이지 — woojin-split.sql 의 함수들에 선결제B·C를 더한 것

drop function if exists public.my_child();
drop function if exists public.my_child(text);
create function public.my_child(p_center text default null)
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
  uses_subsidy boolean,
  uses_jangmatchum boolean,
  uses_woojin_ext boolean,
  uses_woojin_self boolean,
  uses_prepaid_b boolean,
  uses_prepaid_c boolean
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
         coalesce(c.uses_woojin, false), coalesce(c.uses_subsidy, false), coalesce(c.uses_jangmatchum, false),
         coalesce(c.uses_woojin_ext, false), coalesce(c.uses_woojin_self, false),
         coalesce(c.uses_prepaid_b, false), coalesce(c.uses_prepaid_c, false)
  from profiles p
  left join children c on c.id = public.my_center_child(p_center)
  where p.user_id = auth.uid();
$$;
revoke all on function public.my_child(text) from public, anon;
grant execute on function public.my_child(text) to authenticated;

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
    where lp.child_id = c.id and lp.confirmed and lp.day >= date_trunc('month', current_date)::date
      and lp.day < (date_trunc('month', current_date) + interval '1 month')::date
    group by lp.method
  ),
  manual as (
    select u.method, u.used from child_month_usage u, c where u.child_id = c.id and u.month = date_trunc('month', current_date)::date
  ),
  all_prepaid as (
    select lp.method, count(*)::int as n from lesson_payments lp, c
    where lp.child_id = c.id and lp.confirmed and lp.method in ('prepaid', 'prepaid_b', 'prepaid_c')
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
  group by lp.day, lp.method
  order by 1, 5;
$$;
revoke all on function public.my_prepaid_ledger(text) from public, anon;
grant execute on function public.my_prepaid_ledger(text) to authenticated;

select 'ok' as result;
