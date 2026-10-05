-- WE 소아재활센터 — 관리자 / 학부모 구분 (2026-10)
-- 카카오 로그인을 켜기 전에 실행한다. 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run
--
-- 지금까지는 "로그인한 사람(authenticated)"이면 누구나 글·사진을 쓰고 지울 수 있었다.
-- 이제 admins 표에 등록된 계정만 쓸 수 있고, 카카오로 로그인한 학부모는 읽기만 한다.
-- 여러 번 실행해도 괜찮다.

-- 1. 관리자 명단
create table if not exists admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table admins enable row level security;
drop policy if exists "admin read self" on admins;
create policy "admin read self" on admins for select to authenticated using (user_id = auth.uid());

-- 지금 쓰는 관리자 계정 (admin@we-center.local)
insert into admins (user_id)
select id from auth.users where email = 'admin@we-center.local'
on conflict do nothing;

-- 2. 관리자인지 확인하는 함수 (정책 안에서 쓴다)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

-- 3. 표마다 쓰기 정책을 "관리자만"으로 바꾼다 (읽기는 그대로 누구나)
do $$
declare
  t text;
  p record;
begin
  foreach t in array array['posts', 'rooms', 'subjects', 'location_info', 'payment_methods', 'page_settings'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t and cmd <> 'SELECT' loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('create policy "admin insert %1$s" on public.%1$I for insert to authenticated with check (public.is_admin())', t);
    execute format('create policy "admin update %1$s" on public.%1$I for update to authenticated using (public.is_admin()) with check (public.is_admin())', t);
    execute format('create policy "admin delete %1$s" on public.%1$I for delete to authenticated using (public.is_admin())', t);
  end loop;
end $$;

-- 4. 사진 저장소(images 버킷)도 관리자만 올리고 지운다
drop policy if exists "admin upload images" on storage.objects;
drop policy if exists "admin update images" on storage.objects;
drop policy if exists "admin delete images" on storage.objects;
create policy "admin upload images" on storage.objects for insert to authenticated with check (bucket_id = 'images' and public.is_admin());
create policy "admin update images" on storage.objects for update to authenticated using (bucket_id = 'images' and public.is_admin()) with check (bucket_id = 'images' and public.is_admin());
create policy "admin delete images" on storage.objects for delete to authenticated using (bucket_id = 'images' and public.is_admin());

-- 5. 회원(카카오 로그인한 보호자) 닉네임
--    처음 로그인하면 보호자가 닉네임을 한 번 입력한다(승인 대기). 그 뒤 바꾸기·승인은 관리자만 한다.
create table if not exists profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null check (char_length(btrim(nickname)) between 1 and 20),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  approved_at timestamptz
);
create unique index if not exists profiles_nickname_key on profiles (btrim(nickname));
alter table profiles enable row level security;

drop policy if exists "read own or admin profiles" on profiles;
drop policy if exists "insert own profile once" on profiles;
drop policy if exists "admin update profiles" on profiles;
drop policy if exists "admin delete profiles" on profiles;
-- 본인 것만 보이고, 관리자는 전부 본다
create policy "read own or admin profiles" on profiles for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
-- 보호자는 자기 닉네임을 한 번만 만든다(한 계정에 한 줄). 상태는 '승인 대기'로만 시작한다
create policy "insert own profile once" on profiles for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending' and approved_at is null);
-- 만든 뒤 바꾸기·승인·삭제는 관리자만
create policy "admin update profiles" on profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "admin delete profiles" on profiles for delete to authenticated
  using (public.is_admin());

-- 확인: 관리자 명단에 1명이 보여야 한다
select a.user_id, u.email from admins a join auth.users u on u.id = a.user_id;
