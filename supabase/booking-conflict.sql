-- WE 소아재활센터 — 보호자 신청: 이미 수업이 있는 시간과 겹치면 막기 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
-- (fixed-start.sql 까지 실행한 뒤 실행한다)
-- 같은 날, 50분 수업이 겹치는 시간에 우리 아이 수업(고정·그날 바꾼 칸·다른 신청)이 있으면 'conflict' 를 돌려준다.

create or replace function public.book_slot(p_slot uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_child uuid;
  v_target slots%rowtype;
  v_slot slots%rowtype;
begin
  select nickname into v_name from profiles where user_id = auth.uid() and approved_at is not null;
  if v_name is null then
    return 'not_approved';
  end if;

  select * into v_target from slots where id = p_slot;
  if not found then
    return 'taken';
  end if;

  -- 겹치는 수업이 있는지 — 시작 시각 차이가 50분보다 작으면 겹친다
  select id into v_child from children where guardian_user_id = auth.uid();
  if exists (
    select 1 from public.lessons_between(v_target.day, v_target.day) l
    where ((v_child is not null and l.child_id = v_child) or l.guardian_user_id = auth.uid())
      and l.status in ('child', 'cancel_requested') and not l.moved
      and abs(extract(epoch from (l.lesson_time::time - v_target.time::time))) < 50 * 60
  ) then
    return 'conflict';
  end if;

  update slots set booked_by = auth.uid(), booked_at = now(), cancel_state = null
  where id = p_slot and booked_by is null
  returning * into v_slot;
  if not found then
    return 'taken';
  end if;
  insert into bookings (schedule_id, slot_id, user_id, nickname, label, kind)
  values (v_slot.schedule_id, v_slot.id, auth.uid(), v_name, public.slot_label(v_slot.id), 'book');
  return 'ok';
end;
$$;
revoke all on function public.book_slot(uuid) from public, anon;
grant execute on function public.book_slot(uuid) to authenticated;

select 'ok' as result;
