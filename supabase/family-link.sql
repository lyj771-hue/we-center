-- WE 소아재활센터 — 가족: 같은 가족 번호면 저절로 잇기, 신청 화면에서 아이 고르기, 테스트 아이 김유담B (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
-- (siblings.sql 다음에 실행)
--
-- 아이 명단 번호 중 관계가 가족(맘·아버님·할머님 …)인 번호가 겹치는 같은 지점 아이들은 한 계정으로 잇는다.
-- 선생님·활동보조 번호, 관계가 빈칸인 번호로는 잇지 않는다. 다른 계정에 이미 이어진 아이는 건드리지 않는다.
-- 지울 때(테스트 끝나면): delete from children where name = '김유담B';

-- 1. 가족 번호만 고르기
create or replace function public.family_phones(p_phones text[], p_relations text[])
returns text[]
language sql immutable
as $$
  select coalesce(array_agg(u.phone), '{}')
  from unnest(p_phones, p_relations) as u(phone, relation)
  where u.phone is not null
    and coalesce(u.relation, '') !~ '선생|쌤|샘|활동|보조|치료|기사|학교|센터'
    and coalesce(u.relation, '') ~ '맘|엄마|어머|모친|아빠|아버|부친|부모|할머|할아|이모|고모|삼촌|외숙|숙모|언니|누나|오빠|형|동생|^부$|^모$';
$$;

-- 2. 아이를 저장할 때 — 계정이 이어졌거나 번호가 바뀐 때만 잇는다(관리자가 일부러 끊은 아이는 다시 잇지 않는다)
create or replace function public.children_link_family()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_fam text[] := public.family_phones(new.phones, new.phone_relations);
  v_found uuid[];
begin
  if cardinality(v_fam) = 0 then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.guardian_user_id is not distinct from old.guardian_user_id
     and new.phones is not distinct from old.phones and new.phone_relations is not distinct from old.phone_relations then
    return null;
  end if;
  if new.guardian_user_id is not null then
    update children c set guardian_user_id = new.guardian_user_id
    where c.id <> new.id and c.guardian_user_id is null and c.center is not distinct from new.center
      and public.family_phones(c.phones, c.phone_relations) && v_fam;
  elsif tg_op = 'INSERT' or old.guardian_user_id is null then
    select array_agg(distinct c.guardian_user_id) into v_found from children c
    where c.id <> new.id and c.guardian_user_id is not null and c.center is not distinct from new.center
      and public.family_phones(c.phones, c.phone_relations) && v_fam;
    if cardinality(v_found) = 1 then   -- 엄마·아빠가 각자 계정이면 어느 쪽인지 몰라 잇지 않는다
      update children set guardian_user_id = v_found[1] where id = new.id;
    end if;
  end if;
  return null;
end;
$$;
drop trigger if exists children_link_family on children;
create trigger children_link_family after insert or update of guardian_user_id, phones, phone_relations on children
  for each row execute function public.children_link_family();

-- 3. 이미 명단에 있는 가족 잇기
update children c set guardian_user_id = x.guardian_user_id
from (
  select b.id, min(a.guardian_user_id::text)::uuid as guardian_user_id
  from children b join children a
    on a.id <> b.id and a.guardian_user_id is not null and a.center is not distinct from b.center
   and public.family_phones(a.phones, a.phone_relations) && public.family_phones(b.phones, b.phone_relations)
  where b.guardian_user_id is null
  group by b.id
  having count(distinct a.guardian_user_id) = 1
) x
where c.id = x.id;

-- 4. 수업 신청 — 신청 화면에서 고른 아이로 (안 주면 마이페이지에서 고른 아이)
drop function if exists public.book_slot(uuid);
create or replace function public.book_slot(p_slot uuid, p_child uuid default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_child uuid;
  v_child_name text;
  v_center text;
  v_target slots%rowtype;
  v_slot slots%rowtype;
begin
  select nickname into v_name from profiles where user_id = auth.uid() and approved_at is not null;
  if v_name is null then
    return 'not_approved';
  end if;

  select * into v_target from slots where id = p_slot;
  if not found then
    return 'taken';
  end if;

  select coalesce(sc.center, 'eunpyeong') into v_center from schedules sc where sc.id = v_target.schedule_id;
  select c.id into v_child from children c where c.id = p_child and c.guardian_user_id = auth.uid() and coalesce(c.center, 'eunpyeong') = v_center;
  v_child := coalesce(v_child, public.my_center_child(v_center), public.my_active_child());
  select name into v_child_name from children where id = v_child;

  -- 겹치는 수업이 있는지 — 시작 시각 차이가 50분보다 작으면 겹친다. 그 아이 수업만 본다
  if exists (
    select 1 from public.lessons_between(v_target.day, v_target.day) l
    where (l.child_id in (select c.id from children c where c.guardian_user_id = auth.uid() and c.name = v_child_name)
           or (l.guardian_user_id = auth.uid() and (l.child_id is null or l.child_id not in (select c.id from children c where c.guardian_user_id = auth.uid()))))
      and l.status in ('child', 'cancel_requested') and not l.moved
      and abs(extract(epoch from (l.lesson_time::time - v_target.time::time))) < 50 * 60
  ) then
    return 'conflict';
  end if;

  update slots set booked_by = auth.uid(), booked_child_id = v_child, booked_at = now(), cancel_state = null
  where id = p_slot and booked_by is null
  returning * into v_slot;
  if not found then
    return 'taken';
  end if;
  insert into bookings (schedule_id, slot_id, user_id, nickname, label, kind)
  values (v_slot.schedule_id, v_slot.id, auth.uid(), coalesce(v_child_name, v_name), public.slot_label(v_slot.id), 'book');
  return 'ok';
end;
$$;
revoke all on function public.book_slot(uuid, uuid) from public, anon;
grant execute on function public.book_slot(uuid, uuid) to authenticated;

-- 5. 내 수업 — 신청 화면에서 고른 아이의 겹치는 시간을 보려고 아이를 줄 수 있게
drop function if exists public.my_lessons(date, date);
create or replace function public.my_lessons(p_from date, p_to date, p_child uuid default null)
returns table (
  day date, lesson_time text, teacher_id uuid, teacher_name text, side text, source text, status text,
  child_id uuid, name text, guardian_user_id uuid, guardian_nickname text, center_nickname text,
  payment text, oral boolean, absent boolean, moved boolean, note text, booked_at timestamptz, center text
)
language plpgsql stable security definer set search_path = public
as $$
#variable_conflict use_column
begin
  if p_to - p_from > 100 then
    raise exception 'too long';
  end if;
  return query
    select * from public.lessons_between(p_from, p_to) l
    where l.child_id in (
            select public.my_selected_children() where p_child is null
            union all
            select c.id from children c
            where p_child is not null and c.guardian_user_id = auth.uid()
              and c.name = (select k.name from children k where k.id = p_child and k.guardian_user_id = auth.uid()))
       or (l.guardian_user_id = auth.uid()
           and (l.child_id is null or l.child_id not in (select c.id from children c where c.guardian_user_id = auth.uid())));
end;
$$;
revoke all on function public.my_lessons(date, date, uuid) from public, anon;
grant execute on function public.my_lessons(date, date, uuid) to authenticated;

-- 6. 테스트 아이 — 김유담이 있는 지점마다 김유담B
insert into children (center, name, phone_last4, phones, phone_relations, guardian_user_id)
select y.center, '김유담B', y.phone_last4, y.phones, y.phone_relations, y.guardian_user_id
from children y
where y.name = '김유담'
  and not exists (select 1 from children b where b.name = '김유담B' and b.center is not distinct from y.center);

-- 확인: 한 계정에 이어진 가족 (김유담 · 김유담B 가 보여야 한다. 다른 가족도 맞는지 봐 주세요)
select coalesce(p.center_nickname, p.nickname) as 계정, c.center as 지점, string_agg(c.member_code || ' ' || c.name, ', ' order by c.name) as 아이들
from children c left join profiles p on p.user_id = c.guardian_user_id
where c.guardian_user_id is not null
group by c.guardian_user_id, p.center_nickname, p.nickname, c.center
having count(*) > 1
order by 1;
