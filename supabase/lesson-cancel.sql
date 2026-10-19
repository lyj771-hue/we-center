-- WE 소아재활센터 — 마이페이지에서 보호자가 수업 바로 취소 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다(먼저 돌린 적 있어도 다시 돌리면 된다).
--
-- 마이페이지 주별 시간표의 [취소] — 내 아이 수업이고 수업 시작 전(한국 시간)이면 바로 취소한다(관리자 승인 없음).
--   모든 수업(고정·관리자가 넣은 칸·보호자 신청): 그날 칸을 "줄 + 취소"로 (board_cells, moved = true, 메모 "취소 · 보호자")
--     → 수업·결제·회차에서 빠지고, 관리자가 시간표에서 그 칸을 빈칸으로 바꾸거나 다른 아이를 넣을 수 있다
--   보호자 신청이면 신청도 취소 상태로(slots.cancel_state = 'approved') — 다른 보호자가 바로 신청하지는 못한다(관리자가 정함)
--   확정 안 된 결제는 지운다
--   취소 기록(lesson_cancels) · 관리자 알림(admin_alerts, kind = lesson_cancel) · 보낼 알림(outbox_messages)을 남긴다:
--     관리자에게 늘 (lesson_cancel_admin — 받는 번호는 발송할 때 관리자 번호로)
--     수업 2시간 전보다 늦은 취소면 보호자에게도 (lesson_cancel_late — "다음부터는 최소 2시간 전에")
-- 결과: ok / ok_late(2시간 안 남았을 때) / no_login / not_found(내 수업이 아니거나 이미 취소·결석) / too_late(이미 시작함)

-- 보낼 알림 표 (teacher-leave.sql 과 같은 것 — 아직 안 돌렸어도 되게)
create table if not exists outbox_messages (
  id uuid primary key default gen_random_uuid(),
  template_id text not null,
  ref_id uuid,
  child_id uuid references children (id) on delete set null,
  user_id uuid,
  child_name text,
  phone text,
  vars jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
alter table outbox_messages enable row level security;
drop policy if exists "admin all outbox_messages" on outbox_messages;
create policy "admin all outbox_messages" on outbox_messages for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists lesson_cancels (
  id uuid primary key default gen_random_uuid(),
  child_id uuid references children (id) on delete set null,
  day date not null,
  time text not null,
  teacher_id uuid references teachers (id) on delete set null,
  center text,
  side text,
  source text,
  user_id uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table lesson_cancels add column if not exists child_name text;
alter table lesson_cancels add column if not exists minutes_before int;     -- 취소한 때 수업까지 남은 분
alter table lesson_cancels add column if not exists late boolean not null default false;   -- 2시간 안 남았을 때
alter table lesson_cancels enable row level security;
drop policy if exists "admin all lesson_cancels" on lesson_cancels;
create policy "admin all lesson_cancels" on lesson_cancels for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.cancel_my_lesson(p_day date, p_time text, p_teacher uuid, p_side text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  l record;
  v_kind text;
  v_now timestamp := now() at time zone 'Asia/Seoul';
  v_min int;
  v_late boolean;
  v_id uuid;
  v_teacher text;
  v_name text;
  v_phone text;
  v_vars jsonb;
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
  v_late := v_min < 120;

  -- 그날 칸을 줄 + 취소로 (수업 종류는 그날 칸 → 그 요일 고정 수업에서)
  select f.kind into v_kind from fixed_lessons f
  where f.teacher_id = p_teacher and f.time = p_time and f.center = l.center
    and f.weekday = extract(dow from p_day)::int and f.start_date <= p_day
  order by f.start_date desc limit 1;
  insert into board_cells (center, day, teacher_id, time, side, status, child_id, name, payment, oral, kind, absent, moved, note, updated_at)
  values (l.center, p_day, p_teacher, p_time, p_side, 'child', l.child_id, l.name, coalesce(l.payment, ''), coalesce(l.oral, false), v_kind, false, true, '취소 · 보호자', now())
  on conflict (center, day, teacher_id, time, side) do update
    set status = 'child', child_id = excluded.child_id, name = excluded.name, payment = excluded.payment, oral = excluded.oral,
        kind = coalesce(board_cells.kind, excluded.kind), absent = false, moved = true, note = excluded.note, updated_at = now();

  if l.source = 'booking' then
    update slots set cancel_state = 'approved'
    where day = p_day and time = p_time and teacher_id = p_teacher and booked_by = auth.uid();
  end if;

  if l.child_id is not null then
    delete from lesson_payments where child_id = l.child_id and day = p_day and time = p_time and not confirmed;
  end if;

  -- 기록
  select name into v_teacher from teachers where id = p_teacher;
  select coalesce(c.name, l.name) into v_name from (select 1) z left join children c on c.id = l.child_id;
  insert into lesson_cancels (child_id, child_name, day, time, teacher_id, center, side, source, minutes_before, late)
  values (l.child_id, v_name, p_day, p_time, p_teacher, l.center, p_side, l.source, v_min, v_late)
  returning id into v_id;

  -- 보낼 알림
  v_vars := jsonb_build_object(
    '이름', v_name,
    '날짜', to_char(p_day, 'YYYY/MM/DD'),
    '월일', to_char(p_day, 'FMMM/FMDD'),
    '요일', v_dow[extract(dow from p_day)::int + 1],
    '시간', regexp_replace(p_time, '^0', ''),
    '선생님', v_teacher,
    '센터', case l.center when 'uijeongbu' then '의정부점' else '은평점' end,
    '남은시간', case when v_min >= 60 then (v_min / 60) || '시간 ' || (v_min % 60) || '분' else v_min || '분' end
  );
  insert into outbox_messages (template_id, ref_id, child_id, user_id, child_name, phone, vars)
  values ('lesson_cancel_admin', v_id, l.child_id, null, '관리자', null, v_vars);
  if v_late then
    select phone into v_phone from profiles where user_id = auth.uid();
    insert into outbox_messages (template_id, ref_id, child_id, user_id, child_name, phone, vars, status, error)
    values ('lesson_cancel_late', v_id, l.child_id, auth.uid(), v_name, v_phone, v_vars,
            case when v_phone is null then 'skipped' else 'pending' end, case when v_phone is null then '보호자 번호 없음' end);
  end if;

  -- 관리자 알림 (admin-alerts.sql 을 돌린 뒤에만 표가 있다) — 관리자 띠 '알림'에 빨간 숫자
  if to_regclass('public.admin_alerts') is not null then
    execute 'insert into admin_alerts (kind, center, title, detail, user_id) values ($1, $2, $3, $4, $5)'
    using 'lesson_cancel', coalesce(l.center, 'eunpyeong'),
          v_name || ' 수업 취소' || case when v_late then ' (늦은 취소)' else '' end,
          (v_vars->>'월일') || '(' || (v_vars->>'요일') || ') ' || (v_vars->>'시간') || ' ' || v_teacher || ' 선생님 · 수업 ' || (v_vars->>'남은시간') || ' 전',
          auth.uid();
  end if;

  return case when v_late then 'ok_late' else 'ok' end;
end;
$$;
revoke all on function public.cancel_my_lesson(date, text, uuid, text) from public, anon;
grant execute on function public.cancel_my_lesson(date, text, uuid, text) to authenticated;
