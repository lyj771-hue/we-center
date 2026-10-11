-- WE 소아재활센터 — 선결제 충전 기록 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
--
-- prepaid_charges: 충전할 때마다 한 줄(날짜·횟수·메모). 아이의 prepaid_total(충전한 총 횟수)은 이 표의 합으로 자동으로 맞춘다.
-- 사용은 시간표 [결제 완료]로 확정된 선결제(lesson_payments, method = 'prepaid', confirmed)다.
-- 남은 횟수 = 충전 합 − 확정된 사용. 보호자는 my_prepaid_ledger() 로 자기 아이 카드 내역만 본다.

create table if not exists prepaid_charges (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references children (id) on delete cascade,
  day date not null default current_date,
  count int not null check (count <> 0),
  memo text,
  created_at timestamptz not null default now()
);
create index if not exists prepaid_charges_child_idx on prepaid_charges (child_id, day);
alter table prepaid_charges enable row level security;
drop policy if exists "admin all prepaid_charges" on prepaid_charges;
create policy "admin all prepaid_charges" on prepaid_charges for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 충전 기록이 바뀌면 아이의 충전 총 횟수를 다시 센다
create or replace function public.sync_prepaid_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_child uuid := coalesce(new.child_id, old.child_id);
begin
  update children set prepaid_total = greatest(0, coalesce((select sum(count) from prepaid_charges where child_id = v_child), 0))
  where id = v_child;
  if tg_op = 'UPDATE' and old.child_id <> new.child_id then
    update children set prepaid_total = greatest(0, coalesce((select sum(count) from prepaid_charges where child_id = old.child_id), 0))
    where id = old.child_id;
  end if;
  return null;
end;
$$;
drop trigger if exists prepaid_charges_sync on prepaid_charges;
create trigger prepaid_charges_sync after insert or update or delete on prepaid_charges
  for each row execute function public.sync_prepaid_total();

-- 보호자: 내 아이 선결제 카드 내역 — 충전(+)과 날짜별 사용(−)
drop function if exists public.my_prepaid_ledger();
create function public.my_prepaid_ledger()
returns table (day date, kind text, count int, memo text)
language sql
stable
security definer
set search_path = public
as $$
  with c as (select id from children where guardian_user_id = auth.uid() limit 1)
  select pc.day, 'charge'::text, pc.count, pc.memo from prepaid_charges pc, c where pc.child_id = c.id
  union all
  select lp.day, 'use'::text, count(*)::int, null from lesson_payments lp, c
  where lp.child_id = c.id and lp.method = 'prepaid' and lp.confirmed
  group by lp.day
  order by 1, 2;
$$;
revoke all on function public.my_prepaid_ledger() from public, anon;
grant execute on function public.my_prepaid_ledger() to authenticated;

select 'ok' as result;
