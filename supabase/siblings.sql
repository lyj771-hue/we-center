-- WE 소아재활센터 — 가족: 보호자 계정 하나에 같은 지점 아이 여러 명 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
--
-- 마이페이지에서 고른 아이(profiles.active_child_id)를 기준으로 마이페이지·수업 신청이 움직인다. 고른 적이 없으면 이름 순으로 빠른 아이.
-- 고른 값은 디비에 있어서 다시 로그인해도, 다른 기기에서도 그대로다.
-- 수업 신청에는 어느 아이 신청인지 남긴다(slots.booked_child_id).
-- 두 지점을 다니는 아이(수색 김유담 / 의정부 김유담)는 지점마다 기록이 따로라서, 같은 이름이면 같은 아이로 본다.

-- 1. 계정 하나에 지점마다 한 명만 잇던 제한 없애기
drop index if exists children_guardian_center_key;
create index if not exists children_guardian_idx on children (guardian_user_id);

-- 2. 고른 아이 · 신청한 아이
alter table profiles add column if not exists active_child_id uuid references children(id) on delete set null;
alter table slots add column if not exists booked_child_id uuid references children(id) on delete set null;

-- 지금까지의 신청은 그 계정의 아이로 채운다 (지금은 지점마다 한 명뿐이라 틀릴 일이 없다)
update slots s set booked_child_id = (
  select c.id from children c
  left join schedules sc on sc.id = s.schedule_id
  where c.guardian_user_id = s.booked_by
  order by (c.center = coalesce(sc.center, 'eunpyeong')) desc, c.name, c.id
  limit 1
) where s.booked_by is not null and s.booked_child_id is null;

-- 3. 고른 아이 — 고른 적이 없거나 연결이 끊겼으면 이름 순으로 빠른 아이
create or replace function public.my_active_child()
returns uuid
language sql stable security definer set search_path = public
as $$
  select c.id from children c
  left join profiles p on p.user_id = auth.uid()
  where c.guardian_user_id = auth.uid()
  order by (c.id = p.active_child_id) desc nulls last, c.name, (c.center = coalesce(p.center, 'eunpyeong')) desc, c.id
  limit 1;
$$;

-- 4. 그 지점에서 볼 아이 — 고른 아이 → 같은 이름(다른 지점 기록) → 이름 순. my_child · my_payments · my_prepaid_ledger 가 이 함수를 쓴다
create or replace function public.my_center_child(p_center text)
returns uuid
language sql stable security definer set search_path = public
as $$
  select c.id from children c
  left join profiles p on p.user_id = auth.uid()
  left join children a on a.id = public.my_active_child()
  where c.guardian_user_id = auth.uid()
    and (p_center is null or c.center = p_center)
  order by (c.id = a.id) desc nulls last, (c.name = a.name) desc nulls last, c.name, (c.center = coalesce(p.center, 'eunpyeong')) desc, c.id
  limit 1;
$$;

-- 5. 지금 고른 아이의 기록들 (지점마다 하나씩)
create or replace function public.my_selected_children()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select distinct public.my_center_child(c.center) from children c where c.guardian_user_id = auth.uid();
$$;

-- 6. 마이페이지 아이 탭 — 내 아이들, 아이 고르기
drop function if exists public.my_children();
create function public.my_children()
returns table (id uuid, name text, child_number int, center text)
language sql stable security definer set search_path = public
as $$
  select c.id, c.name, c.number, coalesce(c.center, 'eunpyeong') from children c
  where c.guardian_user_id = auth.uid()
  order by c.name, c.id;
$$;

create or replace function public.set_active_child(p_child uuid)
returns text
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from children where id = p_child and guardian_user_id = auth.uid()) then
    return 'not_allowed';
  end if;
  update profiles set active_child_id = p_child where user_id = auth.uid();
  return 'ok';
end;
$$;

-- 7. 마이페이지 수업 · 결제 기록 — 고른 아이 것만 (계정에 이어진 아이 없이 신청한 수업은 그대로 보인다)
create or replace function public.my_lessons(p_from date, p_to date)
returns table (
  day date, lesson_time text, teacher_id uuid, teacher_name text, side text, source text, status text,
  child_id uuid, name text, guardian_user_id uuid, guardian_nickname text, center_nickname text,
  payment text, oral boolean, absent boolean, moved boolean, note text, booked_at timestamptz, center text
)
language plpgsql stable security definer set search_path = public
as $$
#variable_conflict use_column
begin
  if p_to - p_from > 100 then
    raise exception 'too long';
  end if;
  return query
    select * from public.lessons_between(p_from, p_to) l
    where l.child_id in (select public.my_selected_children())
       or (l.guardian_user_id = auth.uid()
           and (l.child_id is null or l.child_id not in (select c.id from children c where c.guardian_user_id = auth.uid())));
end;
$$;

-- count-exclude-wonjae.sql 과 같고 아이 조건만 다름
create or replace function public.my_payment_history()
returns table (day date, method text, lesson_time text, teacher_name text, note text, at timestamptz, center text)
language sql stable security definer set search_path = public
as $$
  select lp.day, lp.method, lp.time, t.name, lp.note, lp.created_at, coalesce(lp.center, 'eunpyeong')
  from lesson_payments lp
  left join teachers t on t.id = lp.teacher_id
  where lp.child_id in (select public.my_selected_children())
    and lp.confirmed
    and not exists (select 1 from teachers x where x.id = lp.teacher_id and x.name = '이원재')
    and lp.method in ('voucher', 'gusen', 'jangmatchum', 'kkumideun', 'subsidy', 'woojin', 'woojin_ext', 'woojin_self')
  order by lp.day, lp.time;
$$;

-- 8. 수업 신청 — 고른 아이로. 겹침은 그 아이 수업만 본다(가족는 같은 시간에 수업이 있어도 된다)
create or replace function public.book_slot(p_slot uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_child uuid;
  v_child_name text;
  v_center text;
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

  select coalesce(sc.center, 'eunpyeong') into v_center from schedules sc where sc.id = v_target.schedule_id;
  v_child := coalesce(public.my_center_child(v_center), public.my_active_child());
  select name into v_child_name from children where id = v_child;

  -- 겹치는 수업이 있는지 — 시작 시각 차이가 50분보다 작으면 겹친다
  if exists (
    select 1 from public.lessons_between(v_target.day, v_target.day) l
    where (l.child_id in (select c.id from children c where c.guardian_user_id = auth.uid() and c.name = v_child_name)
           or (l.guardian_user_id = auth.uid() and (l.child_id is null or l.child_id not in (select c.id from children c where c.guardian_user_id = auth.uid()))))
      and l.status in ('child', 'cancel_requested') and not l.moved
      and abs(extract(epoch from (l.lesson_time::time - v_target.time::time))) < 50 * 60
  ) then
    return 'conflict';
  end if;

  update slots set booked_by = auth.uid(), booked_child_id = v_child, booked_at = now(), cancel_state = null
  where id = p_slot and booked_by is null
  returning * into v_slot;
  if not found then
    return 'taken';
  end if;
  insert into bookings (schedule_id, slot_id, user_id, nickname, label, kind)
  values (v_slot.schedule_id, v_slot.id, auth.uid(), coalesce(v_child_name, v_name), public.slot_label(v_slot.id), 'book');
  return 'ok';
end;
$$;

-- 9. 신청 칸의 아이 — 신청한 아이로 (member-centers.sql · booking-alimtalk.sql 에서 이 부분만 다름)
create or replace function public.lessons_between(p_from date, p_to date)
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
  booked_at timestamptz,
  center text
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  return query
  with days as (
    select g::date as d from generate_series(p_from, p_to, interval '1 day') g
  ),
  fixed as (
    select days.d, f.* from days join fixed_lessons f on f.weekday = extract(dow from days.d)::int and days.d >= f.start_date
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
           null::uuid as booked_child,
           case when o.id is not null then o.payment else f.payment end as payment,
           case when o.id is not null then o.oral else f.oral end as oral,
           coalesce(o.absent, false) as absent,
           coalesce(o.moved, false) as moved,
           o.note,
           null::timestamptz as booked_at,
           coalesce(o.center, f.center, 'eunpyeong') as center
    from fixed f
    full join (select * from ov where ov.side = 'fixed') o
      on o.day = f.d and o.teacher_id = f.teacher_id and o.time = f.time and o.center = f.center
    union all
    -- 빈타임 칸: 관리자가 직접 넣은 칸
    select o.day, o.time, o.teacher_id, 'open', 'override', o.status, o.child_id, o.name, null, null, o.payment, o.oral, o.absent, o.moved, o.note, null, o.center
    from ov o where o.side = 'open'
    union all
    -- 빈타임 칸: 보호자 신청 (같은 칸을 관리자가 따로 바꿔 두지 않았을 때)
    select s.day, s.time, s.teacher_id, 'open', 'booking',
           case s.cancel_state when 'approved' then 'cancelled' when 'requested' then 'cancel_requested' else 'child' end,
           null, null, s.booked_by, s.booked_child_id, '', false, false, false, null, s.booked_at,
           coalesce((select sc.center from schedules sc where sc.id = s.schedule_id), 'eunpyeong')
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
         coalesce(l.payment, ''),                 -- 결제 글자는 그 칸(고정 자리·그날 칸)의 것만 (아이 기본 결제는 없앴다)
         l.oral, l.absent, l.moved, l.note, l.booked_at, l.center
  from lessons l
  join teachers t on t.id = l.teacher_id
  left join children c on c.id = l.child_id
  left join profiles p on p.user_id = l.booked_user
  -- 보호자 신청은 아이 명단에서 그 계정의 아이(없으면 관리자 닉네임·보호자 닉네임과 같은 이름)를 찾아 잇는다
  left join lateral (
    select ch.* from children ch
    where l.booked_user is not null
      and (ch.id = l.booked_child or ch.guardian_user_id = l.booked_user or ch.name = p.center_nickname or ch.name = p.nickname)
    order by (ch.id = l.booked_child) desc nulls last, (ch.guardian_user_id = l.booked_user) desc nulls last, (ch.name = p.center_nickname) desc nulls last
    limit 1
  ) c2 on true
  left join profiles gp on gp.user_id = coalesce(c.guardian_user_id, c2.guardian_user_id)
  order by l.day, l.time, t.sort_order, l.side;
end;
$$;

create or replace function public.prepare_booking_alimtalk(p_slot uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  v_tid text;
  v_child record;
  v_phone text;
  v_name text;
  v_vars jsonb;
  v_id uuid;
  v_dow text[] := array['일', '월', '화', '수', '목', '금', '토'];
begin
  select s.id, s.day, s.time, s.booked_at, s.booked_child_id, t.name as teacher, coalesce(sc.center, 'eunpyeong') as center into v
  from slots s join teachers t on t.id = s.teacher_id left join schedules sc on sc.id = s.schedule_id
  where s.id = p_slot and s.booked_by = auth.uid() and s.cancel_state is null;
  if not found then
    return null;
  end if;
  -- 같은 신청에 두 번 만들지 않는다 — 이번에 잡은 뒤(booked_at 이후)에 만든 것만 본다. 취소했다가 다시 잡으면 다시 보낸다
  if exists (select 1 from outbox_messages where ref_id::text = p_slot::text and template_id = 'booking_result' and user_id = auth.uid()
             and vars->>'신청결과' = '확정' and created_at >= coalesce(v.booked_at, now())) then
    return null;
  end if;
  select template_id into v_tid from alimtalk_templates where id = 'booking_result';
  select c.id, c.name into v_child from children c where c.guardian_user_id = auth.uid()
    order by (c.id = v.booked_child_id) desc nulls last, (c.center = v.center) desc, c.name limit 1;
  select phone, nickname into v_phone, v_name from profiles where user_id = auth.uid();
  v_vars := jsonb_build_object(
    '이름', coalesce(v_child.name, v_name, ''),
    '날짜', to_char(v.day, 'YYYY/MM/DD'),
    '요일', v_dow[extract(dow from v.day)::int + 1],
    '시간', regexp_replace(v.time, '^0', ''),
    '선생님', v.teacher,
    '신청결과', '확정'
  );
  insert into outbox_messages (template_id, ref_id, child_id, user_id, child_name, phone, vars, status, error)
  values ('booking_result', p_slot, v_child.id, auth.uid(), coalesce(v_child.name, v_name, ''), v_phone, v_vars,
          case when v_phone is null then 'skipped' else 'pending' end,
          case when v_phone is null then '번호 없음' when v_tid is null then '솔라피 템플릿 ID가 아직 없어요' end)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'template_id', v_tid, 'phone', v_phone, 'vars', v_vars);
end;
$$;

create or replace function public.schedule_slot_owners(p_schedule uuid)
returns table (slot_id uuid, name text)
language sql stable security definer set search_path = public
as $$
  select s.id, coalesce(ch.name, p.center_nickname, p.nickname, '신청됨')
  from slots s
  left join profiles p on p.user_id = s.booked_by
  left join lateral (select c.name from children c where c.guardian_user_id = s.booked_by
                     order by (c.id = s.booked_child_id) desc nulls last, c.name limit 1) ch on true
  where s.schedule_id = p_schedule and s.booked_by is not null and (public.is_admin() or public.is_teacher());
$$;

-- 10. 보호자가 회원 코드로 이을 때 — 다른 아이 연결은 끊지 않는다(가족)
create or replace function public.claim_child(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_child children%rowtype;
begin
  select phone_last4 into v_phone from profiles where user_id = auth.uid();
  if v_phone is null then
    return 'no_profile';
  end if;
  update profiles set requested_code = upper(btrim(p_code)) where user_id = auth.uid();
  select * into v_child from children where member_code = upper(btrim(p_code));
  if not found then
    return 'no_code';
  end if;
  if v_child.guardian_user_id is not null and v_child.guardian_user_id <> auth.uid() then
    return 'taken';
  end if;
  if v_child.phone_last4 is not null and v_child.phone_last4 <> v_phone then
    return 'phone_mismatch';
  end if;
  update children set guardian_user_id = auth.uid(), phone_last4 = coalesce(phone_last4, v_phone) where id = v_child.id;
  return 'ok';
end;
$$;

revoke all on function public.my_active_child() from public, anon;
revoke all on function public.my_selected_children() from public, anon;
revoke all on function public.my_children() from public, anon;
revoke all on function public.set_active_child(uuid) from public, anon;
grant execute on function public.my_active_child() to authenticated;
grant execute on function public.my_selected_children() to authenticated;
grant execute on function public.my_children() to authenticated;
grant execute on function public.set_active_child(uuid) to authenticated;

select 'ok' as result;
