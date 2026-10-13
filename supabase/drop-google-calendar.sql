-- WE 소아재활센터 — 구글 캘린더 연동을 없애서 안 쓰는 칸 지우기 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.

alter table teachers drop column if exists google_calendar_id;

select column_name from information_schema.columns where table_name = 'teachers' order by ordinal_position;
