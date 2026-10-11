-- WE 소아재활센터 — 선결제 카드 내역을 넣은 시각 순서로 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
-- (prepaid-charges.sql 다음에 실행)
--
-- 같은 날 충전·차감이 여러 번이면 넣은 시각(at) 순서로 보여 준다. 사용(결제 완료)은 그날 마지막 확정 시각.
-- [수정] = 남은 횟수를 직접 맞춘 기록(adjust = true, count = 맞추느라 더하거나 뺀 횟수).

alter table prepaid_charges add column if not exists adjust boolean not null default false;

drop function if exists public.my_prepaid_ledger();
create function public.my_prepaid_ledger()
returns table (day date, kind text, count int, memo text, at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  with c as (select id from children where guardian_user_id = auth.uid() limit 1)
  select pc.day, case when pc.adjust then 'adjust' else 'charge' end, pc.count, pc.memo, pc.created_at from prepaid_charges pc, c where pc.child_id = c.id
  union all
  select lp.day, 'use'::text, count(*)::int, null, max(lp.created_at) from lesson_payments lp, c
  where lp.child_id = c.id and lp.method = 'prepaid' and lp.confirmed
  group by lp.day
  order by 1, 5;
$$;
revoke all on function public.my_prepaid_ledger() from public, anon;
grant execute on function public.my_prepaid_ledger() to authenticated;

select 'ok' as result;
