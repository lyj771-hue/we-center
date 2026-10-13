-- WE 소아재활센터 — 두 센터를 다니는 아이: 보호자 계정 하나에 센터마다 아이 한 명씩 잇기 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
--
-- 아이 명단은 센터마다 따로라서(수색 김유담 / 의정부 김유담) 두 센터를 다니면 아이가 둘이다.
-- 지금까지는 계정 하나에 아이 한 명만 이어서, 마이페이지에 다른 센터 수업·결제 기록이 안 나왔다.
-- 마이페이지 수업(my_lessons)과 결제 기록(my_payment_history)이 계정에 이어진 아이 모두를 보게 바꾸고,
-- 내 아이 정보·결제 현황·선결제 카드(my_child·my_payments·my_prepaid_ledger)는 지점마다 그 지점 아이 것으로 본다(선결제는 지점마다 따로).

-- 우진학교·지원금 남은 금액 칸 (payment-balance.sql 과 같은 것 — 아직 안 돌렸어도 되게)
alter table children add column if not exists woojin_balance int not null default 0;
alter table children add column if not exists subsidy_balance int not null default 0;

drop function if exists public.my_lessons(date, date);
create function public.my_lessons(p_from date, p_to date)
returns table (
  day date,
  lesson_time text,
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
  booked_at timestamptz,
  center text
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if p_to - p_from > 100 then
    raise exception 'too long';
  end if;
  return query
    select * from public.lessons_between(p_from, p_to) l
    where l.child_id in (select c.id from children c where c.guardian_user_id = auth.uid())
       or l.guardian_user_id = auth.uid();
end;
$$;
revoke all on function public.my_lessons(date, date) from public, anon;
grant execute on function public.my_lessons(date, date) to authenticated;

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
    and lp.method in ('voucher', 'gusen', 'kkumideun', 'subsidy', 'woojin')
  order by lp.day, lp.time;
$$;
revoke all on function public.my_payment_history() from public, anon;
grant execute on function public.my_payment_history() to authenticated;

-- ── 지점별 마이페이지 — 내 아이 정보·결제 현황·선결제 카드를 지점(p_center)의 아이 것으로 ──
-- p_center 를 안 주면 처음 가입한 지점의 아이(없으면 아무 아이)

-- 계정에 이어진 아이들이 다니는 지점 — 마이페이지 지점 버튼
drop function if exists public.my_child_centers();
create function public.my_child_centers()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select distinct coalesce(c.center, 'eunpyeong') from children c where c.guardian_user_id = auth.uid();
$$;
revoke all on function public.my_child_centers() from public, anon;
grant execute on function public.my_child_centers() to authenticated;

-- 지점의 내 아이 하나
create or replace function public.my_center_child(p_center text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.id from children c
  left join profiles p on p.user_id = auth.uid()
  where c.guardian_user_id = auth.uid()
    and (p_center is null or c.center = p_center)
  order by (c.center = coalesce(p.center, 'eunpyeong')) desc, c.id
  limit 1;
$$;
revoke all on function public.my_center_child(text) from public, anon;
grant execute on function public.my_center_child(text) to authenticated;

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
    select count(*)::int as n from lesson_payments lp, c where lp.child_id = c.id and lp.confirmed and lp.method = 'prepaid'
  )
  select 'voucher', coalesce((select used from manual where method = 'voucher'), (select n from month_used where method = 'voucher'), 0), c.voucher_limit from c
  union all select 'gusen', coalesce((select used from manual where method = 'gusen'), (select n from month_used where method = 'gusen'), 0), c.gusen_limit from c
  union all select 'kkumideun', coalesce((select used from manual where method = 'kkumideun'), (select n from month_used where method = 'kkumideun'), 0), c.kkumideun_limit from c
  union all select 'woojin', coalesce((select used from manual where method = 'woojin'), (select n from month_used where method = 'woojin'), 0), c.woojin_balance from c
  union all select 'subsidy', coalesce((select used from manual where method = 'subsidy'), (select n from month_used where method = 'subsidy'), 0), c.subsidy_balance from c
  union all select 'prepaid', (select n from all_prepaid), c.prepaid_total from c;
$$;
revoke all on function public.my_payments(text) from public, anon;
grant execute on function public.my_payments(text) to authenticated;

drop function if exists public.my_prepaid_ledger();
drop function if exists public.my_prepaid_ledger(text);
create function public.my_prepaid_ledger(p_center text default null)
returns table (day date, kind text, count int, memo text, at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  with c as (select public.my_center_child(p_center) as id)
  select pc.day, case when pc.adjust then 'adjust' else 'charge' end, pc.count, pc.memo, pc.created_at from prepaid_charges pc, c where pc.child_id = c.id
  union all
  select lp.day, 'use'::text, count(*)::int, null, max(lp.created_at) from lesson_payments lp, c
  where lp.child_id = c.id and lp.method = 'prepaid' and lp.confirmed
  group by lp.day
  order by 1, 5;
$$;
revoke all on function public.my_prepaid_ledger(text) from public, anon;
grant execute on function public.my_prepaid_ledger(text) to authenticated;

select 'ok' as result;
