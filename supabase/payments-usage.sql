-- WE 소아재활센터 — 결제 사용 현황을 디비에서 바로 보기 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
-- (payments-confirm.sql 을 먼저 실행해야 한다 — confirmed 칸을 쓴다)
--
-- 결제 기록(lesson_payments)에서 [결제 완료]로 확정된 것만 세어 보여 주는 표(view) 두 개.
-- 기록에서 바로 계산하니 따로 맞출 필요가 없고, 달이 바뀌면(매월 1일) 새 달 줄이 0부터 시작한다.
-- Supabase → Table Editor 에서 표처럼 볼 수 있다(관리자만 — 원래 표의 권한을 그대로 따른다).
--
--   child_payment_monthly  아이·달마다 바우처·굳센·꿈이든 사용 횟수와 한 달 제공 횟수
--   child_prepaid_balance  아이마다 선결제 충전·사용·남은 횟수

create or replace view public.child_payment_monthly with (security_invoker = true) as
select
  c.id as child_id,
  c.member_code,
  c.name,
  date_trunc('month', lp.day)::date as month,
  count(*) filter (where lp.method = 'voucher')::int as voucher_used,
  c.voucher_limit,
  count(*) filter (where lp.method = 'gusen')::int as gusen_used,
  c.gusen_limit,
  count(*) filter (where lp.method = 'kkumideun')::int as kkumideun_used,
  c.kkumideun_limit
from lesson_payments lp
join children c on c.id = lp.child_id
where lp.confirmed and lp.method in ('voucher', 'gusen', 'kkumideun')
group by c.id, c.member_code, c.name, date_trunc('month', lp.day), c.voucher_limit, c.gusen_limit, c.kkumideun_limit;

create or replace view public.child_prepaid_balance with (security_invoker = true) as
select
  c.id as child_id,
  c.member_code,
  c.name,
  c.prepaid_total,
  coalesce(u.used, 0) as prepaid_used,
  c.prepaid_total - coalesce(u.used, 0) as prepaid_remaining
from children c
left join (
  select child_id, count(*)::int as used from lesson_payments where confirmed and method = 'prepaid' group by child_id
) u on u.child_id = c.id
where c.prepaid_total > 0 or u.used > 0;

revoke all on public.child_payment_monthly, public.child_prepaid_balance from anon;
grant select on public.child_payment_monthly, public.child_prepaid_balance to authenticated;

select 'ok' as result;
