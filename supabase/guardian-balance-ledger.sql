-- 보호자 화면 우진학교외부·자율·지원금 카드 — 일자 · 시간 · 변동 · 잔여 · 메모 (2026-11-21)
-- 보호자는 충전 기록(balance_charges)을 직접 못 읽어서, 내 아이 것만 돌려주는 함수를 둔다.
-- 줄 = 충전·수정·직접 차감(balance_charges) + [결제 완료]로 확정된 수업(lesson_payments, 6만원 차감).
-- 잔여는 화면이 날짜 순으로 더하고 빼서 붙인다(처음 balance-charges.sql 의 '이전 잔액' 줄부터).
-- Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다. (balance-charges.sql 다음)

create or replace function public.my_balance_ledger(p_center text default null)
returns table (day date, kind text, amount int, memo text, at timestamptz, method text, lesson_time text)
language sql
stable
security definer
set search_path = public
as $$
  with c as (select public.my_center_child(p_center) as id)
  select b.day,
         case when b.adjust then 'adjust' when b.amount < 0 then 'use' else 'charge' end,
         b.amount, case when b.seed then '이전 잔액' else b.memo end, b.created_at, b.method, null::text
  from balance_charges b, c where b.child_id = c.id
  union all
  -- 확정된 수업 — 실제로 뺀 것(balance_deducted)만 −6만원, 예전 지원금 기록은 0
  select lp.day, 'use'::text, case when lp.balance_deducted then -60000 else 0 end, null::text,
         coalesce(lp.confirmed_at, lp.created_at), lp.method, lp.time::text
  from lesson_payments lp, c
  where lp.child_id = c.id and lp.confirmed and lp.method in ('woojin_ext', 'woojin_self', 'subsidy')
  order by 1, 5;
$$;
revoke all on function public.my_balance_ledger(text) from public, anon;
grant execute on function public.my_balance_ledger(text) to authenticated;

select 'ok' as result;
