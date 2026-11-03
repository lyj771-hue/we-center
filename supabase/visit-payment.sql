-- WE 소아재활센터 — 결제방식 '방문' 추가 (2026-11-03)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다. (card-abc.sql 다음에 실행)
--
-- 방문은 시간표 결제 칸에서 고를 때 금액(원)을 바로 적는다 — 결제 기록의 amount 칸에 남는다. 횟수·남은 금액에서는 빼지 않는다.

alter table lesson_payments add column if not exists amount int;

alter table lesson_payments drop constraint if exists lesson_payments_method_check;
alter table lesson_payments add constraint lesson_payments_method_check
  check (method in ('voucher', 'gusen', 'jangmatchum', 'kkumideun', 'woojin', 'woojin_ext', 'woojin_self', 'subsidy', 'prepaid', 'prepaid_b', 'prepaid_c',
                    'card', 'card_b', 'card_c', 'cash', 'visit', 'other',
                    'voucher_retro', 'gusen_retro', 'jangmatchum_retro', 'kkumideun_retro', 'unpaid'));
