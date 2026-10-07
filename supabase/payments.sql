-- WE 소아재활센터 — 결제 현황 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
--
-- 아이마다: 바우처·굳센·꿈이든 한 달 제공 횟수, 선결제(차감) 충전 횟수
-- 수업마다: 수업이 끝나면 관리자가 어떤 결제로 했는지 체크 (lesson_payments)
-- 바우처·굳센·꿈이든 = 이번 달 체크 수 / 한 달 제공 횟수 (매달 새로)
-- 차감(선결제)       = 지금까지 체크 수 / 지금까지 충전한 횟수

-- 1. 아이마다 제공·충전 횟수 (0 이면 그 결제를 쓰지 않음)
alter table children add column if not exists voucher_limit int not null default 0;
alter table children add column if not exists gusen_limit int not null default 0;
alter table children add column if not exists kkumideun_limit int not null default 0;
alter table children add column if not exists prepaid_total int not null default 0;

-- 2. 수업 결제 체크 — 아이·날짜·시간·선생님마다 하나
create table if not exists lesson_payments (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references children (id) on delete cascade,
  day date not null,
  time text not null,
  teacher_id uuid references teachers (id) on delete set null,
  center text not null default 'eunpyeong',
  method text not null check (method in ('voucher', 'gusen', 'kkumideun', 'prepaid', 'other')),
  created_at timestamptz not null default now(),
  unique (child_id, day, time)
);
create index if not exists lesson_payments_child_day_idx on lesson_payments (child_id, day);
alter table lesson_payments enable row level security;
drop policy if exists "admin all lesson_payments" on lesson_payments;
create policy "admin all lesson_payments" on lesson_payments for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 3. 마이페이지 — 내 아이 결제 현황 (이번 달 바우처·굳센·꿈이든, 누적 차감)
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
    where lp.child_id = c.id and lp.day >= date_trunc('month', current_date)::date
      and lp.day < (date_trunc('month', current_date) + interval '1 month')::date
    group by lp.method
  ),
  all_prepaid as (
    select count(*)::int as n from lesson_payments lp, c where lp.child_id = c.id and lp.method = 'prepaid'
  )
  select 'voucher', coalesce((select n from month_used where method = 'voucher'), 0), c.voucher_limit from c
  union all select 'gusen', coalesce((select n from month_used where method = 'gusen'), 0), c.gusen_limit from c
  union all select 'kkumideun', coalesce((select n from month_used where method = 'kkumideun'), 0), c.kkumideun_limit from c
  union all select 'prepaid', (select n from all_prepaid), c.prepaid_total from c;
$$;
revoke all on function public.my_payments() from public, anon;
grant execute on function public.my_payments() to authenticated;

select 'ok' as result;
