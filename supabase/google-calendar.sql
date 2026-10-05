-- WE 소아재활센터 — 구글 캘린더 연동 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
-- 선생님마다 구글 캘린더 ID 를 적어 둔다(관리자 화면 "선생님 명단 고치기"에서 고칠 수 있다).
alter table teachers add column if not exists google_calendar_id text;
select 'ok' as result;
