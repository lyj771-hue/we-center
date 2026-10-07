-- WE 소아재활센터 — 고정 수업 시작일 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
-- 고정 수업은 start_date(기본 2026-10-01)부터만 적용한다 — 시간표·마이페이지·대시보드에서 그 전 날짜엔 고정 수업이 없다.

alter table fixed_lessons add column if not exists start_date date not null default '2026-10-01';

drop function if exists public.admin_lessons(date, date);
drop function if exists public.my_lessons(date, date);
drop function if exists public.lessons_between(date, date);
create function public.lessons_between(p_from date, p_to date)
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
revoke all on function public.lessons_between(date, date) from public, anon, authenticated;

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
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;
  return query select * from public.lessons_between(p_from, p_to);
end;
$$;
revoke all on function public.admin_lessons(date, date) from public, anon;
grant execute on function public.admin_lessons(date, date) to authenticated;

-- 보호자: 내 아이 수업만 (한 번에 최대 100일)
create function public.my_lessons(p_from date, p_to date)
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
declare
  v_child uuid;
begin
  if p_to - p_from > 100 then
    raise exception 'too long';
  end if;
  select id into v_child from children where guardian_user_id = auth.uid();
  return query
    select * from public.lessons_between(p_from, p_to) l
    where (v_child is not null and l.child_id = v_child) or l.guardian_user_id = auth.uid();
end;
$$;
revoke all on function public.my_lessons(date, date) from public, anon;
grant execute on function public.my_lessons(date, date) to authenticated;

select 'ok' as result;
