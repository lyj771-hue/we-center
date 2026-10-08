-- WE 소아재활센터 — 시간표에서 그날만 선생님 빼기 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
--
-- teacher_day_assign 에 off 를 더한다. off = false 는 그날 더한 선생님, off = true 는 그날 뺀 선생님.

alter table teacher_day_assign add column if not exists off boolean not null default false;

select 'ok' as result;
