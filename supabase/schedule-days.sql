-- WE 소아재활센터 — 공휴일 스케쥴용 칸 추가 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
-- schedules.days: 관리자가 고른 날짜들 ["2026-10-09","2026-12-25"]. 비어 있으면(null) 월~금 한 주.
alter table schedules add column if not exists days jsonb;
select 'ok' as result;
