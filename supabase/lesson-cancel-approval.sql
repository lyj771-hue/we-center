-- WE 소아재활센터 — 마이페이지 수업 취소를 "신청 → 관리자 승인"으로 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
-- lesson-cancel.sql 을 먼저 돌린 뒤에 돌린다 (lesson_cancels · outbox_messages 표).
--
-- 보호자 [취소] (cancel_my_lesson) — 이제 바로 취소하지 않고 취소 신청만 남긴다(lesson_cancels.status = 'requested').
--   수업은 그대로, 마이페이지에 "취소 신청 중". 관리자 알림(admin_alerts, kind = lesson_cancel)에 한 줄.
--   신청한 때 수업까지 2시간이 안 남았으면 late = true (늦은 취소 — 승인 때 이 값으로 알림 종류를 고른다).
-- 보호자 [철회] (withdraw_my_lesson_cancel) — 아직 승인 안 된 신청을 지운다.
-- 관리자 [승인] (decide_lesson_cancel(id, true)) — 그날 칸을 "줄 + 취소 · 보호자"로(예전 바로 취소와 같다) + 보낼 알림 두 줄:
--     관리자에게 lesson_cancel_admin (받는 번호는 보낼 때 Vercel 환경 변수 ALIMTALK_ADMIN_PHONE)
--     보호자에게 늦은 취소면 lesson_cancel_late, 아니면 booking_result(신청결과 = 취소)
--   결과 { result: 'ok' | 'not_found' | 'done', ids: [보낼 알림 id …] } — 화면이 ids 를 바로 보낸다(/api/alimtalk/send).
-- 관리자 [거절] (decide_lesson_cancel(id, false)) — 신청만 거절로. 수업 그대로, 알림 없음.

alter table lesson_cancels add column if not exists status text not null default 'approved';
alter table lesson_cancels drop constraint if exists lesson_cancels_status_check;
alter table lesson_cancels add constraint lesson_cancels_status_check check (status in ('requested', 'approved', 'rejected'));
alter table lesson_cancels add column if not exists decided_at timestamptz;
create unique index if not exists lesson_cancels_one_request on lesson_cancels (day, time, teacher_id, side) where status = 'requested';

-- 보호자 [취소] → 취소 신청
create or replace function public.cancel_my_lesson(p_day date, p_time text, p_teacher uuid, p_side text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  l record;
  v_now timestamp := now() at time zone 'Asia/Seoul';
  v_min int;
  v_late boolean;
  v_teacher text;
  v_name text;
  v_dow text[] := array['일', '월', '화', '수', '목', '금', '토'];
begin
  if auth.uid() is null then
    return 'no_login';
  end if;
  select * into l from public.lessons_between(p_day, p_day) x
  where x.teacher_id = p_teacher and x.lesson_time = p_time and x.side = p_side
    and x.guardian_user_id = auth.uid()
    and x.status in ('child', 'cancel_requested') and not x.moved and not x.absent
  limit 1;
  if not found then
    return 'not_found';
  end if;
  v_min := floor(extract(epoch from ((p_day + p_time::time) - v_now)) / 60)::int;
  if v_min <= 0 then
    return 'too_late';
  end if;
  if exists (select 1 from lesson_cancels where day = p_day and time = p_time and teacher_id = p_teacher and side = p_side and status = 'requested') then
    return 'already';
  end if;
  v_late := v_min < 120;

  select name into v_teacher from teachers where id = p_teacher;
  select coalesce(c.name, l.name) into v_name from (select 1) z left join children c on c.id = l.child_id;
  insert into lesson_cancels (child_id, child_name, day, time, teacher_id, center, side, source, minutes_before, late, status)
  values (l.child_id, v_name, p_day, p_time, p_teacher, l.center, p_side, l.source, v_min, v_late, 'requested');

  if to_regclass('public.admin_alerts') is not null then
    execute 'insert into admin_alerts (kind, center, title, detail, user_id) values ($1, $2, $3, $4, $5)'
    using 'lesson_cancel', coalesce(l.center, 'eunpyeong'),
          v_name || ' 수업 취소 신청' || case when v_late then ' (늦은 취소)' else '' end,
          to_char(p_day, 'FMMM/FMDD') || '(' || v_dow[extract(dow from p_day)::int + 1] || ') ' || regexp_replace(p_time, '^0', '') || ' '
            || coalesce(v_teacher, '') || ' 선생님 · 수업 '
            || case when v_min >= 60 then (v_min / 60) || '시간 ' || (v_min % 60) || '분' else v_min || '분' end || ' 전',
          auth.uid();
  end if;

  return case when v_late then 'ok_late' else 'ok' end;
end;
$$;
revoke all on function public.cancel_my_lesson(date, text, uuid, text) from public, anon;
grant execute on function public.cancel_my_lesson(date, text, uuid, text) to authenticated;

-- 보호자 — 내 취소 신청(승인 기다리는 것)
create or replace function public.my_cancel_requests()
returns table (day date, lesson_time text, teacher_id uuid, side text)
language sql
security definer
set search_path = public
stable
as $$
  select c.day, c.time, c.teacher_id, c.side from lesson_cancels c
  where c.user_id = auth.uid() and c.status = 'requested'
    and c.day >= (now() at time zone 'Asia/Seoul')::date - 1;
$$;
revoke all on function public.my_cancel_requests() from public, anon;
grant execute on function public.my_cancel_requests() to authenticated;

-- 보호자 [철회]
create or replace function public.withdraw_my_lesson_cancel(p_day date, p_time text, p_teacher uuid, p_side text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_center text;
begin
  delete from lesson_cancels
  where user_id = auth.uid() and status = 'requested' and day = p_day and time = p_time and teacher_id = p_teacher and side = p_side
  returning child_name, center into v_name, v_center;
  if not found then
    return 'not_found';
  end if;
  if to_regclass('public.admin_alerts') is not null then
    execute 'insert into admin_alerts (kind, center, title, detail, user_id) values ($1, $2, $3, $4, $5)'
    using 'cancel_withdraw', coalesce(v_center, 'eunpyeong'), coalesce(v_name, '') || ' 수업 취소 신청 철회',
          to_char(p_day, 'FMMM/FMDD') || ' ' || regexp_replace(p_time, '^0', ''), auth.uid();
  end if;
  return 'ok';
end;
$$;
revoke all on function public.withdraw_my_lesson_cancel(date, text, uuid, text) from public, anon;
grant execute on function public.withdraw_my_lesson_cancel(date, text, uuid, text) to authenticated;

-- 관리자 [승인] / [거절]
create or replace function public.decide_lesson_cancel(p_id uuid, p_approve boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  l record;
  v_kind text;
  v_teacher text;
  v_phone text;
  v_vars jsonb;
  v_ids uuid[] := '{}';
  v_out uuid;
  v_dow text[] := array['일', '월', '화', '수', '목', '금', '토'];
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;
  select * into r from lesson_cancels where id = p_id for update;
  if not found or r.status <> 'requested' then
    return jsonb_build_object('result', 'done', 'ids', '[]'::jsonb);
  end if;
  if not p_approve then
    update lesson_cancels set status = 'rejected', decided_at = now() where id = p_id;
    return jsonb_build_object('result', 'ok', 'ids', '[]'::jsonb);
  end if;

  select * into l from public.lessons_between(r.day, r.day) x
  where x.teacher_id = r.teacher_id and x.lesson_time = r.time and x.side = r.side
    and x.guardian_user_id = r.user_id
    and x.status in ('child', 'cancel_requested') and not x.moved and not x.absent
  limit 1;
  if not found then
    return jsonb_build_object('result', 'not_found', 'ids', '[]'::jsonb);
  end if;

  -- 그날 칸을 줄 + 취소로 (예전 바로 취소와 같다)
  select f.kind into v_kind from fixed_lessons f
  where f.teacher_id = r.teacher_id and f.time = r.time and f.center = l.center
    and f.weekday = extract(dow from r.day)::int and f.start_date <= r.day
  order by f.start_date desc limit 1;
  insert into board_cells (center, day, teacher_id, time, side, status, child_id, name, payment, oral, kind, absent, moved, note, updated_at)
  values (l.center, r.day, r.teacher_id, r.time, r.side, 'child', l.child_id, l.name, coalesce(l.payment, ''), coalesce(l.oral, false), v_kind, false, true, '취소 · 보호자', now())
  on conflict (center, day, teacher_id, time, side) do update
    set status = 'child', child_id = excluded.child_id, name = excluded.name, payment = excluded.payment, oral = excluded.oral,
        kind = coalesce(board_cells.kind, excluded.kind), absent = false, moved = true, note = excluded.note, updated_at = now();
  if l.source = 'booking' then
    update slots set cancel_state = 'approved'
    where day = r.day and time = r.time and teacher_id = r.teacher_id and booked_by = r.user_id;
  end if;
  if l.child_id is not null then
    delete from lesson_payments where child_id = l.child_id and day = r.day and time = r.time and not confirmed;
  end if;
  update lesson_cancels set status = 'approved', decided_at = now() where id = p_id;

  -- 보낼 알림
  select name into v_teacher from teachers where id = r.teacher_id;
  v_vars := jsonb_build_object(
    '이름', r.child_name,
    '날짜', to_char(r.day, 'YYYY/MM/DD'),
    '월일', to_char(r.day, 'FMMM/FMDD'),
    '요일', v_dow[extract(dow from r.day)::int + 1],
    '시간', regexp_replace(r.time, '^0', ''),
    '선생님', v_teacher,
    '센터', case l.center when 'uijeongbu' then '의정부점' else '은평점' end,
    '남은시간', case when r.minutes_before >= 60 then (r.minutes_before / 60) || '시간 ' || (r.minutes_before % 60) || '분' else r.minutes_before || '분' end,
    '신청결과', '취소'
  );
  insert into outbox_messages (template_id, ref_id, child_id, user_id, child_name, phone, vars)
  values ('lesson_cancel_admin', r.id, r.child_id, null, '관리자', null, v_vars)
  returning id into v_out;
  v_ids := v_ids || v_out;
  select phone into v_phone from profiles where user_id = r.user_id;
  insert into outbox_messages (template_id, ref_id, child_id, user_id, child_name, phone, vars)
  values (case when r.late then 'lesson_cancel_late' else 'booking_result' end, r.id, r.child_id, r.user_id, r.child_name, v_phone, v_vars)
  returning id into v_out;
  v_ids := v_ids || v_out;

  return jsonb_build_object('result', 'ok', 'ids', to_jsonb(v_ids));
end;
$$;
revoke all on function public.decide_lesson_cancel(uuid, boolean) from public, anon;
grant execute on function public.decide_lesson_cancel(uuid, boolean) to authenticated;

select 'ok' as result;
