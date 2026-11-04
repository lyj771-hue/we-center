-- WE 소아재활센터 — 우진학교외부·자율·지원금 충전·수정 기록 (2026-11)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다. (balance-detail.sql 다음에 실행)
--
-- balance_charges: 남은 금액을 늘리거나 고칠 때마다 한 줄(날짜·금액·메모). adjust = 아이 명단·승인에서 남은 금액을 직접 고친 것(± 차이).
-- 한 줄이 들어가면 아이의 남은 금액(woojin_ext_balance · woojin_self_balance · subsidy_balance)에 그 금액을 더하고, 지우면 뺀다.
-- 차감은 지금처럼 [결제 완료] 확정마다 6만원(lesson_payments.balance_deducted).
-- 처음 실행할 때 지금 남은 금액 + 이미 차감된 금액을 '이전 잔액'(seed) 한 줄로 넣어, 상세보기의 잔여금액이 지금 남은 금액과 맞게 한다.

-- 1. 표
create table if not exists balance_charges (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references children (id) on delete cascade,
  method text not null check (method in ('woojin_ext', 'woojin_self', 'subsidy')),
  day date not null default current_date,
  amount int not null check (amount <> 0),
  memo text,
  adjust boolean not null default false,
  seed boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists balance_charges_child_idx on balance_charges (child_id, method, day);
alter table balance_charges enable row level security;
drop policy if exists "admin all balance_charges" on balance_charges;
create policy "admin all balance_charges" on balance_charges for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 2. 이전 잔액 — 트리거를 떼고 넣어서 남은 금액은 그대로 둔다. 기록이 이미 있는 아이·종류는 건너뛴다
drop trigger if exists balance_charges_apply on balance_charges;
insert into balance_charges (child_id, method, day, amount, memo, seed)
select c.id, k.method,
       coalesce((select min(lp.day) from lesson_payments lp where lp.child_id = c.id and lp.method = k.method and lp.balance_deducted), date '2026-11-01'),
       k.balance + 60000 * (select count(*) from lesson_payments lp where lp.child_id = c.id and lp.method = k.method and lp.balance_deducted)::int,
       '이전 잔액', true
from children c
cross join lateral (values ('woojin_ext', c.woojin_ext_balance), ('woojin_self', c.woojin_self_balance), ('subsidy', c.subsidy_balance)) as k(method, balance)
where k.balance + 60000 * (select count(*) from lesson_payments lp where lp.child_id = c.id and lp.method = k.method and lp.balance_deducted) <> 0
  and not exists (select 1 from balance_charges b where b.child_id = c.id and b.method = k.method);

-- 3. 기록이 들어가거나 지워지면 남은 금액을 바꾼다
create or replace function public.balance_charge_apply()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    execute format('update children set %1$I = %1$I - $2 where id = $1', old.method || '_balance') using old.child_id, old.amount;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    execute format('update children set %1$I = %1$I + $2 where id = $1', new.method || '_balance') using new.child_id, new.amount;
  end if;
  return null;
end;
$$;
create trigger balance_charges_apply
  after insert or update or delete on balance_charges
  for each row execute function public.balance_charge_apply();

select 'ok' as result, (select count(*) from balance_charges where seed) as 이전잔액_줄수;
