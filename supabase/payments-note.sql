-- WE 소아재활센터 — 결제 체크에 "직접 작성", 신용카드·현금 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
--
-- 결제방식을 직접 적으면 method = 'other' 이고 적은 글은 note 에 둔다.
-- 결제방식에 신용카드(card)·현금(cash)을 더한다.

alter table lesson_payments add column if not exists note text;

alter table lesson_payments drop constraint if exists lesson_payments_method_check;
alter table lesson_payments add constraint lesson_payments_method_check
  check (method in ('voucher', 'gusen', 'kkumideun', 'prepaid', 'card', 'cash', 'other'));

select 'ok' as result;
