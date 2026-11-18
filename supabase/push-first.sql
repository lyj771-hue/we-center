-- WE 소아재활센터 — 알림은 앱 푸시 먼저, 앱 푸시가 안 갈 때만 알림톡 (2026-11-17)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
-- (push.sql · schedule-reserve.sql(cron_ok) · teacher-schedule-post.sql(created_by) 다음에)
--
-- outbox_messages 에 칸 셋:
--   channel    — 실제로 간 길: push(앱 푸시) / alimtalk(앱 푸시가 안 가서 알림톡으로)
--   push_error — 앱 푸시가 안 간 이유 (예: 앱 알림을 켜지 않았어요)
--   push_at    — 앱 푸시를 시도한 때
-- outbox_delivery     : 보낼 알림 줄마다 받는 사람의 앱 푸시 기기 목록 (서버만 쓴다)
-- outbox_mark_push    : 앱 푸시 결과 적기 (성공하면 그 줄은 '보냄')
-- notification_templates : 알림 모양(message_templates) — 앱 알림 내역·푸시 글을 만들 때
-- my_notifications · my_unread_notifications · mark_my_notifications_read : 앱 🔔 알림 내역

alter table outbox_messages add column if not exists channel text;
alter table outbox_messages add column if not exists push_error text;
alter table outbox_messages add column if not exists push_at timestamptz;
create index if not exists outbox_messages_user on outbox_messages (user_id, created_at desc);
create index if not exists outbox_messages_channel on outbox_messages (channel, created_at desc);

-- 이 줄을 다룰 수 있는 사람: 관리자 · 서버 예약 작업(비밀 글자) · 받는 본인 · 그 줄을 만든 사람(선생님)
create or replace function public.outbox_can(p_id uuid, p_secret text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_admin() or public.cron_ok(p_secret)
      or exists (select 1 from outbox_messages o where o.id = p_id and (o.user_id = auth.uid() or o.created_by = auth.uid()));
$$;
revoke all on function public.outbox_can(uuid, text) from public, anon, authenticated;

-- 관리자에게 가는 알림(받는 계정 없음)은 관리자 계정들의 기기로
create or replace function public.outbox_delivery(p_ids uuid[], p_secret text default null)
returns table (id uuid, user_id uuid, template_id text, vars jsonb, subs jsonb)
language sql stable security definer set search_path = public
as $$
  select o.id, o.user_id, o.template_id, o.vars,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
      from push_subscriptions s
      where (o.user_id is not null and s.user_id = o.user_id)
         or (o.user_id is null and o.template_id ~ '_admin(_\d+)?$' and s.user_id in (select a.user_id from admins a))
    ), '[]'::jsonb)
  from outbox_messages o
  where o.id = any(p_ids) and public.outbox_can(o.id, p_secret);
$$;
revoke all on function public.outbox_delivery(uuid[], text) from public;
grant execute on function public.outbox_delivery(uuid[], text) to anon, authenticated;

-- p_ok = 기기 하나라도 받았으면 true → 그 줄은 '보냄'(앱 푸시). 아니면 이유만 적고 알림톡으로 넘긴다.
-- p_gone = 앱을 지웠거나 알림을 끈 기기(404·410) — 지운다
create or replace function public.outbox_mark_push(p_id uuid, p_ok boolean, p_push_error text, p_gone uuid[] default '{}', p_secret text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_user uuid;
begin
  if not public.outbox_can(p_id, p_secret) then return; end if;
  select o.user_id into v_user from outbox_messages o where o.id = p_id;
  if coalesce(array_length(p_gone, 1), 0) > 0 then
    delete from push_subscriptions s
    where s.id = any(p_gone) and (s.user_id = v_user or (v_user is null and s.user_id in (select a.user_id from admins a)));
  end if;
  if p_ok then
    update outbox_messages set channel = 'push', push_error = null, push_at = now(),
      status = 'sent', error = null, sent_at = now()
    where id = p_id;
  else
    update outbox_messages set channel = 'alimtalk', push_error = left(p_push_error, 300), push_at = now()
    where id = p_id;
  end if;
end;
$$;
revoke all on function public.outbox_mark_push(uuid, boolean, text, uuid[], text) from public;
grant execute on function public.outbox_mark_push(uuid, boolean, text, uuid[], text) to anon, authenticated;

-- 알림 모양 — 내용은 비밀이 아니라 누구나 읽는다(앱 알림 내역에서 글로 펼친다)
create or replace function public.notification_templates()
returns table (id text, grp text, label text, body text, condition text, sort int, updated_at timestamptz)
language sql stable security definer set search_path = public
as $$ select t.id, t.grp, t.label, t.body, t.condition, t.sort, t.updated_at from message_templates t; $$;
revoke all on function public.notification_templates() from public;
grant execute on function public.notification_templates() to anon, authenticated;

-- ── 앱 🔔 알림 내역 ─────────────────────────────────────────────
create table if not exists notification_seen (
  user_id uuid primary key default auth.uid(),
  seen_at timestamptz not null default now()
);
alter table notification_seen enable row level security;
drop policy if exists "own notification_seen" on notification_seen;
create policy "own notification_seen" on notification_seen for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 나에게 온 알림 — 보낸 알림(앱 푸시든 알림톡이든 '보냄') + 관리자가 직접 보낸 앱 푸시(push_log, 받는 사람에 내가 들면)
create or replace function public.my_notifications(p_limit int default 100)
returns table (id uuid, kind text, template_id text, vars jsonb, title text, body text, url text, created_at timestamptz)
language sql stable security definer set search_path = public
as $$
  with me as (
    select auth.uid() as uid,
      exists (select 1 from teacher_logins t where t.user_id = auth.uid()) as is_teacher,
      exists (select 1 from admins a where a.user_id = auth.uid()) as is_admin
  ), my_centers as (
    select coalesce(p.center, 'eunpyeong') as c from profiles p, me where p.user_id = me.uid and p.approved_at is not null
    union select m.center from member_centers m, me where m.user_id = me.uid and m.approved_at is not null
  )
  select * from (
    select o.id as nid, 'outbox'::text as nkind, o.template_id as ntpl, o.vars as nvars,
      null::text as ntitle, null::text as nbody, null::text as nurl, coalesce(o.sent_at, o.created_at) as nat
    from outbox_messages o, me
    where o.status = 'sent'
      and (o.user_id = me.uid or (me.is_admin and o.user_id is null and o.template_id ~ '_admin(_\d+)?$'))
    union all
    select l.id, 'manual', null, null, l.title, l.body, l.url, l.created_at
    from push_log l, me
    where l.sent > 0 and (
      l.target = 'all' or l.target = 'user:' || me.uid::text
      or (l.target = 'teachers' and me.is_teacher)
      or l.target in (select c from my_centers)
    )
  ) x
  order by x.nat desc
  limit greatest(1, least(p_limit, 300));
$$;
revoke all on function public.my_notifications(int) from public, anon;
grant execute on function public.my_notifications(int) to authenticated;

create or replace function public.my_unread_notifications()
returns int
language sql stable security definer set search_path = public
as $$
  select count(*)::int from public.my_notifications(300) n
  where n.created_at > coalesce((select s.seen_at from notification_seen s where s.user_id = auth.uid()), '-infinity'::timestamptz);
$$;
revoke all on function public.my_unread_notifications() from public, anon;
grant execute on function public.my_unread_notifications() to authenticated;

create or replace function public.mark_my_notifications_read()
returns void
language sql security definer set search_path = public
as $$
  insert into notification_seen (user_id, seen_at) values (auth.uid(), now())
  on conflict (user_id) do update set seen_at = now();
$$;
revoke all on function public.mark_my_notifications_read() from public, anon;
grant execute on function public.mark_my_notifications_read() to authenticated;

-- ── 스케줄 게시 예정 알림 — 번호 없는 보호자도 받는다(앱 푸시) ─────────────
-- (schedule-reserve-title.sql 의 cron_schedule_prealert 에서 '번호 있는 보호자만' 조건만 뺐다)
drop function if exists public.cron_schedule_prealert(text);
create function public.cron_schedule_prealert(p_secret text)
returns table (id uuid, template_id text, solapi_id text, phone text, vars jsonb)
language plpgsql security definer set search_path = public
as $$
#variable_conflict use_column
declare
  sc record;
  v_when text;
  v_batch uuid;
  v_dow text[] := array['일', '월', '화', '수', '목', '금', '토'];
begin
  if not public.cron_ok(p_secret) then
    return;
  end if;
  for sc in
    select s.* from schedules s
    where s.publish_at is not null and s.prealert_at is null and s.hidden_at is null
      and s.publish_at <= now() + interval '5 minutes' and s.publish_at > now() - interval '30 minutes'
    for update skip locked
  loop
    update schedules set prealert_at = now() where schedules.id = sc.id;
    v_batch := gen_random_uuid();
    v_when := to_char(sc.publish_at at time zone 'Asia/Seoul', 'YYYY/MM/DD') || '('
              || v_dow[extract(dow from sc.publish_at at time zone 'Asia/Seoul')::int + 1] || ') '
              || to_char(sc.publish_at at time zone 'Asia/Seoul', 'HH24:MI');
    insert into outbox_messages (template_id, ref_id, child_id, user_id, child_name, phone, vars, batch_id)
    select 'schedule_reserved', sc.id, ch.id, p.user_id, coalesce(ch.name, p.nickname), p.phone,
           jsonb_build_object('이름', coalesce(ch.name, p.nickname), '센터', case sc.center when 'uijeongbu' then '의정부점' else '수색점' end,
                              '기간', case when sc.days is null then '다음주' else '공휴일' end,
                              '제목', sc.title, '게시시간', v_when, '글번호', sc.id),
           v_batch
    from profiles p
    left join lateral (select c.id, c.name from children c where c.guardian_user_id = p.user_id order by (c.center = sc.center) desc limit 1) ch on true
    where coalesce(p.nickname, '') <> ''   -- 번호가 없어도 — 앱 푸시로 간다
      and ((coalesce(p.center, 'eunpyeong') = sc.center and p.approved_at is not null)
           or exists (select 1 from member_centers mc where mc.user_id = p.user_id and mc.center = sc.center and mc.approved_at is not null));
  end loop;

  return query
    select o.id, o.template_id, a.template_id, o.phone, o.vars
    from outbox_messages o left join alimtalk_templates a on a.id = o.template_id
    where o.template_id = 'schedule_reserved' and o.status = 'pending' and o.error is null
      and o.created_at > now() - interval '10 minutes';
end;
$$;
revoke all on function public.cron_schedule_prealert(text) from public;
grant execute on function public.cron_schedule_prealert(text) to anon, authenticated;

-- 확인: 칸 3개가 생겼으면 3
select count(*) as 칸 from information_schema.columns
where table_name = 'outbox_messages' and column_name in ('channel', 'push_error', 'push_at');
