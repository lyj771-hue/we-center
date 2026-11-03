-- WE 소아재활센터 — 우진학교외부·자율·지원금 상세보기(날짜·선생님·횟수·차감금액·잔여금액) + 지원금도 6만원씩 자동 차감 (2026-11-03)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다. (woojin-split.sql 다음에 실행)
--
-- 1. 결제 기록(lesson_payments)에 balance_deducted 칸 — 그 수업으로 남은 금액에서 6만원을 뺐는지. 상세보기의 차감금액이 이 칸을 본다.
--    지금까지 확정된 우진학교외부·자율은 이미 6만원씩 빠졌으므로 true. 지금까지 확정된 지원금은 빠진 적이 없으므로 false(차감 0원으로 보인다).
-- 2. 지원금도 [결제 완료]로 확정될 때마다 6만원씩 빠지고, 확정을 풀거나 결제방식을 바꾸거나 지우면 되돌린다.
--    되돌릴 때는 실제로 뺀 기록(balance_deducted)만 되돌린다 — 예전 지원금 기록의 확정을 풀어도 금액이 늘지 않는다.

-- 1. 칸
alter table lesson_payments add column if not exists balance_deducted boolean not null default false;

-- 예전 트리거(woojin-split.sql)를 먼저 떼어 아래 채우기가 금액을 건드리지 않게
drop trigger if exists lesson_payments_woojin_balance on lesson_payments;
update lesson_payments set balance_deducted = true where confirmed and method in ('woojin_ext', 'woojin_self') and not balance_deducted;

-- 2. 저장되기 전에 balance_deducted 를 적고(확정된 우진학교외부·자율·지원금이면 true),
--    저장된 뒤에 남은 금액을 바꾼다. 금액은 after 트리거에서만 — upsert 가 충돌해 update 가 되면 before insert 도 돌기 때문에
create or replace function public.balance_mark()
returns trigger
language plpgsql
as $$
begin
  new.balance_deducted := new.confirmed and new.method in ('woojin_ext', 'woojin_self', 'subsidy');
  return new;
end;
$$;
drop trigger if exists lesson_payments_balance_mark on lesson_payments;
create trigger lesson_payments_balance_mark
  before insert or update on lesson_payments
  for each row execute function public.balance_mark();

create or replace function public.balance_apply()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.balance_deducted then
    execute format('update children set %1$I = %1$I + 60000 where id = $1', old.method || '_balance') using old.child_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.balance_deducted then
    execute format('update children set %1$I = %1$I - 60000 where id = $1', new.method || '_balance') using new.child_id;
  end if;
  return null;
end;
$$;
drop trigger if exists lesson_payments_balance on lesson_payments;
create trigger lesson_payments_balance
  after insert or update or delete on lesson_payments
  for each row execute function public.balance_apply();
drop function if exists public.woojin_balance_apply();
