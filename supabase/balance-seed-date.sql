-- WE 소아재활센터 — 우진학교외부·자율·지원금 '이전 잔액' 줄 날짜를 2026/11/01 로 (2026-11-04)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다. (balance-charges.sql 다음에 실행)
--
-- balance-charges.sql 이 '이전 잔액'(seed) 줄을 만들 때, 차감 기록이 없는 아이는 실행한 날(11/4)로 들어갔다.
-- 그 줄만 11/1 로 옮긴다. 차감 기록이 있어 첫 차감일로 들어간 줄, 직접 넣은 충전·수정 줄은 그대로. 금액은 바뀌지 않는다.

update balance_charges set day = date '2026-11-01'
where seed and day = date '2026-11-04';

select method, day, count(*) as 줄수 from balance_charges where seed group by method, day order by method, day;
