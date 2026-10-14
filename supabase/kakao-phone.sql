-- WE 소아재활센터 — 카카오계정 전화번호 저장 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
--
-- 카카오 로그인 동의항목 "카카오계정(전화번호)"(필수)로 받은 번호를 보호자 프로필에 둔다 — 알림톡 보낼 때 쓴다.
-- 로그인할 때마다 본인 것만 고친다(set_my_phone) — 보호자는 profiles.phone, 선생님은 teacher_logins.kakao_phone. 관리자 회원 목록에서 볼 수 있고 고칠 수는 없다.

alter table profiles add column if not exists phone text;
alter table profiles add column if not exists center_requested_at timestamptz;   -- member-joined-date.sql 과 같은 칸(아직 안 돌렸어도 되게)

-- 선생님 계정이면 회원관리(선생님)에도
alter table teacher_logins add column if not exists kakao_phone text;

create or replace function public.set_my_phone(p_phone text)
returns void
language sql
security definer
set search_path = public
as $$
  update profiles set phone = nullif(btrim(p_phone), '') where user_id = auth.uid();
  update teacher_logins set kakao_phone = nullif(btrim(p_phone), '') where user_id = auth.uid();
$$;
revoke all on function public.set_my_phone(text) from public, anon;
grant execute on function public.set_my_phone(text) to authenticated;

-- 회원 목록에 전화번호
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
  center text,
  phone text
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
           coalesce(p.center, 'eunpyeong'),
           p.phone
    from auth.users u
    left join profiles p on p.user_id = u.id
    where not exists (select 1 from admins a where a.user_id = u.id)
    order by u.created_at desc;
end;
$$;
revoke all on function public.admin_list_members() from public, anon;
grant execute on function public.admin_list_members() to authenticated;

select 'ok' as result;
