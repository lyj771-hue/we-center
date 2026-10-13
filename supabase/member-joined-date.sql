-- WE 소아재활센터 — 회원관리 가입신청일 바로잡기 · 센터 닉네임 비우기 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
--
-- 회원 목록의 가입(신청)일이 카카오로 처음 로그인한 날(auth.users.created_at)이라, 다시 가입해도 옛 날짜가 나왔다.
-- profiles.center_requested_at: 기본 지점에 가입 신청한 날 (처음 가입, 또는 모든 지점을 취소한 뒤 다시 신청한 날).
-- 다른 지점 신청일은 member_centers.requested_at 에 이미 있다.

alter table profiles add column if not exists center_requested_at timestamptz;
alter table profiles alter column center_requested_at set default now();

-- 모든 지점을 취소한 뒤 다시 신청하면 그날로
create or replace function public.join_center(p_center text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_primary text;
begin
  if p_center not in ('eunpyeong', 'uijeongbu') then
    return 'bad_center';
  end if;
  select coalesce(center, 'eunpyeong') into v_primary from profiles where user_id = auth.uid();
  if not found then
    return 'no_profile';
  end if;
  if v_primary = p_center then
    return 'already';
  end if;
  if v_primary = 'none' then
    update profiles set center = p_center, approved_at = null, center_requested_at = now() where user_id = auth.uid();
    delete from member_centers where user_id = auth.uid() and center = p_center;
    return 'ok';
  end if;
  insert into member_centers (user_id, center) values (auth.uid(), p_center) on conflict do nothing;
  return 'ok';
end;
$$;
revoke all on function public.join_center(text) from public, anon;
grant execute on function public.join_center(text) to authenticated;

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
  approved_at timestamptz,
  voucher boolean,
  gusen boolean,
  kkumideun boolean,
  woojin boolean,
  subsidy boolean,
  prepaid_eunpyeong int,
  prepaid_uijeongbu int,
  phone_last4 text,
  requested_code text,
  center text
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
           coalesce(p.center_requested_at, p.created_at, u.created_at),   -- 가입 신청일: 지점 신청한 날 → 프로필 만든 날 → 카카오 첫 로그인
           u.last_sign_in_at,
           p.nickname,
           p.center_nickname,
           p.memo,
           p.approved_at,
           coalesce(p.voucher, false),
           coalesce(p.gusen, false),
           coalesce(p.kkumideun, false),
           coalesce(p.woojin, false),
           coalesce(p.subsidy, false),
           coalesce(p.prepaid_eunpyeong, 0),
           coalesce(p.prepaid_uijeongbu, 0),
           p.phone_last4,
           p.requested_code,
           coalesce(p.center, 'eunpyeong')
    from auth.users u
    left join profiles p on p.user_id = u.id
    where not exists (select 1 from admins a where a.user_id = u.id)
    order by u.created_at desc;
end;
$$;
revoke all on function public.admin_list_members() from public, anon;
grant execute on function public.admin_list_members() to authenticated;

-- 센터 닉네임(관리자 닉네임)은 더 쓰지 않는다 — 남은 값을 비운다 (화면은 가입할 때 쓴 이름 · 아이 명단 이름+번호로)
update profiles set center_nickname = null where center_nickname is not null;

select 'ok' as result;
