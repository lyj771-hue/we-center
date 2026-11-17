-- 선생님이 정해진 아이의 보호자 화면(수업·결제·선결제 카드)을 보기만 하기 (2026-11-17)
-- 예: 설영수 선생님 → 김유담. 보호자 앱(/app)에서 선생님 탭 [김유담]으로 본다.
-- child_viewers: 누가(user_id) 어떤 아이(child_id)를 볼 수 있는지 — 관리자만 넣고 지운다.
-- viewer_call: 그 아이 보호자 기준으로 마이페이지 함수(my_child·my_lessons·my_payments·my_payment_history·my_prepaid_ledger)를 대신 불러 결과만 돌려준다(읽기만).
-- Supabase SQL Editor 에서 한 번 실행. 여러 번 실행해도 괜찮다. (설영수 선생님이 카카오로 선생님 인증을 한 뒤에 실행해야 4번이 들어간다)

-- 1. 표
create table if not exists child_viewers (
  user_id uuid not null references auth.users (id) on delete cascade,
  child_id uuid not null references children (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, child_id)
);
alter table child_viewers enable row level security;
drop policy if exists "read own child_viewers" on child_viewers;
create policy "read own child_viewers" on child_viewers for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists "admin all child_viewers" on child_viewers;
create policy "admin all child_viewers" on child_viewers for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 2. 내가 볼 수 있는 아이들
create or replace function public.viewer_children()
returns table (id uuid, name text, child_number int, center text)
language sql stable security definer set search_path = public
as $$
  select c.id, c.name, c.number, coalesce(c.center, 'eunpyeong')
  from child_viewers v join children c on c.id = v.child_id
  where v.user_id = auth.uid()
  order by c.name, c.id;
$$;
revoke all on function public.viewer_children() from public, anon;
grant execute on function public.viewer_children() to authenticated;

-- 3. 그 아이 보호자 기준으로 마이페이지 함수 부르기 (허락된 아이만, 정해진 함수만)
create or replace function public.viewer_call(p_child uuid, p_fn text, p_args jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_guardian uuid;
  v_center text;
  v_old uuid;
  v_res jsonb;
begin
  if not exists (select 1 from child_viewers where user_id = auth.uid() and child_id = p_child) then
    raise exception 'not allowed';
  end if;
  select guardian_user_id, coalesce(center, 'eunpyeong') into v_guardian, v_center from children where id = p_child;
  if v_guardian is null then return '[]'::jsonb; end if;

  -- 보호자가 고른 아이(active_child_id)를 잠깐 이 아이로 — 끝나면 그대로 되돌린다(이 요청 안에서만)
  select active_child_id into v_old from profiles where user_id = v_guardian;
  update profiles set active_child_id = p_child where user_id = v_guardian;
  -- 이 요청 안에서만 auth.uid() = 보호자
  perform set_config('request.jwt.claim.sub', v_guardian::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_guardian, 'role', 'authenticated')::text, true);

  if p_fn = 'my_child' then
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_res from public.my_child(v_center) t;
  elsif p_fn = 'my_payments' then
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_res from public.my_payments(v_center) t;
  elsif p_fn = 'my_prepaid_ledger' then
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_res from public.my_prepaid_ledger(v_center) t;
  elsif p_fn = 'my_payment_history' then
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_res from public.my_payment_history() t;
  elsif p_fn = 'my_lessons' then
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_res
    from public.my_lessons((p_args ->> 'p_from')::date, (p_args ->> 'p_to')::date) t
    where t.child_id = p_child;
  else
    raise exception 'unknown function %', p_fn;
  end if;

  update profiles set active_child_id = v_old where user_id = v_guardian;
  return v_res;
end $$;
revoke all on function public.viewer_call(uuid, text, jsonb) from public, anon;
grant execute on function public.viewer_call(uuid, text, jsonb) to authenticated;

-- 4. 설영수 선생님 → 김유담 (선생님 카카오 인증이 된 계정에만 들어간다)
insert into child_viewers (user_id, child_id)
select tl.user_id, c.id
from teacher_logins tl
join teachers t on t.id = tl.teacher_id
join children c on c.name = '김유담'
where t.name = '설영수' and tl.user_id is not null
on conflict do nothing;

-- 확인: 몇 줄 들어갔는지 (0이면 설영수 선생님이 아직 카카오로 선생님 인증을 안 한 것)
select count(*) as 설영수_김유담_연결 from child_viewers v
join teacher_logins tl on tl.user_id = v.user_id join teachers t on t.id = tl.teacher_id
where t.name = '설영수';
