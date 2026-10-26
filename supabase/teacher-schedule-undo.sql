-- WE 소아재활센터 — 선생님 시간표에서 빈 수업 게시·닫기 기능 되돌리기 (2026-10-26)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. teacher-schedule.sql 을 안 돌렸어도 괜찮다.
-- 시간표 빈타임에 x가 생기면 게시 시간을 자동으로 빼던 연결과, 선생님용 게시·닫기 함수를 지운다.
-- (알림 표의 batch_id · created_by 칸은 그대로 — 단체 알림 묶음에 쓴다)

drop trigger if exists board_cells_unpost_slots on board_cells;
drop function if exists public.board_cells_unpost_slots();
drop function if exists public.teacher_post_slots(text, jsonb);
drop function if exists public.teacher_close_slots(text, jsonb);
drop function if exists public.teacher_set_open_off(text, date, text, boolean);
drop function if exists public.teacher_admin_notice(text, text, text, text);
drop function if exists public.teacher_posted_slots(date, date, text);
drop function if exists public.posted_days(date, date, text);
drop function if exists public.schedule_for_day(text, date);
drop function if exists public.schedule_covers(jsonb, date, date);
drop function if exists public.open_cell_free(uuid, date, text, text);
drop function if exists public.teacher_outbox_rows(uuid[]);
drop function if exists public.teacher_mark_outbox(uuid, text, text);
drop function if exists public.my_teacher_id();

select 'ok' as result;
