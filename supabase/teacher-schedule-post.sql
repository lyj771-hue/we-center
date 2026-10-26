-- WE 소아재활센터 — 선생님이 수업스케쥴 게시글에서 내 시간 내리기 · 더하기 (2026-10-26)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
-- teacher-read-schedules.sql · admin-alerts.sql · teacher-login.sql 을 먼저 돌린 뒤에.
--
-- schedule_slot_owners — 선생님도 관리자처럼 칸마다 누가 신청했는지 본다(아이 이름, 없으면 닉네임).
-- teacher_remove_slots — 게시글에서 내 시간 여러 개 내리기(시간표 빈타임 칸은 x가 된다, 쉬는 시간은 다시 쉬는 시간). 그 사이 신청된 시간이 하나라도 있으면 하나도 안 내리고 그 시간들을 돌려준다.
--                        보호자 알림 없음, 관리자에게 '선생님 빈 수업 변경 알림'(내렸어요).
-- teacher_add_slots    — 게시글 기간의 그날, 내 빈타임이 비어 있거나 x인 시간을 게시글에 더한다(x는 풀림). 수업 시작까지 1시간 넘게 남은 시간만.
--                        보호자에게 '스케줄 수정 알림'(schedule_updated, 한 묶음), 관리자에게 '선생님 빈 수업 변경 알림'(추가했어요).
-- teacher_outbox_rows · teacher_mark_outbox — 선생님이 만든 보낼 알림을 /api/alimtalk/teacher-send 가 보내고 결과를 적는다.

alter table outbox_messages add column if not exists batch_id uuid;
alter table outbox_messages add column if not exists created_by uuid default auth.uid();

create or replace function public.my_teacher_id()
returns uuid language sql stable security definer set search_path = public
as $$ select teacher_id from teacher_logins where user_id = auth.uid() limit 1 $$;
revoke all on function public.my_teacher_id() from public, anon;
grant execute on function public.my_teacher_id() to authenticated;

-- 그 날이 이 글의 기간인지 — 날짜를 고른 글(공휴일 등)은 그 날짜들, 아니면 그 주 월~토
create or replace function public.schedule_covers(p_days jsonb, p_week_start date, p_day date)
returns boolean language sql immutable
as $$
  select case when p_days is not null and jsonb_typeof(p_days) = 'array' and jsonb_array_length(p_days) > 0
              then p_days ? to_char(p_day, 'YYYY-MM-DD')
              else p_day between p_week_start and p_week_start + 5 end;
$$;

-- 빈타임 칸을 열 수 있는지 — 비어 있거나 x (?·아이는 안 됨), 고정 칸에 살아 있는 수업도 없어야 한다
create or replace function public.open_cell_free(p_teacher uuid, p_day date, p_time text, p_center text)
returns boolean language sql stable security definer set search_path = public
as $$
  select not exists (
    select 1 from public.lessons_between(p_day, p_day) l
    where l.teacher_id = p_teacher and l.lesson_time = p_time and l.center = p_center
      and ((l.side = 'open' and l.status in ('child', 'cancel_requested', 'undecided'))
        or (l.side = 'fixed' and l.status = 'child' and not l.moved and not l.absent))
  );
$$;
revoke all on function public.open_cell_free(uuid, date, text, text) from public, anon, authenticated;

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

-- 칸마다 신청한 사람 (관리자·선생님)
drop function if exists public.schedule_slot_owners(uuid);
create function public.schedule_slot_owners(p_schedule uuid)
returns table (slot_id uuid, name text)
language sql stable security definer set search_path = public
as $$
  select s.id, coalesce(ch.name, p.center_nickname, p.nickname, '신청됨')
  from slots s
  left join profiles p on p.user_id = s.booked_by
  left join lateral (select c.name from children c where c.guardian_user_id = s.booked_by limit 1) ch on true
  where s.schedule_id = p_schedule and s.booked_by is not null and (public.is_admin() or public.is_teacher());
$$;
revoke all on function public.schedule_slot_owners(uuid) from public, anon;
grant execute on function public.schedule_slot_owners(uuid) to authenticated;

-- 내 시간 내리기 — p_slots = 칸 id 들
create or replace function public.teacher_remove_slots(p_schedule uuid, p_slots uuid[])
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_tid uuid := public.my_teacher_id();
  v_name text;
  v_center text;
  v_booked jsonb;
  v_detail text;
  v_n int;
  v_dow text[] := array['일', '월', '화', '수', '목', '금', '토'];
begin
  if v_tid is null then return jsonb_build_object('result', 'not_teacher'); end if;
  select name into v_name from teachers where id = v_tid;
  select center into v_center from schedules where id = p_schedule;
  -- 그 사이 신청된 시간 — 하나라도 있으면 아무것도 안 내린다
  select coalesce(jsonb_agg(jsonb_build_object('slot_id', o.slot_id, 'name', o.name)), '[]'::jsonb) into v_booked
  from public.schedule_slot_owners(p_schedule) o where o.slot_id = any(p_slots);
  if jsonb_array_length(v_booked) > 0 then return jsonb_build_object('result', 'booked', 'booked', v_booked); end if;

  select string_agg(to_char(s.day, 'FMMM/FMDD') || '(' || v_dow[extract(dow from s.day)::int + 1] || ') ' || regexp_replace(s.time, '^0', ''), ', ' order by s.day, s.time)
    into v_detail from slots s where s.id = any(p_slots) and s.schedule_id = p_schedule and s.teacher_id = v_tid and s.booked_by is null;
  -- 내린 시간은 시간표 빈타임 칸을 x(수업 안 함)로 (그 칸에 다른 수업이 없을 때)
  insert into board_cells (center, day, teacher_id, time, side, status, child_id, name, payment, oral, absent, moved, note, updated_at)
  select coalesce(v_center, 'eunpyeong'), s.day, v_tid, s.time, 'open', 'off', null, null, '', false, false, false, null, now()
  from slots s
  where s.id = any(p_slots) and s.schedule_id = p_schedule and s.teacher_id = v_tid and s.booked_by is null
    and s.time not in ('12:20', '16:30')   -- 쉬는 시간(Lunch·쉬는 시간)은 x 대신 다시 쉬는 시간으로
    and not exists (select 1 from board_cells b where b.center = coalesce(v_center, 'eunpyeong') and b.day = s.day and b.teacher_id = v_tid
                      and b.time = s.time and b.side = 'open' and b.status in ('child', 'undecided'))
  on conflict (center, day, teacher_id, time, side) do update
    set status = 'off', child_id = null, name = null, absent = false, moved = false, updated_at = now();
  delete from slots s where s.id = any(p_slots) and s.schedule_id = p_schedule and s.teacher_id = v_tid and s.booked_by is null;
  get diagnostics v_n = row_count;
  if v_n = 0 then return jsonb_build_object('result', 'none'); end if;
  return jsonb_build_object('result', 'ok', 'count', v_n,
    'ids', jsonb_build_array(public.teacher_admin_notice(coalesce(v_center, 'eunpyeong'), v_name, '내렸어요', v_detail)));
end;
$$;
revoke all on function public.teacher_remove_slots(uuid, uuid[]) from public, anon;
grant execute on function public.teacher_remove_slots(uuid, uuid[]) to authenticated;

-- 내 시간 더하기 — p_times = [{"day":"2026-10-27","time":"15:40"}, …]
create or replace function public.teacher_add_slots(p_schedule uuid, p_times jsonb)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_tid uuid := public.my_teacher_id();
  v_name text;
  sc record;
  v_ok jsonb := '[]'::jsonb;
  v_batch uuid := gen_random_uuid();
  v_ids uuid[] := '{}';
  v_detail text;
  v_dow text[] := array['일', '월', '화', '수', '목', '금', '토'];
  x record;
begin
  if v_tid is null then return jsonb_build_object('result', 'not_teacher'); end if;
  select name into v_name from teachers where id = v_tid;
  select * into sc from schedules where id = p_schedule and hidden_at is null;
  if not found then return jsonb_build_object('result', 'no_post'); end if;

  for x in select distinct (e->>'day')::date as day, e->>'time' as time from jsonb_array_elements(p_times) e order by 1, 2 loop
    if not public.schedule_covers(sc.days, sc.week_start, x.day) then continue; end if;
    if (x.day + x.time::time) < (now() at time zone 'Asia/Seoul') + interval '1 hour' then continue; end if;
    if not public.open_cell_free(v_tid, x.day, x.time, sc.center) then continue; end if;
    if exists (select 1 from slots s where s.schedule_id = p_schedule and s.teacher_id = v_tid and s.day = x.day and s.time = x.time) then continue; end if;
    v_ok := v_ok || jsonb_build_object('day', x.day, 'time', x.time);
  end loop;
  if jsonb_array_length(v_ok) = 0 then return jsonb_build_object('result', 'none'); end if;

  -- x 칸은 풀고 게시글에 더한다
  delete from board_cells b using jsonb_array_elements(v_ok) e
  where b.center = sc.center and b.teacher_id = v_tid and b.day = (e->>'day')::date and b.time = e->>'time' and b.side = 'open' and b.status in ('off', 'none');
  insert into slots (schedule_id, teacher_id, day, time)
  select p_schedule, v_tid, (e->>'day')::date, e->>'time' from jsonb_array_elements(v_ok) e
  on conflict (schedule_id, teacher_id, day, time) do nothing;

  -- 보호자 — 그 센터에 승인된 보호자(번호 있는)에게 스케줄 수정 알림 (한 묶음)
  insert into outbox_messages (template_id, ref_id, child_id, user_id, child_name, phone, vars, batch_id)
  select 'schedule_updated', p_schedule, ch.id, p.user_id, coalesce(ch.name, p.nickname), p.phone,
         jsonb_build_object('이름', coalesce(ch.name, p.nickname), '센터', case sc.center when 'uijeongbu' then '의정부점' else '수색점' end,
                            '제목', sc.title, '날짜', to_char((now() at time zone 'Asia/Seoul')::date, 'YYYY/MM/DD'), '글번호', p_schedule),
         v_batch
  from profiles p
  left join lateral (select c.id, c.name from children c where c.guardian_user_id = p.user_id order by (c.center = sc.center) desc limit 1) ch on true
  where p.phone is not null and coalesce(p.nickname, '') <> ''
    and ((coalesce(p.center, 'eunpyeong') = sc.center and p.approved_at is not null)
         or exists (select 1 from member_centers mc where mc.user_id = p.user_id and mc.center = sc.center and mc.approved_at is not null));
  select coalesce(array_agg(id), '{}') into v_ids from outbox_messages where batch_id = v_batch;

  select string_agg(to_char((e->>'day')::date, 'FMMM/FMDD') || '(' || v_dow[extract(dow from (e->>'day')::date)::int + 1] || ') ' || regexp_replace(e->>'time', '^0', ''), ', ' order by e->>'day', e->>'time')
    into v_detail from jsonb_array_elements(v_ok) e;
  v_ids := v_ids || public.teacher_admin_notice(sc.center, v_name, '추가했어요', v_detail);
  return jsonb_build_object('result', 'ok', 'count', jsonb_array_length(v_ok), 'ids', to_jsonb(v_ids));
end;
$$;
revoke all on function public.teacher_add_slots(uuid, jsonb) from public, anon;
grant execute on function public.teacher_add_slots(uuid, jsonb) to authenticated;

-- 선생님이 만든 보낼 알림 — 보내기 · 결과 적기 (만든 지 30분 안, 아직 안 보낸 것만)
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

select 'ok' as result;
