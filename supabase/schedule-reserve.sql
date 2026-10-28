-- WE 소아재활센터 — 수업스케쥴 예약 게시 · 게시 5분 전 알림톡 · 게시 후 10분 자유 취소 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
-- (__CRON_SECRET__ 자리는 실행 전에 아무도 모르는 긴 글자로 바꾼다 — 클로드가 바꿔서 복사해 준다)
--
-- publish_at  : 게시 시각. null 이면 만든 즉시 게시. 그 전에는 보호자에게 글·시간·신청 기록이 안 보이고 신청도 안 된다
-- free_cancel : 게시 후 10분 동안 보호자가 신청완료를 눌러 바로 취소(관리자 승인 없이). 10분이 지나면 취소·취소 신청 모두 안 된다
-- prealert_at : 게시 5분 전 '스케줄 게시 예정 알림'을 보낸 시각
-- 보호자 취소 신청(request_cancel)은 이제 받지 않는다 — 취소는 센터로 연락

-- 1. 칸
alter table schedules add column if not exists publish_at timestamptz;
alter table schedules add column if not exists free_cancel boolean not null default false;
alter table schedules add column if not exists prealert_at timestamptz;

-- 2. 게시됐는지
create or replace function public.schedule_published(p_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select s.publish_at is null or s.publish_at <= now() from schedules s where s.id = p_id), false);
$$;

-- 3. 게시 전 글은 관리자·선생님만 (원래 읽기 정책에 "그리고" 로 붙는다)
drop policy if exists "published only schedules" on schedules;
create policy "published only schedules" on schedules as restrictive for select to authenticated
  using (public.is_admin() or public.is_teacher() or publish_at is null or publish_at <= now());
drop policy if exists "published only slots" on slots;
create policy "published only slots" on slots as restrictive for select to authenticated
  using (public.is_admin() or public.is_teacher() or public.schedule_published(schedule_id));
drop policy if exists "published only bookings" on bookings;
create policy "published only bookings" on bookings as restrictive for select to authenticated
  using (public.is_admin() or public.is_teacher() or public.schedule_published(schedule_id));

-- 4. 게시 전 시간은 신청 못 함 (book_slot 이 칸을 채우려 할 때 막는다)
create or replace function public.slots_guard_publish()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.booked_by is not null and old.booked_by is null and not public.is_admin()
     and not public.schedule_published(new.schedule_id) then
    raise exception 'not_published';
  end if;
  return new;
end;
$$;
drop trigger if exists slots_guard_publish on slots;
create trigger slots_guard_publish before update on slots for each row execute function public.slots_guard_publish();

-- 5. 게시 전 글 — 알림톡 버튼으로 들어온 보호자에게 "몇 시에 게시돼요"만 (제목·센터·게시 시각)
create or replace function public.schedule_preview(p_id uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object('title', s.title, 'center', s.center, 'publish_at', s.publish_at)
  from schedules s where s.id = p_id and s.hidden_at is null and s.publish_at > now();
$$;
revoke all on function public.schedule_preview(uuid) from public, anon;
grant execute on function public.schedule_preview(uuid) to authenticated;

-- 6. 보호자 취소 신청은 받지 않는다 (이미 들어온 취소 신청의 철회·관리자 승인은 그대로)
create or replace function public.request_cancel(p_slot uuid)
returns text
language plpgsql security definer set search_path = public
as $$
begin
  return 'not_allowed';
end;
$$;

-- 7. 게시 후 10분 자유 취소 — 내 신청, free_cancel 글, 게시(없으면 만든) 시각부터 10분 안. 시간은 바로 다시 열린다
alter table bookings drop constraint if exists bookings_kind_check;
alter table bookings add constraint bookings_kind_check
  check (kind in ('book', 'cancel_request', 'cancel_withdraw', 'cancel_approved', 'cancel_free'));

create or replace function public.free_cancel_slot(p_slot uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_slot slots%rowtype;
  v_sc schedules%rowtype;
begin
  select * into v_slot from slots where id = p_slot and booked_by = auth.uid() and cancel_state is null;
  if not found then
    return 'not_allowed';
  end if;
  select * into v_sc from schedules where id = v_slot.schedule_id;
  if not v_sc.free_cancel or now() > coalesce(v_sc.publish_at, v_sc.created_at) + interval '10 minutes' then
    return 'too_late';
  end if;
  update bookings set cancelled_at = now() where slot_id = p_slot and kind = 'book' and cancelled_at is null;
  update slots set booked_by = null, booked_at = null, cancel_state = null where id = p_slot;
  insert into bookings (schedule_id, slot_id, user_id, nickname, label, kind)
  values (v_slot.schedule_id, p_slot, auth.uid(), coalesce(public.my_nickname(), '보호자'), public.slot_label(p_slot) || ' 취소 (게시 후 10분 안)', 'cancel_free');
  return 'ok';
end;
$$;
revoke all on function public.free_cancel_slot(uuid) from public, anon;
grant execute on function public.free_cancel_slot(uuid) to authenticated;

-- 8. 게시 5분 전 알림 — 비밀 글자를 아는 서버(사이트 /api/cron/schedule-prealert)만 부른다
create table if not exists app_secrets (name text primary key, value text not null);
alter table app_secrets enable row level security;   -- 정책 없음 = 화면·API로는 아무도 못 읽는다
insert into app_secrets (name, value) values ('cron', '__CRON_SECRET__')
on conflict (name) do update set value = excluded.value;

create or replace function public.cron_ok(p_secret text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select p_secret is not null and length(p_secret) >= 24 and p_secret = (select value from app_secrets where name = 'cron');
$$;
revoke all on function public.cron_ok(text) from public, anon, authenticated;

-- 때가 된 글마다 그 센터 승인된 보호자(번호 있는)에게 한 묶음을 만들고, 아직 안 보낸 줄을 돌려준다
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
                              '스케줄', case when sc.days is null then '다음주' else '공휴일' end,
                              '제목', sc.title, '게시시간', v_when, '글번호', sc.id),
           v_batch
    from profiles p
    left join lateral (select c.id, c.name from children c where c.guardian_user_id = p.user_id order by (c.center = sc.center) desc limit 1) ch on true
    where p.phone is not null and coalesce(p.nickname, '') <> ''
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

create or replace function public.cron_mark_outbox(p_secret text, p_id uuid, p_status text, p_error text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.cron_ok(p_secret) then
    return;
  end if;
  update outbox_messages
  set status = p_status, error = p_error, sent_at = case when p_status = 'sent' then now() else sent_at end
  where id = p_id and template_id = 'schedule_reserved' and p_status in ('pending', 'sent', 'failed', 'skipped');
end;
$$;
revoke all on function public.cron_mark_outbox(text, uuid, text, text) from public;
grant execute on function public.cron_mark_outbox(text, uuid, text, text) to anon, authenticated;

-- 9. 매분 확인 — 5분 안에 게시될 글이 있을 때만 사이트를 부른다 (pg_cron + pg_net)
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
select cron.schedule('we-schedule-prealert', '* * * * *', $cron$
  select net.http_post(
    url := 'https://we-center.vercel.app/api/cron/schedule-prealert',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer __CRON_SECRET__'),
    body := '{}'::jsonb
  )
  where exists (
    select 1 from public.schedules s
    where s.publish_at is not null and s.prealert_at is null and s.hidden_at is null
      and s.publish_at <= now() + interval '5 minutes' and s.publish_at > now() - interval '30 minutes'
  );
$cron$);

select 'ok' as result;
