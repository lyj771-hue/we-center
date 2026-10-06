-- WE 소아재활센터 — 보호자 닉네임 기준 + 대시보드용 준비 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
-- (timetable.sql · schedule-cancel.sql 을 먼저 실행한 뒤 실행한다)
--
-- 1) 이름: 보호자 화면·신청 기록에는 보호자가 정한 닉네임(profiles.nickname)을 쓴다.
--    관리자 닉네임(center_nickname)은 관리자 화면에서 보호자 닉네임 아래 작게 보인다.
-- 2) 대시보드: 아이 ↔ 보호자 계정을 잇고, 기간을 주면 날짜별 수업을 한 번에 뽑는 함수(admin_lessons)를 둔다.
--    "어떤 아이(보호자 계정)가 언제, 어느 선생님 수업에 왔는지, 결석·취소는 몇 번인지"를 이 함수로 센다.
--    보호자 계정 하나 = 아이 한 명. 보호자 닉네임은 아이 이름으로 정한다.

-- 1. 보호자 닉네임
create or replace function public.my_nickname()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select nickname from profiles where user_id = auth.uid();
$$;

-- 신청 — 신청 기록에 보호자 닉네임을 남긴다(나머지는 schedule.sql 과 같다)
create or replace function public.book_slot(p_slot uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_slot slots%rowtype;
begin
  select nickname into v_name from profiles where user_id = auth.uid() and approved_at is not null;
  if v_name is null then
    return 'not_approved';
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
  values (v_slot.schedule_id, p_slot, auth.uid(), coalesce(public.my_nickname(), '보호자'), public.slot_label(p_slot) || ' 취소 신청', 'cancel_request');
  return 'ok';
end;
$$;

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
    return 'not_allowed';
  end if;
  insert into bookings (schedule_id, slot_id, user_id, nickname, label, kind)
  values (v_slot.schedule_id, p_slot, auth.uid(), coalesce(public.my_nickname(), '보호자'), public.slot_label(p_slot) || ' 취소 신청 철회', 'cancel_withdraw');
  return 'ok';
end;
$$;

-- 2. 아이 ↔ 보호자 계정 — 보호자 계정 하나가 아이 한 명이다(보호자 닉네임 = 아이 이름). 계정 없는 아이도 명단엔 있을 수 있다
alter table children add column if not exists guardian_user_id uuid references auth.users (id) on delete set null;
drop index if exists children_guardian_idx;
create unique index if not exists children_guardian_key on children (guardian_user_id);
create index if not exists slots_day_idx on slots (day);
create index if not exists slots_booked_by_idx on slots (booked_by);
create index if not exists bookings_user_idx on bookings (user_id);
create index if not exists board_cells_day_idx on board_cells (day);

-- 3. 기간 안의 모든 수업 (관리자 전용) — 날짜별 시간표와 같은 규칙으로 고정·빈타임·보호자 신청을 합친다
--   side   : fixed(고정 칸) / open(빈타임 칸)
--   source : fixed(요일 고정) / override(그날 바꾼 칸) / booking(보호자 신청)
--   status : child(수업) / undecided(?) / off(x) / none(그날 비움) / cancelled(취소 승인) / cancel_requested(취소 신청 중)
drop function if exists public.admin_lessons(date, date);
create function public.admin_lessons(p_from date, p_to date)
returns table (
  day date,
  lesson_time text,                          -- "time" 은 SQL 예약어라 이름을 바꿨다
  teacher_id uuid,
  teacher_name text,
  side text,
  source text,
  status text,
  child_id uuid,
  name text,
  guardian_user_id uuid,
  guardian_nickname text,
  center_nickname text,
  payment text,
  oral boolean,
  absent boolean,
  moved boolean,
  note text,
  booked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;
  return query
  with days as (
    select g::date as d from generate_series(p_from, p_to, interval '1 day') g
  ),
  fixed as (
    select days.d, f.* from days join fixed_lessons f on f.weekday = extract(dow from days.d)::int
  ),
  ov as (
    select * from board_cells b where b.day between p_from and p_to
  ),
  lessons as (
    -- 고정 칸: 그날 바꾼 칸이 있으면 그것, 없으면 요일 고정 수업
    select coalesce(o.day, f.d) as day, coalesce(o.time, f.time) as time, coalesce(o.teacher_id, f.teacher_id) as teacher_id,
           'fixed'::text as side,
           case when o.id is not null then 'override' else 'fixed' end as source,
           coalesce(o.status, 'child') as status,
           case when o.id is not null then o.child_id else f.child_id end as child_id,
           case when o.id is not null then o.name else f.name end as name,
           null::uuid as booked_user,
           case when o.id is not null then o.payment else f.payment end as payment,
           case when o.id is not null then o.oral else f.oral end as oral,
           coalesce(o.absent, false) as absent,
           coalesce(o.moved, false) as moved,
           o.note,
           null::timestamptz as booked_at
    from fixed f
    full join (select * from ov where ov.side = 'fixed') o
      on o.day = f.d and o.teacher_id = f.teacher_id and o.time = f.time
    union all
    -- 빈타임 칸: 관리자가 직접 넣은 칸
    select o.day, o.time, o.teacher_id, 'open', 'override', o.status, o.child_id, o.name, null, o.payment, o.oral, o.absent, o.moved, o.note, null
    from ov o where o.side = 'open'
    union all
    -- 빈타임 칸: 보호자 신청 (같은 칸을 관리자가 따로 바꿔 두지 않았을 때)
    select s.day, s.time, s.teacher_id, 'open', 'booking',
           case s.cancel_state when 'approved' then 'cancelled' when 'requested' then 'cancel_requested' else 'child' end,
           null, null, s.booked_by, '', false, false, false, null, s.booked_at
    from slots s
    where s.day between p_from and p_to and s.booked_by is not null
      and not exists (select 1 from ov o where o.side = 'open' and o.day = s.day and o.teacher_id = s.teacher_id and o.time = s.time)
  )
  select l.day, l.time, l.teacher_id, t.name, l.side, l.source, l.status,
         coalesce(l.child_id, c2.id),
         coalesce(l.name, c2.name, p.center_nickname, p.nickname),
         coalesce(c.guardian_user_id, c2.guardian_user_id, l.booked_user),
         coalesce(p.nickname, gp.nickname),
         coalesce(p.center_nickname, gp.center_nickname),
         coalesce(nullif(l.payment, ''), c2.payment, c.payment, ''),
         l.oral, l.absent, l.moved, l.note, l.booked_at
  from lessons l
  join teachers t on t.id = l.teacher_id
  left join children c on c.id = l.child_id
  left join profiles p on p.user_id = l.booked_user
  -- 보호자 신청은 아이 명단에서 그 계정의 아이(없으면 관리자 닉네임·보호자 닉네임과 같은 이름)를 찾아 잇는다
  left join lateral (
    select ch.* from children ch
    where l.booked_user is not null
      and (ch.guardian_user_id = l.booked_user or ch.name = p.center_nickname or ch.name = p.nickname)
    order by (ch.guardian_user_id = l.booked_user) desc nulls last, (ch.name = p.center_nickname) desc nulls last
    limit 1
  ) c2 on true
  left join profiles gp on gp.user_id = coalesce(c.guardian_user_id, c2.guardian_user_id)
  order by l.day, l.time, t.sort_order, l.side;
end;
$$;
revoke all on function public.admin_lessons(date, date) from public, anon;
grant execute on function public.admin_lessons(date, date) to authenticated;

select 'ok' as result;   -- admin_lessons 는 관리자 로그인으로만 부를 수 있다(여기선 확인하지 않는다)
