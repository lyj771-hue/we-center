-- WE 소아재활센터 — We컨셉 페이지 없앰 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run.
-- 페이지 설정(page_settings)에 남은 We컨셉 줄을 지운다.

delete from page_settings where page = 'we-concept';

select 'ok' as result;
