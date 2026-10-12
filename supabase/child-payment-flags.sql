-- WE 소아재활센터 — 아이마다 쓰는 결제(체크) + 이번 달 사용 횟수 직접 적기 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
-- (payments-confirm.sql · drop-child-payment.sql 다음에 실행)
--
-- children.uses_*: 바우처·굳센·꿈이든·선결제를 쓰는 아이인지 (아이 명단 체크박스)
-- child_month_usage: 그 달 사용 횟수를 관리자가 직접 적은 값. 있으면 [결제 완료]로 센 횟수 대신 이 값을 쓴다.

alter table children add column if not exists uses_voucher boolean not null default false;
alter table children add column if not exists uses_gusen boolean not null default false;
alter table children add column if not exists uses_kkumideun boolean not null default false;
alter table children add column if not exists uses_prepaid boolean not null default false;

-- 처음 한 번: 회원 관리에서 보호자에게 체크해 둔 지원 항목·선결제 충전을 아이에게 옮긴다(이미 켠 건 그대로)
update children c set
  uses_voucher = c.uses_voucher or coalesce(p.voucher, false),
  uses_gusen = c.uses_gusen or coalesce(p.gusen, false),
  uses_kkumideun = c.uses_kkumideun or coalesce(p.kkumideun, false)
from profiles p where p.user_id = c.guardian_user_id;
update children set uses_prepaid = true where prepaid_total > 0 and not uses_prepaid;

create table if not exists child_month_usage (
  child_id uuid not null references children (id) on delete cascade,
  month date not null,                                   -- 그 달 1일
  method text not null check (method in ('voucher', 'gusen', 'kkumideun', 'prepaid')),
  used int not null check (used >= 0),
  updated_at timestamptz not null default now(),
  primary key (child_id, month, method)
);
alter table child_month_usage enable row level security;
drop policy if exists "admin all child_month_usage" on child_month_usage;
create policy "admin all child_month_usage" on child_month_usage for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 마이페이지: 아이 정보에 쓰는 결제 체크를 더한다
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
  uses_prepaid boolean
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
         coalesce(c.uses_voucher, false), coalesce(c.uses_gusen, false), coalesce(c.uses_kkumideun, false), coalesce(c.uses_prepaid, false)
  from profiles p
  left join children c on c.guardian_user_id = p.user_id
  where p.user_id = auth.uid();
$$;
revoke all on function public.my_child() from public, anon;
grant execute on function public.my_child() to authenticated;

-- 마이페이지 결제 현황: 이번 달 사용 횟수는 관리자가 적은 값이 있으면 그 값
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
  union all select 'prepaid', (select n from all_prepaid), c.prepaid_total from c;
$$;
revoke all on function public.my_payments() from public, anon;
grant execute on function public.my_payments() to authenticated;

select 'ok' as result;
