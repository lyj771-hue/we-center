-- WE 소아재활센터 — 수업스케쥴 글 숨기기 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
--
-- 신청이 있는 글은 지우면 신청(시간 칸·신청 기록)까지 지워져 시간표·마이페이지에서 수업이 사라진다.
-- 그래서 신청 기록이 있는 글은 [삭제] 대신 숨긴다 — 보호자 목록에서만 안 보이고, 신청 수업은 시간표·마이페이지에 그대로 남는다.
-- hidden_at: 숨긴 시각 (null = 보임). 관리자는 목록에서 [다시 보이기]로 되살린다.

alter table schedules add column if not exists hidden_at timestamptz;

select 'ok' as result;
