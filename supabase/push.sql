-- 보호자 앱 웹 푸시 (2026-11-13)
-- push_subscriptions: 알림을 켠 기기 하나 = 한 줄 (보호자 한 명이 휴대폰·태블릿 여러 대면 여러 줄)
-- push_log: 관리자가 보낸 앱 푸시 기록
-- Supabase SQL Editor 에서 한 번 실행. 여러 번 실행해도 괜찮다.

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
alter table push_subscriptions enable row level security;
drop policy if exists "read own push_subscriptions" on push_subscriptions;
create policy "read own push_subscriptions" on push_subscriptions for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists "delete own push_subscriptions" on push_subscriptions;
create policy "delete own push_subscriptions" on push_subscriptions for delete to authenticated using (user_id = auth.uid() or public.is_admin());

-- 기기 등록 — 같은 기기(endpoint)를 다른 계정이 쓰던 거면 지금 계정으로 옮긴다
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_ua text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  delete from push_subscriptions where endpoint = p_endpoint;
  insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_ua, 300));
end $$;
revoke all on function public.save_push_subscription(text, text, text, text) from public;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

create table if not exists push_log (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  url text,
  target text not null,          -- all / eunpyeong / uijeongbu / user:<id>
  target_label text,
  devices int not null default 0,
  sent int not null default 0,
  failed int not null default 0,
  removed int not null default 0, -- 앱을 지웠거나 알림을 꺼서 정리한 기기 수
  created_at timestamptz not null default now()
);
alter table push_log enable row level security;
drop policy if exists "admin all push_log" on push_log;
create policy "admin all push_log" on push_log for all to authenticated using (public.is_admin()) with check (public.is_admin());

select 'ok' as result;
