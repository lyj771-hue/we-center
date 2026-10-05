-- WE 소아재활센터 — 선결제를 센터마다 "앞 숫자 / 뒤 숫자" 두 개로 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
--   선결제 — 은평 0/50 | 의정부 12/10 처럼 센터마다 숫자 두 개(기본 0/0).
--   앞 숫자는 기존 prepaid_eunpyeong·prepaid_uijeongbu, 뒤 숫자를 새로 더한다.
-- members-v3.sql 을 먼저 실행한 뒤 실행한다.

alter table profiles add column if not exists prepaid_eunpyeong_total int not null default 0;
alter table profiles add column if not exists prepaid_uijeongbu_total int not null default 0;

-- 보호자가 처음 만들 때는 이 칸들을 건드릴 수 없다
drop policy if exists "insert own profile once" on profiles;
create policy "insert own profile once" on profiles for insert to authenticated
  with check (
    user_id = auth.uid() and center_nickname is null and memo is null and approved_at is null
    and not voucher and not gusen and not kkumideun and not woojin and not subsidy
    and prepaid_eunpyeong = 0 and prepaid_uijeongbu = 0 and prepaid_eunpyeong_total = 0 and prepaid_uijeongbu_total = 0
  );

-- 회원 목록 함수에 새 칸을 더한다
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
  prepaid_eunpyeong_total int,
  prepaid_uijeongbu int,
  prepaid_uijeongbu_total int
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
           coalesce(p.prepaid_eunpyeong_total, 0),
           coalesce(p.prepaid_uijeongbu, 0),
           coalesce(p.prepaid_uijeongbu_total, 0)
    from auth.users u
    left join profiles p on p.user_id = u.id
    where not exists (select 1 from admins a where a.user_id = u.id)
    order by u.created_at desc;
end;
$$;
revoke all on function public.admin_list_members() from public, anon;
grant execute on function public.admin_list_members() to authenticated;

select 'ok' as result;
