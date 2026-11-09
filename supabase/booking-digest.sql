-- WE 소아재활센터 — 수업스케쥴 신청 '수업 확정' 알림톡을 매 정각에 모아서 보내기 (2026-11-09)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
-- (siblings.sql · schedule-reserve.sql(app_secrets · pg_cron · pg_net) 다음에)
--
-- 지금까지: 보호자가 수업을 하나 잡을 때마다 바로 '수업 확정'(booking_result) 알림톡.
-- 이제: 잡으면 알림을 만들어 두기만 하고(hold_until = 다음 정각), 매 정각에 아이마다 묶어서 한 번에 보낸다.
--   예) 3:04 에 하나, 3:56 에 하나 잡으면 → 4:00 에 '수업 확정 2건' 하나
--   · 그 사이 1건뿐이면 지금과 같은 '수업 확정' 알림(booking_result)으로
--   · 2건 이상이면 '수업 확정 모음 N건'(booking_digest_2 ~ 8) — 심사 올리기에서 통과해야 쓴다. 통과 전에는 정각에 한 건씩 보낸다
--   · 9건 넘으면 8건씩 나눠서
--   · 정각 전에 신청을 취소했으면 그 수업은 빼고 보낸다(안 보냄)
-- 관리자가 시간표에서 확정·취소하는 알림, 취소 알림은 지금처럼 바로 간다.

-- 1. 모아 둔 알림 — 이 시각이 지나면 보낸다 (null = 바로 보내는 알림)
alter table outbox_messages add column if not exists hold_until timestamptz;
create index if not exists outbox_messages_hold on outbox_messages (hold_until) where hold_until is not null and status = 'pending';

-- 2. 보호자가 신청하면 — 알림을 만들어 두기만 한다(다음 정각까지). 사이트(/api/alimtalk/booked)는 held 면 보내지 않는다
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
  -- 같은 신청에 두 번 만들지 않는다 — 이번에 잡은 뒤(booked_at 이후)에 만든 것만 본다. 취소했다가 다시 잡으면 다시 만든다
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
  insert into outbox_messages (template_id, ref_id, child_id, user_id, child_name, phone, vars, status, error, hold_until)
  values ('booking_result', p_slot, v_child.id, auth.uid(), coalesce(v_child.name, v_name, ''), v_phone, v_vars,
          case when v_phone is null then 'skipped' else 'pending' end,
          case when v_phone is null then '번호 없음' end,
          case when v_phone is not null then date_trunc('hour', now()) + interval '1 hour' end)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'held', true, 'phone', v_phone, 'vars', v_vars);
end;
$$;

-- 3. 매 정각 — 때가 된 알림을 아이마다 묶고, 이번에 보낼 줄을 돌려준다 (비밀 글자를 아는 서버 /api/cron/booking-digest 만)
drop function if exists public.cron_booking_digest(text);
create function public.cron_booking_digest(p_secret text)
returns table (id uuid, template_id text, solapi_id text, phone text, vars jsonb)
language plpgsql security definer set search_path = public
as $$
#variable_conflict use_column
declare
  g record;
  v_send uuid[] := '{}';
  v_ids uuid[];
  v_i int;
  v_n int;
  v_tid text;
  v_vars jsonb;
  v_first record;
  v_new uuid;
begin
  if not public.cron_ok(p_secret) then
    return;
  end if;

  -- 정각 전에 취소했거나 다른 사람 신청이 된 수업은 보내지 않는다
  update outbox_messages o set status = 'skipped', error = '보내기 전에 신청이 취소됐어요', hold_until = null
  where o.template_id = 'booking_result' and o.status = 'pending' and o.hold_until is not null and o.hold_until <= now()
    and not exists (select 1 from slots s where s.id = o.ref_id and s.booked_by = o.user_id and s.cancel_state is null);

  -- 아이(보호자)마다 날짜·시간 순으로 묶기
  for g in
    select o.user_id, o.child_id,
           array_agg(o.id order by o.vars->>'날짜', lpad(o.vars->>'시간', 5, '0')) as ids
    from outbox_messages o
    where o.template_id = 'booking_result' and o.status = 'pending' and o.hold_until is not null and o.hold_until <= now()
    group by o.user_id, o.child_id
  loop
    v_i := 1;
    while v_i <= array_length(g.ids, 1) loop
      v_n := least(8, array_length(g.ids, 1) - v_i + 1);
      v_ids := g.ids[v_i : v_i + v_n - 1];
      v_tid := null;
      if v_n >= 2 then
        select a.template_id into v_tid from alimtalk_templates a where a.id = 'booking_digest_' || v_n;
      end if;
      if v_tid is null then
        -- 1건이거나 모음 템플릿이 아직 없으면 — 지금 '수업 확정' 알림 그대로 한 건씩
        update outbox_messages set hold_until = null where outbox_messages.id = any(v_ids);
        v_send := v_send || v_ids;
      else
        -- 모음 한 건 — 수업1~N = "2026/11/10(화) 15:40 이정길" (날짜는 늘 년도까지)
        select o.child_name, o.phone, o.vars into v_first from outbox_messages o where o.id = v_ids[1];
        select jsonb_object_agg('수업' || x.n, (o.vars->>'날짜') || '(' || (o.vars->>'요일') || ') ' || (o.vars->>'시간') || ' ' || (o.vars->>'선생님'))
          into v_vars
        from unnest(v_ids) with ordinality as x(oid, n) join outbox_messages o on o.id = x.oid;
        v_vars := v_vars || jsonb_build_object('이름', v_first.vars->>'이름', '건수', v_n::text, '날짜', v_first.vars->>'날짜');
        insert into outbox_messages (template_id, ref_id, child_id, user_id, child_name, phone, vars, status)
        values ('booking_digest_' || v_n, v_ids[1], g.child_id, g.user_id, v_first.child_name, v_first.phone, v_vars, 'pending')
        returning outbox_messages.id into v_new;
        update outbox_messages set status = 'skipped', error = '수업 확정 모음으로 묶어 보냄', hold_until = null
        where outbox_messages.id = any(v_ids);
        v_send := v_send || v_new;
      end if;
      v_i := v_i + v_n;
    end loop;
  end loop;

  return query
    select o.id, o.template_id, a.template_id, o.phone, o.vars
    from outbox_messages o left join alimtalk_templates a on a.id = o.template_id
    where o.id = any(v_send);
end;
$$;
revoke all on function public.cron_booking_digest(text) from public;
grant execute on function public.cron_booking_digest(text) to anon, authenticated;

-- 보낸 결과 적기 (수업 확정·모음만)
create or replace function public.cron_mark_booking(p_secret text, p_id uuid, p_status text, p_error text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.cron_ok(p_secret) then
    return;
  end if;
  update outbox_messages
  set status = p_status, error = p_error, sent_at = case when p_status = 'sent' then now() else sent_at end
  where id = p_id and (template_id = 'booking_result' or template_id like 'booking_digest_%')
    and p_status in ('pending', 'sent', 'failed', 'skipped');
end;
$$;
revoke all on function public.cron_mark_booking(text, uuid, text, text) from public;
grant execute on function public.cron_mark_booking(text, uuid, text, text) to anon, authenticated;

-- 4. 매 정각 — 보낼 알림이 있을 때만 사이트를 부른다 (pg_cron + pg_net, 비밀 글자는 app_secrets 에서)
select cron.unschedule('we-booking-digest') where exists (select 1 from cron.job where jobname = 'we-booking-digest');
select cron.schedule('we-booking-digest', '0 * * * *', $cron$
  select net.http_post(
    url := 'https://we-center.vercel.app/api/cron/booking-digest',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'Authorization', 'Bearer ' || (select value from public.app_secrets where name = 'cron')),
    body := '{}'::jsonb
  )
  where exists (
    select 1 from public.outbox_messages o
    where o.template_id = 'booking_result' and o.status = 'pending' and o.hold_until is not null and o.hold_until <= now()
  );
$cron$);

select 'ok' as result;
