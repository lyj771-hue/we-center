-- WE 소아재활센터 — 보호자 취소 신청 · 관리자 취소 승인 없애기 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
-- (schedule-reserve.sql 다음에 실행)
--
-- 보호자는 이제 취소 신청을 하지 않는다 — 취소·변경은 센터로 연락, 관리자가 직접 취소한다.
-- (예약 게시 글의 "게시 후 10분 자유 취소"는 그대로 — free_cancel_slot)
-- 승인 기다리던 신청은 정리한다: 수업은 그대로 진행되는 것으로(마이페이지 수업 취소 = 거절, 수업스케쥴 취소중 = 신청완료로).

-- 1. 마이페이지 수업 취소 신청 받지 않기
create or replace function public.cancel_my_lesson(p_day date, p_time text, p_teacher uuid, p_side text)
returns text
language plpgsql security definer set search_path = public
as $$
begin
  return 'not_allowed';
end;
$$;

-- 2. 수업스케쥴 취소 신청 받지 않기 (schedule-reserve.sql 과 같다)
create or replace function public.request_cancel(p_slot uuid)
returns text
language plpgsql security definer set search_path = public
as $$
begin
  return 'not_allowed';
end;
$$;

-- 3. 승인 기다리던 신청 정리
update lesson_cancels set status = 'rejected' where status = 'requested';
update slots set cancel_state = null where cancel_state = 'requested';

select 'ok' as result;
