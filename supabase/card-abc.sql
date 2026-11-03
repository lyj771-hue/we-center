-- WE 소아재활센터 — 신용카드를 A·B·C로 나누기 (2026-11)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
-- 예전 신용카드 기록(card)은 그대로 신용카드A로 보인다. B = card_b, C = card_c. 마이페이지에는 나오지 않는다.

alter table lesson_payments drop constraint if exists lesson_payments_method_check;
alter table lesson_payments add constraint lesson_payments_method_check
  check (method in ('voucher', 'gusen', 'jangmatchum', 'kkumideun', 'woojin', 'woojin_ext', 'woojin_self', 'subsidy', 'prepaid', 'prepaid_b', 'prepaid_c',
                    'card', 'card_b', 'card_c', 'cash', 'other',
                    'voucher_retro', 'gusen_retro', 'jangmatchum_retro', 'kkumideun_retro', 'unpaid'));

select 'ok' as result;
