-- WE 소아재활센터 — 선생님이 시간표 보기에서 빈 수업 올리기 · x(수업 안 함)로 바꾸기 (2026-10-26)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
-- outbox-batch.sql · admin-alerts.sql · teacher-login.sql 을 먼저 돌린 뒤에.
--
-- 1) teacher_post_slots — 선생님이 내 빈타임(비어 있는 칸 또는 x 칸, ?는 안 됨) 여러 개를 골라, 그 날짜가 들어 있는 기존 수업스케쥴 글에 시간을 더한다.
--    게시글 기간이 아닌 날은 안 된다. x 칸은 x가 풀리며 올라간다.
--    그 센터에 승인된 보호자에게 '스케줄 수정 알림'(schedule_updated, 글마다 한 묶음), 관리자에게 '선생님 빈 수업 변경 알림'(teacher_schedule_admin, 추가했어요).
-- 2) teacher_set_open_off — 내 빈타임 칸을 x(수업 안 함)로. 아직 아무도 신청 안 한 게시 시간은 글에서 바로 빠진다. 관리자에게 늘 알림(내렸어요 / x로 바꿨어요), 보호자에게는 없음. x를 다시 열려면 1)로 게시글에 더한다.
-- 3) 트리거 — 시간표(관리자·선생님 누구든) 빈타임 칸에 x · ? · 아이가 들어가면, 같은 선생님·날짜·시간의 신청 안 된 게시 시간을 글에서 뺀다.
-- 4) teacher_posted_slots — 시간표 보기에서 "게시 중" 표시용 (모든 선생님). posted_days — 게시글 기간인 날짜들.
-- 5) teacher_outbox_rows · teacher_mark_outbox — 선생님이 만든 보낼 알림을 /api/alimtalk/teacher-send 가 보내고 결과를 적는다.

alter table outbox_messages add column if not exists batch_id uuid;
alter table outbox_messages add column if not exists created_by uuid default auth.uid();

create or replace function public.my_teacher_id()
returns uuid language sql stable security definer set search_path = public
as $$ select teacher_id from teacher_logins where user_id = auth.uid() limit 1 $$;
revoke all on function public.my_teacher_id() from public, anon;
grant execute on function public.my_teacher_id() to authenticated;

-- 빈타임 칸을 올릴 수 있는지 — 비어 있거나 x (?·아이는 안 됨), 고정 칸에 살아 있는 수업도 없어야 한다(빈타임에 아이가 들어가면 고정 아이가 밀리니까)
create or replace function public.open_cell_free(p_teacher uuid, p_day date, p_time text, p_center text)
returns boolean language sql stable security definer set search_path = public
as $$
  select not exists (
    select 1 from public.lessons_between(p_day, p_day) l
    where l.teacher_id = p_teacher and l.lesson_time = p_time and l.center = p_center
      and (
        (l.side = 'open' and l.status in ('child', 'cancel_requested', 'undecided'))
        or (l.side = 'fixed' and l.status = 'child' and not l.moved and not l.absent)
      )
  );
$$;
revoke all on function public.open_cell_free(uuid, date, text, text) from public, anon, authenticated;

-- 게시 중인 빈 시간 (아직 아무도 신청 안 함, 숨긴 글 제외)
drop function if exists public.teacher_posted_slots(date, date, text);
create function public.teacher_posted_slots(p_from date, p_to date, p_center text)
returns table (teacher_id uuid, day date, lesson_time text, schedule_id uuid)
language sql stable security definer set search_path = public
as $$
  select s.teacher_id, s.day, s.time, s.schedule_id
  from slots s join schedules sc on sc.id = s.schedule_id
  where s.day between p_from and p_to and s.booked_by is null and sc.hidden_at is null and sc.center = p_center
    and (public.is_admin() or public.is_teacher());
$$;
revoke all on function public.teacher_posted_slots(date, date, text) from public, anon;
grant execute on function public.teacher_posted_slots(date, date, text) to authenticated;

-- 그 날이 이 글의 기간인지 — 날짜를 고른 글(공휴일 등)은 그 날짜들, 아니면 그 주 월~토
create or replace function public.schedule_covers(p_days jsonb, p_week_start date, p_day date)
returns boolean language sql immutable
as $$
  select case when p_days is not null and jsonb_typeof(p_days) = 'array' and jsonb_array_length(p_days) > 0
              then p_days ? to_char(p_day, 'YYYY-MM-DD')
              else p_day between p_week_start and p_week_start + 5 end;
$$;

-- 그 날이 들어 있는 게시글(숨기지 않은 것 중 가장 최근)
create or replace function public.schedule_for_day(p_center text, p_day date)
returns uuid language sql stable security definer set search_path = public
as $$
  select sc.id from schedules sc
  where sc.center = p_center and sc.hidden_at is null and public.schedule_covers(sc.days, sc.week_start, p_day)
  order by sc.created_at desc limit 1;
$$;
revoke all on function public.schedule_for_day(text, date) from public, anon, authenticated;

-- 게시글 기간인 날짜들 — 선생님 시간표에서 고를 수 있는 날
drop function if exists public.posted_days(date, date, text);
create function public.posted_days(p_from date, p_to date, p_center text)
returns table (day date, schedule_id uuid, title text)
language sql stable security definer set search_path = public
as $$
  select g::date, sc.id, sc.title
  from generate_series(p_from, p_to, interval '1 day') g
  join schedules sc on sc.id = public.schedule_for_day(p_center, g::date)
  where public.is_admin() or public.is_teacher();
$$;
revoke all on function public.posted_days(date, date, text) from public, anon;
grant execute on function public.posted_days(date, date, text) to authenticated;

-- 관리자에게 보낼 알림 한 줄 + 관리자 알림(빨간 숫자)
create or replace function public.teacher_admin_notice(p_center text, p_teacher_name text, p_kind text, p_detail text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  insert into outbox_messages (template_id, child_name, phone, vars)
  values ('teacher_schedule_admin', '관리자', null, jsonb_build_object(
    '선생님', p_teacher_name, '센터', case p_center when 'uijeongbu' then '의정부점' else '수색점' end, '구분', p_kind, '내용', p_detail))
  returning id into v_id;
  if to_regclass('public.admin_alerts') is not null then
    execute 'insert into admin_alerts (kind, center, title, detail, user_id) values ($1, $2, $3, $4, $5)'
    using 'teacher_schedule', p_center, p_teacher_name || ' 선생님 빈 수업 ' || p_kind, p_detail, auth.uid();
  end if;
  return v_id;
end;
$$;
revoke all on function public.teacher_admin_notice(text, text, text, text) from public, anon, authenticated;

-- 1) 빈 수업 더하기 — p_times = [{"day":"2026-10-27","time":"15:40"}, …] → 그 날짜가 들어 있는 기존 게시글에 시간을 더한다
create or replace function public.teacher_post_slots(p_center text, p_times jsonb)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_tid uuid := public.my_teacher_id();
  v_name text;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_ok jsonb := '[]'::jsonb;
  v_no_post int := 0;
  v_sid uuid;
  v_batch uuid;
  v_ids uuid[] := '{}';
  v_detail text;
  v_dow text[] := array['일', '월', '화', '수', '목', '금', '토'];
  x record;
  g record;
begin
  if v_tid is null then return jsonb_build_object('result', 'not_teacher'); end if;
  if p_center not in ('eunpyeong', 'uijeongbu') then return jsonb_build_object('result', 'bad_center'); end if;
  select name into v_name from teachers where id = v_tid;

  for x in select distinct (e->>'day')::date as day, e->>'time' as time from jsonb_array_elements(p_times) e order by 1, 2 loop
    -- 수업 시작이 지금부터 1시간 넘게 남은 시간만
    if (x.day + x.time::time) < (now() at time zone 'Asia/Seoul') + interval '1 hour' then continue; end if;
    v_sid := public.schedule_for_day(p_center, x.day);
    if v_sid is null then v_no_post := v_no_post + 1; continue; end if;
    if not public.open_cell_free(v_tid, x.day, x.time, p_center) then continue; end if;
    if exists (select 1 from slots s join schedules sc on sc.id = s.schedule_id
               where s.teacher_id = v_tid and s.day = x.day and s.time = x.time and sc.center = p_center and sc.hidden_at is null) then continue; end if;
    v_ok := v_ok || jsonb_build_object('day', x.day, 'time', x.time, 'sid', v_sid);
  end loop;
  if jsonb_array_length(v_ok) = 0 then return jsonb_build_object('result', 'none', 'no_post', v_no_post); end if;

  -- x 칸은 x를 풀고, 그 글에 시간을 더한다
  delete from board_cells b using jsonb_array_elements(v_ok) e
  where b.center = p_center and b.teacher_id = v_tid and b.day = (e->>'day')::date and b.time = e->>'time' and b.side = 'open' and b.status in ('off', 'none');
  insert into slots (schedule_id, teacher_id, day, time)
  select (e->>'sid')::uuid, v_tid, (e->>'day')::date, e->>'time' from jsonb_array_elements(v_ok) e
  on conflict (schedule_id, teacher_id, day, time) do nothing;

  -- 보호자 — 시간이 더해진 글마다, 그 센터에 승인된 보호자(번호 있는)에게 스케줄 수정 알림 (글마다 한 묶음)
  for g in select distinct (e->>'sid')::uuid as sid from jsonb_array_elements(v_ok) e loop
    v_batch := gen_random_uuid();
    insert into outbox_messages (template_id, ref_id, child_id, user_id, child_name, phone, vars, batch_id)
    select 'schedule_updated', g.sid, ch.id, p.user_id, coalesce(ch.name, p.nickname), p.phone,
           jsonb_build_object('이름', coalesce(ch.name, p.nickname), '센터', case p_center when 'uijeongbu' then '의정부점' else '수색점' end,
                              '제목', (select title from schedules where id = g.sid), '날짜', to_char(v_today, 'YYYY/MM/DD'), '글번호', g.sid),
           v_batch
    from profiles p
    left join lateral (select c.id, c.name from children c where c.guardian_user_id = p.user_id order by (c.center = p_center) desc limit 1) ch on true
    where p.phone is not null and coalesce(p.nickname, '') <> ''
      and ((coalesce(p.center, 'eunpyeong') = p_center and p.approved_at is not null)
           or exists (select 1 from member_centers mc where mc.user_id = p.user_id and mc.center = p_center and mc.approved_at is not null));
    v_ids := v_ids || coalesce((select array_agg(id) from outbox_messages where batch_id = v_batch), '{}');
  end loop;

  select string_agg(to_char((e->>'day')::date, 'FMMM/FMDD') || '(' || v_dow[extract(dow from (e->>'day')::date)::int + 1] || ') ' || regexp_replace(e->>'time', '^0', ''), ', ' order by e->>'day', e->>'time')
    into v_detail from jsonb_array_elements(v_ok) e;
  v_ids := v_ids || public.teacher_admin_notice(p_center, v_name, '추가했어요', v_detail);

  return jsonb_build_object('result', 'ok', 'count', jsonb_array_length(v_ok), 'no_post', v_no_post, 'ids', to_jsonb(v_ids));
end;
$$;
revoke all on function public.teacher_post_slots(text, jsonb) from public, anon;
grant execute on function public.teacher_post_slots(text, jsonb) to authenticated;

-- 2) 내 빈타임 칸 x(수업 안 함) — 풀기는 없다(다시 열 땐 새 글로 올린다)
create or replace function public.teacher_set_open_off(p_center text, p_day date, p_time text, p_off boolean)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_tid uuid := public.my_teacher_id();
  v_name text;
  v_removed int := 0;
  v_ids uuid[] := '{}';
  v_dow text[] := array['일', '월', '화', '수', '목', '금', '토'];
  v_when text := to_char(p_day, 'FMMM/FMDD') || '(' || v_dow[extract(dow from p_day)::int + 1] || ') ' || regexp_replace(p_time, '^0', '');
begin
  if v_tid is null then return jsonb_build_object('result', 'not_teacher'); end if;
  if not p_off then return jsonb_build_object('result', 'no_unoff'); end if;
  if p_day < (now() at time zone 'Asia/Seoul')::date then return jsonb_build_object('result', 'past'); end if;
  select name into v_name from teachers where id = v_tid;
  if exists (select 1 from board_cells where center = p_center and day = p_day and teacher_id = v_tid and time = p_time and side = 'open' and status = 'off') then
    return jsonb_build_object('result', 'done');
  end if;
  if exists (select 1 from public.lessons_between(p_day, p_day) l
             where l.teacher_id = v_tid and l.lesson_time = p_time and l.center = p_center and l.side = 'open'
               and l.status in ('child', 'cancel_requested', 'undecided')) then
    return jsonb_build_object('result', 'busy');
  end if;
  -- 게시 중인 시간 — 트리거가 글에서 빼기 전에 몇 개인지
  select count(*) into v_removed from slots s join schedules sc on sc.id = s.schedule_id
  where s.teacher_id = v_tid and s.day = p_day and s.time = p_time and s.booked_by is null and sc.center = p_center;
  insert into board_cells (center, day, teacher_id, time, side, status, child_id, name, payment, oral, absent, moved, note, updated_at)
  values (p_center, p_day, v_tid, p_time, 'open', 'off', null, null, '', false, false, false, null, now())
  on conflict (center, day, teacher_id, time, side) do update
    set status = 'off', child_id = null, name = null, absent = false, moved = false, updated_at = now();
  -- 관리자에게는 늘 — 게시 중이던 시간이면 '내렸어요', 아니면 'x로 바꿨어요' (보호자에게는 안 간다)
  v_ids := v_ids || public.teacher_admin_notice(p_center, v_name, case when v_removed > 0 then '내렸어요' else 'x(수업 안 함)로 바꿨어요' end, v_when);
  return jsonb_build_object('result', 'ok', 'removed', v_removed, 'ids', to_jsonb(v_ids));
end;
$$;
revoke all on function public.teacher_set_open_off(text, date, text, boolean) from public, anon;
grant execute on function public.teacher_set_open_off(text, date, text, boolean) to authenticated;

-- 3) 시간표 빈타임 칸이 막히면(x · ? · 아이) 아직 신청 안 된 게시 시간을 글에서 뺀다 — 관리자 시간표 관리에서 바꿔도 같다
create or replace function public.board_cells_unpost_slots()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.side = 'open' and new.status in ('off', 'undecided', 'child') then
    delete from slots s using schedules sc
    where sc.id = s.schedule_id and sc.center = new.center
      and s.teacher_id = new.teacher_id and s.day = new.day and s.time = new.time and s.booked_by is null;
  end if;
  return null;
end;
$$;
drop trigger if exists board_cells_unpost_slots on board_cells;
create trigger board_cells_unpost_slots after insert or update of status on board_cells
  for each row execute function public.board_cells_unpost_slots();

-- 5) 선생님이 만든 보낼 알림 — 보내기 · 결과 적기 (만든 지 30분 안, 아직 안 보낸 것만)
drop function if exists public.teacher_outbox_rows(uuid[]);
create function public.teacher_outbox_rows(p_ids uuid[])
returns table (id uuid, template_id text, solapi_id text, phone text, vars jsonb)
language sql stable security definer set search_path = public
as $$
  select o.id, o.template_id, a.template_id, o.phone, o.vars
  from outbox_messages o left join alimtalk_templates a on a.id = o.template_id
  where o.id = any(p_ids) and o.created_by = auth.uid() and o.status = 'pending' and o.created_at > now() - interval '30 minutes';
$$;
revoke all on function public.teacher_outbox_rows(uuid[]) from public, anon;
grant execute on function public.teacher_outbox_rows(uuid[]) to authenticated;

create or replace function public.teacher_mark_outbox(p_id uuid, p_status text, p_error text)
returns void language sql security definer set search_path = public
as $$
  update outbox_messages
  set status = p_status, error = p_error, sent_at = case when p_status = 'sent' then now() else sent_at end
  where id = p_id and created_by = auth.uid() and p_status in ('pending', 'sent', 'failed', 'skipped');
$$;
revoke all on function public.teacher_mark_outbox(uuid, text, text) from public, anon;
grant execute on function public.teacher_mark_outbox(uuid, text, text) to authenticated;

-- 수업스케쥴 화면의 실시간 — 칸이 지워질 때도 어느 글의 칸인지 알 수 있게
alter table slots replica identity full;

select 'ok' as result;
