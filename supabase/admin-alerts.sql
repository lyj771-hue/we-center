-- WE 소아재활센터 — 관리자 알림 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
--
-- admin_alerts  관리자가 확인할 일 — 보호자가 무언가 신청하면 DB가 저절로 한 줄 쌓는다(트리거).
--   kind: signup(가입 승인 신청) / branch(다른 지점 가입 신청) / book(수업 신청) / cancel_request(취소 신청) / cancel_withdraw(취소 신청 철회)
--   read_at: 관리자가 확인한 시각 (null = 아직 안 봄 → 관리자 띠 '알림'에 빨간 숫자)
-- 보호자에게 보내는 알림 내역은 outbox_messages(teacher-leave.sql)를 그대로 쓴다.

create table if not exists admin_alerts (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  center text not null default 'eunpyeong',
  title text not null,
  detail text,
  user_id uuid,                              -- 신청한 보호자 계정
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists admin_alerts_created on admin_alerts (created_at desc);
create index if not exists admin_alerts_unread on admin_alerts (created_at) where read_at is null;
alter table admin_alerts enable row level security;
drop policy if exists "admin all admin_alerts" on admin_alerts;
create policy "admin all admin_alerts" on admin_alerts for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 1) 처음 가입 (가입 창을 채우면 profiles 한 줄이 생긴다) · 지점 없는 회원이 다시 가입 신청
create or replace function public.alert_profile_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or (new.center_requested_at is distinct from old.center_requested_at and new.approved_at is null) then
    insert into admin_alerts (kind, center, title, detail, user_id)
    values ('signup', coalesce(nullif(new.center, 'none'), 'eunpyeong'), new.nickname || ' 가입 승인 신청',
            case when new.phone_last4 is not null then '뒷번호 ' || new.phone_last4 end, new.user_id);
  end if;
  return null;
end;
$$;
drop trigger if exists alert_profile_signup on profiles;
create trigger alert_profile_signup after insert or update of center_requested_at on profiles
  for each row execute function public.alert_profile_signup();

-- 2) 다른 지점 가입 신청
create or replace function public.alert_member_center()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.approved_at is null then
    insert into admin_alerts (kind, center, title, user_id)
    select 'branch', new.center, coalesce(p.nickname, '보호자') || ' ' || case new.center when 'uijeongbu' then '의정부' else '수색' end || ' 가입 승인 신청', new.user_id
    from (select 1) x left join profiles p on p.user_id = new.user_id;
  end if;
  return null;
end;
$$;
drop trigger if exists alert_member_center on member_centers;
create trigger alert_member_center after insert on member_centers
  for each row execute function public.alert_member_center();

-- 3) 수업스케쥴 신청 · 취소 신청 · 취소 신청 철회 (bookings 에 기록이 남을 때마다)
create or replace function public.alert_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into admin_alerts (kind, center, title, detail, user_id)
  select coalesce(new.kind, 'book'), coalesce(s.center, 'eunpyeong'),
         new.nickname || ' ' || case coalesce(new.kind, 'book') when 'cancel_request' then '수업 취소 신청' when 'cancel_withdraw' then '취소 신청 철회' else '수업 신청' end,
         new.label, new.user_id
  from (select 1) x left join schedules s on s.id = new.schedule_id;
  return null;
end;
$$;
drop trigger if exists alert_booking on bookings;
create trigger alert_booking after insert on bookings
  for each row execute function public.alert_booking();

-- 처음 한 번 — 지금 승인을 기다리는 회원을 알림으로 넣어 둔다(알림 표가 비어 있을 때만)
insert into admin_alerts (kind, center, title, detail, user_id, created_at)
select 'signup', coalesce(nullif(p.center, 'none'), 'eunpyeong'), p.nickname || ' 가입 승인 신청',
       case when p.phone_last4 is not null then '뒷번호 ' || p.phone_last4 end, p.user_id, coalesce(p.center_requested_at, p.created_at)
from profiles p
where p.approved_at is null and coalesce(p.center, 'eunpyeong') <> 'none' and not exists (select 1 from admin_alerts)
union all
select 'branch', m.center, coalesce(p.nickname, '보호자') || ' ' || case m.center when 'uijeongbu' then '의정부' else '수색' end || ' 가입 승인 신청', null, m.user_id, m.requested_at
from member_centers m left join profiles p on p.user_id = m.user_id
where m.approved_at is null and not exists (select 1 from admin_alerts);

select 'ok' as result, (select count(*) from admin_alerts where read_at is null) as 안_본_알림;
