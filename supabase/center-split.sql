-- WE 소아재활센터 — 수색(은평) / 의정부 센터 나누기 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
--
-- profiles.center  : 보호자가 가입할 때 고른 센터 (없으면 수색)
-- children.center  : 아이가 다니는 센터 (지금까지 넣은 아이는 모두 수색)
-- schedules.center : 수업스케쥴(빈 수업 안내)이 어느 센터 것인지 (지금까지 올린 것은 모두 수색)
-- 센터 값: 'eunpyeong'(수색·은평) / 'uijeongbu'(의정부) — 시간표와 같은 값

alter table profiles add column if not exists center text;
alter table children add column if not exists center text not null default 'eunpyeong';
alter table schedules add column if not exists center text not null default 'eunpyeong';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_center_check') then
    alter table profiles add constraint profiles_center_check check (center in ('eunpyeong', 'uijeongbu'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'children_center_check') then
    alter table children add constraint children_center_check check (center in ('eunpyeong', 'uijeongbu'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'schedules_center_check') then
    alter table schedules add constraint schedules_center_check check (center in ('eunpyeong', 'uijeongbu'));
  end if;
end $$;

-- 회원 목록에 센터
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

select 'ok' as result;
