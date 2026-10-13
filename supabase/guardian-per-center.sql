-- WE 소아재활센터 — 보호자 계정 하나에 지점마다 아이 한 명씩 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
--
-- 지금까지는 계정 하나 = 아이 한 명(children_guardian_key)이라, 수색에 이어진 계정에 의정부 아이를 이으면 막혔다.
-- 두 지점을 다니는 아이(수색 김유담 / 의정부 김유담)는 지점마다 아이 기록이 따로라서 계정 하나에 지점마다 한 명씩 잇는다.

drop index if exists children_guardian_key;
create unique index if not exists children_guardian_center_key on children (guardian_user_id, center);

-- 보호자가 회원 코드로 이을 때도 같은 지점의 다른 아이만 끊는다 (다른 지점 아이 연결은 그대로)
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
  update children set guardian_user_id = null where guardian_user_id = auth.uid() and center = v_child.center and id <> v_child.id;
  update children set guardian_user_id = auth.uid(), phone_last4 = coalesce(phone_last4, v_phone) where id = v_child.id;
  return 'ok';
end;
$$;
revoke all on function public.claim_child(text) from public, anon;
grant execute on function public.claim_child(text) to authenticated;

select 'ok' as result;
