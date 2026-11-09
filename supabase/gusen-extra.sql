-- WE 소아재활센터 — 굳센 3회차 추가금액 (굳센3회차완납) (2026-11-09)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
--
-- 굳센은 3회차에 추가금액을 받는다. 결제방식은 그대로 'gusen'(횟수도 굳센으로 센다)이고,
-- 관리자가 [굳센3회차완납]을 고르면 extra_paid = true 로 남는다. 아니면 시간표에 '굳센3회차미납'(빨강).

alter table lesson_payments add column if not exists extra_paid boolean not null default false;
