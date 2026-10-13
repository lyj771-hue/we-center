-- WE 소아재활센터 — 보호자가 마이페이지에서 지점 가입·취소 / 회원 탈퇴 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
--
-- profiles.center = 'none' : 어느 지점에도 가입돼 있지 않음(모든 지점을 취소함). 마이페이지엔 지점 신청 버튼만.
-- join_center(지점)  : 지점 가입 신청 — 가입한 지점이 없으면 그 지점이 기본 지점(승인 대기), 있으면 추가 지점 신청.
-- leave_center(지점) : 그 지점 아이 연결을 끊고 빠진다. 기본 지점이면 다른 지점이 기본이 되고, 마지막 지점이면 'none'.
-- withdraw_member()  : 회원 탈퇴 — 보호자 정보(프로필·지점 가입·로그인 계정)를 지운다.
--   수업·결제 기록은 센터 아이 명단에 남는다. 수업스케쥴 신청(지난 것·앞으로의 것)은 시간표 빈타임 칸으로 옮겨 둔다.

alter table profiles drop constraint if exists profiles_center_check;
alter table profiles add constraint profiles_center_check check (center in ('eunpyeong', 'uijeongbu', 'none'));

-- 지점 가입 신청
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
    update profiles set center = p_center, approved_at = null where user_id = auth.uid();
    delete from member_centers where user_id = auth.uid() and center = p_center;
    return 'ok';
  end if;
  insert into member_centers (user_id, center) values (auth.uid(), p_center) on conflict do nothing;
  return 'ok';
end;
$$;
revoke all on function public.join_center(text) from public, anon;
grant execute on function public.join_center(text) to authenticated;

-- 지점 가입 취소
create or replace function public.leave_center(p_center text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_primary text;
  v_other member_centers%rowtype;
begin
  select coalesce(center, 'eunpyeong') into v_primary from profiles where user_id = auth.uid();
  if not found then
    return 'no_profile';
  end if;
  update children set guardian_user_id = null where guardian_user_id = auth.uid() and center = p_center;
  if p_center <> v_primary then
    delete from member_centers where user_id = auth.uid() and center = p_center;
    return 'ok';
  end if;
  select * into v_other from member_centers where user_id = auth.uid() and center <> p_center limit 1;
  if found then
    update profiles set center = v_other.center, approved_at = v_other.approved_at where user_id = auth.uid();
    delete from member_centers where user_id = auth.uid() and center = v_other.center;
    return 'ok';
  end if;
  update profiles set center = 'none', approved_at = null where user_id = auth.uid();
  return 'last';
end;
$$;
revoke all on function public.leave_center(text) from public, anon;
grant execute on function public.leave_center(text) to authenticated;

-- 회원 탈퇴
create or replace function public.withdraw_member()
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_name text;
begin
  if auth.uid() is null or exists (select 1 from admins where user_id = auth.uid()) then
    return 'forbidden';
  end if;
  select coalesce(center_nickname, nickname) into v_name from profiles where user_id = auth.uid();
  -- 수업스케쥴 신청(지난 것·앞으로의 것 모두) → 시간표 빈타임 칸으로 남긴다 (관리자가 이미 바꿔 둔 칸은 그대로)
  -- 시간표에선 회원이 아닌 직접 작성 칸으로 보인다. 앞으로의 수업은 관리자가 확인하고 지운다
  insert into board_cells (day, teacher_id, time, side, status, child_id, name, center)
  select s.day, s.teacher_id, s.time, 'open', 'child',
         (select c.id from children c where c.guardian_user_id = auth.uid() and c.center = coalesce(sc.center, 'eunpyeong') limit 1),
         coalesce((select c.name from children c where c.guardian_user_id = auth.uid() and c.center = coalesce(sc.center, 'eunpyeong') limit 1), v_name, '탈퇴 회원'),
         coalesce(sc.center, 'eunpyeong')
  from slots s left join schedules sc on sc.id = s.schedule_id
  where s.booked_by = auth.uid() and s.cancel_state is distinct from 'approved'
  on conflict (center, day, teacher_id, time, side) do nothing;
  -- 옮긴 신청 칸은 수업스케쥴에서 뺀다 (계정이 지워지면 빈 시간으로 다시 열리지 않게). 신청 글(bookings)은 남는다
  delete from slots where booked_by = auth.uid();
  update children set guardian_user_id = null where guardian_user_id = auth.uid();
  delete from member_centers where user_id = auth.uid();
  delete from profiles where user_id = auth.uid();
  delete from auth.users where id = auth.uid();
  return 'ok';
end;
$$;
revoke all on function public.withdraw_member() from public, anon;
grant execute on function public.withdraw_member() to authenticated;

select 'ok' as result;
