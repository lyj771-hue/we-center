-- WE 소아재활센터 — 취소 신청을 승인하면 그 시간을 다시 열기 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
--
-- 전에는 승인해도 칸이 "취소완료"(마감)로 남아 다른 보호자가 신청할 수 없었다.
-- 이제 승인하면 신청이 지워지고(booked_by = null) 빈 시간으로 다시 열린다. 신청·취소 신청·승인 기록은 bookings 에 그대로 남는다.
-- (마이페이지에서 보호자가 바로 취소한 수업은 lesson-cancel.sql 대로 — 칸이 "취소완료"로 남고 관리자가 정한다)

create or replace function public.approve_cancel(p_slot uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot slots%rowtype;
begin
  if not public.is_admin() then
    return 'not_allowed';
  end if;
  select * into v_slot from slots where id = p_slot and cancel_state = 'requested' for update;
  if not found then
    return 'not_requested';
  end if;
  update bookings set cancelled_at = now() where slot_id = p_slot and kind = 'book' and cancelled_at is null;
  insert into bookings (schedule_id, slot_id, user_id, nickname, label, kind)
  values (v_slot.schedule_id, p_slot, null, '센터', public.slot_label(p_slot) || ' 취소 승인', 'cancel_approved');
  -- 시간 다시 열기
  update slots set booked_by = null, booked_at = null, cancel_state = null where id = p_slot;
  return 'ok';
end;
$$;
revoke all on function public.approve_cancel(uuid) from public, anon;
grant execute on function public.approve_cancel(uuid) to authenticated;

select 'ok' as result;
