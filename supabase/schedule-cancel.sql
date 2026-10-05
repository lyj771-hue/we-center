-- WE 소아재활센터 — 수업스케쥴 보호자 취소 신청 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
--
-- 보호자: 내 "신청완료" 시간을 눌러 취소 신청 → "취소중". 관리자가 승인하기 전엔 다시 눌러 철회할 수 있다.
-- 관리자: 취소 신청을 승인 → 그 보호자에겐 회색 "취소완료", 다른 보호자에겐 계속 "마감"(시간은 다시 열리지 않는다).
--         시간을 다시 열려면 지금처럼 관리자 취소(✕)를 누른다.
-- 각 단계는 신청 댓글에 남는다(취소 신청 / 취소 신청 철회 / 취소 승인).

-- 1. 칸 — 시간 칸의 취소 상태, 댓글의 종류
alter table slots add column if not exists cancel_state text check (cancel_state in ('requested', 'approved'));
alter table bookings add column if not exists kind text not null default 'book'
  check (kind in ('book', 'cancel_request', 'cancel_withdraw', 'cancel_approved'));

-- 2. 시간 칸 이름 — "이정길 선생님 10월 5일 월요일 14:00"
create or replace function public.slot_label(p_slot uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select format('%s 선생님 %s월 %s일 %s요일 %s',
           t.name, extract(month from s.day)::int, extract(day from s.day)::int,
           (array['일', '월', '화', '수', '목', '금', '토'])[extract(dow from s.day)::int + 1], s.time)
  from slots s join teachers t on t.id = s.teacher_id
  where s.id = p_slot;
$$;

-- 3. 보호자 닉네임 (센터 닉네임 우선)
create or replace function public.my_center_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(btrim(center_nickname), ''), nickname) from profiles where user_id = auth.uid();
$$;

-- 4. 취소 신청 — 내 신청이고 아직 취소 상태가 아닐 때만
create or replace function public.request_cancel(p_slot uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot slots%rowtype;
begin
  update slots set cancel_state = 'requested'
  where id = p_slot and booked_by = auth.uid() and cancel_state is null
  returning * into v_slot;
  if not found then
    return 'not_allowed';
  end if;
  insert into bookings (schedule_id, slot_id, user_id, nickname, label, kind)
  values (v_slot.schedule_id, p_slot, auth.uid(), coalesce(public.my_center_name(), '보호자'), public.slot_label(p_slot) || ' 취소 신청', 'cancel_request');
  return 'ok';
end;
$$;

-- 5. 취소 신청 철회 — 관리자가 승인하기 전에만
create or replace function public.withdraw_cancel(p_slot uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot slots%rowtype;
begin
  update slots set cancel_state = null
  where id = p_slot and booked_by = auth.uid() and cancel_state = 'requested'
  returning * into v_slot;
  if not found then
    return 'not_allowed';   -- 이미 승인됐거나 내 신청이 아님
  end if;
  insert into bookings (schedule_id, slot_id, user_id, nickname, label, kind)
  values (v_slot.schedule_id, p_slot, auth.uid(), coalesce(public.my_center_name(), '보호자'), public.slot_label(p_slot) || ' 취소 신청 철회', 'cancel_withdraw');
  return 'ok';
end;
$$;

-- 6. 취소 승인 — 관리자만. 시간은 열지 않고(다른 보호자에겐 마감) 원래 신청 댓글에 취소 표시
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
  update slots set cancel_state = 'approved'
  where id = p_slot and cancel_state = 'requested'
  returning * into v_slot;
  if not found then
    return 'not_requested';
  end if;
  update bookings set cancelled_at = now() where slot_id = p_slot and kind = 'book' and cancelled_at is null;
  insert into bookings (schedule_id, slot_id, user_id, nickname, label, kind)
  values (v_slot.schedule_id, p_slot, null, '센터', public.slot_label(p_slot) || ' 취소 승인', 'cancel_approved');
  return 'ok';
end;
$$;

-- 7. 관리자 취소(시간 다시 열기) — 취소 상태도 지운다
create or replace function public.cancel_slot(p_slot uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    return 'not_allowed';
  end if;
  update bookings set cancelled_at = now() where slot_id = p_slot and kind = 'book' and cancelled_at is null;
  update slots set booked_by = null, booked_at = null, cancel_state = null where id = p_slot;
  return 'ok';
end;
$$;

revoke all on function public.request_cancel(uuid) from public, anon;
revoke all on function public.withdraw_cancel(uuid) from public, anon;
revoke all on function public.approve_cancel(uuid) from public, anon;
grant execute on function public.request_cancel(uuid) to authenticated;
grant execute on function public.withdraw_cancel(uuid) to authenticated;
grant execute on function public.approve_cancel(uuid) to authenticated;

select 'ok' as result;
