-- WE 소아재활센터 — 회원 관리 표 개편 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
--
-- 회원 정보:
--   보호자 닉네임 — 보호자가 처음 로그인할 때 직접 입력(승인 필요 없음). 그 뒤 변경은 관리자만.
--   센터 닉네임   — 관리자가 정한다. 수업 신청 등에 쓰는 이름.
--   승인일자      — 관리자가 "승인"을 누른 때. 비어 있으면 미승인 회원.
--   설명          — 관리자 메모.
-- 가입일자·마지막 로그인 시각·카카오 회원번호는 로그인 계정(auth.users)에 있어서, 관리자만 부를 수 있는 함수로 읽는다.

-- 1. profiles 표 정리: 승인 상태 칸 대신 승인일자(approved_at)·센터 닉네임·설명
alter table profiles add column if not exists center_nickname text
  check (center_nickname is null or char_length(btrim(center_nickname)) between 1 and 20);
alter table profiles add column if not exists memo text;

drop policy if exists "insert own profile once" on profiles;
alter table profiles drop column if exists status;
alter table profiles add column if not exists approved_at timestamptz;

-- 보호자 닉네임은 겹쳐도 되고, 센터 닉네임은 겹치면 안 된다
drop index if exists profiles_nickname_key;
create unique index if not exists profiles_center_nickname_key on profiles (btrim(center_nickname));

-- 2. 정책: 보호자는 자기 줄을 한 번만, 보호자 닉네임만 넣어 만든다. 나머지는 관리자만
drop policy if exists "insert own profile once" on profiles;
drop policy if exists "admin insert profiles" on profiles;
create policy "insert own profile once" on profiles for insert to authenticated
  with check (user_id = auth.uid() and center_nickname is null and memo is null and approved_at is null);
create policy "admin insert profiles" on profiles for insert to authenticated
  with check (public.is_admin());

-- 3. 회원 목록 (관리자 전용) — 로그인한 적 있는 모든 보호자 + 닉네임 정보
drop function if exists public.admin_list_members();
create function public.admin_list_members()
returns table (
  user_id uuid,
  kakao_id text,
  joined_at timestamptz,
  last_sign_in_at timestamptz,
  nickname text,
  center_nickname text,
  memo text,
  approved_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;
  return query
    select u.id,
           (select i.provider_id from auth.identities i where i.user_id = u.id and i.provider = 'kakao' limit 1),
           u.created_at,
           u.last_sign_in_at,
           p.nickname,
           p.center_nickname,
           p.memo,
           p.approved_at
    from auth.users u
    left join profiles p on p.user_id = u.id
    where not exists (select 1 from admins a where a.user_id = u.id)
    order by u.created_at desc;
end;
$$;
revoke all on function public.admin_list_members() from public, anon;
grant execute on function public.admin_list_members() to authenticated;

-- 확인: 지금까지 로그인한 보호자 목록
select * from profiles;
