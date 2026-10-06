-- WE 소아재활센터 — 대표 보호자 전화번호 뒷 4자리 + 가입할 때 회원 코드 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
-- (children-code.sql · guardian-dashboard.sql 을 먼저 실행한 뒤 실행한다)
--
-- 가입 창: 아이 이름(필수) · 대표 보호자 전화번호 뒷 4자리(필수) · 회원 코드(선택)
-- 회원 코드를 적으면 claim_child() 가 그 아이와 계정을 잇는다 — 아이 명단에 뒷번호가 있으면 같아야 한다.
-- 같은 아이 이름으로 여럿이 가입해도 관리자는 뒷번호·회원 코드로 구분한다. 승인은 지금처럼 관리자가 한다.

-- 1. 칸
alter table children add column if not exists phone_last4 text;     -- 아이 명단: 대표 보호자 뒷 4자리
alter table profiles add column if not exists phone_last4 text;     -- 가입한 보호자가 적은 뒷 4자리
alter table profiles add column if not exists requested_code text;  -- 가입할 때 적은 회원 코드(맞지 않아도 남겨 둔다)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'children_phone_last4_check') then
    alter table children add constraint children_phone_last4_check check (phone_last4 is null or phone_last4 ~ '^[0-9]{4}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_phone_last4_check') then
    alter table profiles add constraint profiles_phone_last4_check check (phone_last4 is null or phone_last4 ~ '^[0-9]{4}$');
  end if;
end $$;

-- 2. 보호자가 처음 만들 때 — 아이 이름·뒷번호(필수)·회원 코드만, 나머지는 기본값
drop policy if exists "insert own profile once" on profiles;
create policy "insert own profile once" on profiles for insert to authenticated
  with check (
    user_id = auth.uid() and phone_last4 is not null
    and center_nickname is null and memo is null and approved_at is null
    and not voucher and not gusen and not kkumideun and not woojin and not subsidy
    and prepaid_eunpyeong = 0 and prepaid_uijeongbu = 0
  );

-- 3. 회원 코드로 아이와 잇기 (보호자 본인이 부른다)
--    결과: ok / no_profile / no_code(없는 코드) / taken(다른 계정에 이미 이어짐) / phone_mismatch(뒷번호 다름)
create or replace function public.claim_child(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_child children%rowtype;
begin
  select phone_last4 into v_phone from profiles where user_id = auth.uid();
  if v_phone is null then
    return 'no_profile';
  end if;
  update profiles set requested_code = upper(btrim(p_code)) where user_id = auth.uid();
  select * into v_child from children where member_code = upper(btrim(p_code));
  if not found then
    return 'no_code';
  end if;
  if v_child.guardian_user_id is not null and v_child.guardian_user_id <> auth.uid() then
    return 'taken';
  end if;
  if v_child.phone_last4 is not null and v_child.phone_last4 <> v_phone then
    return 'phone_mismatch';
  end if;
  update children set guardian_user_id = null where guardian_user_id = auth.uid() and id <> v_child.id;
  update children set guardian_user_id = auth.uid(), phone_last4 = coalesce(phone_last4, v_phone) where id = v_child.id;
  return 'ok';
end;
$$;
revoke all on function public.claim_child(text) from public, anon;
grant execute on function public.claim_child(text) to authenticated;

-- 4. 회원 목록에 뒷번호·가입할 때 적은 코드
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
  requested_code text
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
           p.approved_at,
           coalesce(p.voucher, false),
           coalesce(p.gusen, false),
           coalesce(p.kkumideun, false),
           coalesce(p.woojin, false),
           coalesce(p.subsidy, false),
           coalesce(p.prepaid_eunpyeong, 0),
           coalesce(p.prepaid_uijeongbu, 0),
           p.phone_last4,
           p.requested_code
    from auth.users u
    left join profiles p on p.user_id = u.id
    where not exists (select 1 from admins a where a.user_id = u.id)
    order by u.created_at desc;
end;
$$;
revoke all on function public.admin_list_members() from public, anon;
grant execute on function public.admin_list_members() to authenticated;

select 'ok' as result;
