-- WE 소아재활센터 — 선생님 카카오 로그인 · 시간표 보기 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
--
-- teacher_logins: 선생님마다 휴대전화 뒷번호 4자리 · 회원 코드(T001 …) · 이어진 카카오 계정. 관리자만 읽고 쓴다.
-- 선생님이 카카오로 로그인해서 가입 창에 [선생님] · 이름 · 휴대전화 뒷번호 4자리를 적으면, 회원관리에 적어 둔 것과 같을 때 이어진다(claim_teacher).
-- 이어진 선생님은 시간표 보기(teacher_lessons)를 읽을 수 있다 — 고치기는 못 한다.
-- 선생님 이름은 하나만(같은 이름 두 명 불가).

create table if not exists teacher_logins (
  teacher_id uuid primary key references teachers (id) on delete cascade,
  phone text,
  member_code text unique,
  user_id uuid unique references auth.users (id) on delete set null,
  linked_at timestamptz
);
alter table teacher_logins enable row level security;
drop policy if exists "admin all teacher_logins" on teacher_logins;
create policy "admin all teacher_logins" on teacher_logins for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 선생님 이름은 하나만
do $$
begin
  create unique index if not exists teachers_name_key on teachers (btrim(name));
exception when unique_violation then
  raise notice '같은 이름 선생님이 있어서 이름 중복 막기를 못 걸었어요 — 이름을 고친 뒤 다시 실행해 주세요';
end $$;

-- 선생님마다 한 줄 + 회원 코드(T001 …) 채우기 — 관리자 화면을 열 때마다 부른다
create or replace function public.ensure_teacher_logins()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  n int;
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;
  select coalesce(max(substring(member_code from 2)::int), 0) into n from teacher_logins where member_code ~ '^T[0-9]+$';
  for t in select id from teachers where not exists (select 1 from teacher_logins tl where tl.teacher_id = teachers.id) order by sort_order loop
    n := n + 1;
    insert into teacher_logins (teacher_id, member_code) values (t.id, 'T' || lpad(n::text, 3, '0'));
  end loop;
end;
$$;
revoke all on function public.ensure_teacher_logins() from public, anon;
grant execute on function public.ensure_teacher_logins() to authenticated;

-- 지금 로그인한 사람이 선생님인지
create or replace function public.is_teacher()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from teacher_logins where user_id = auth.uid());
$$;
grant execute on function public.is_teacher() to authenticated;

-- 내 선생님 정보
drop function if exists public.my_teacher();
create function public.my_teacher()
returns table (teacher_id uuid, name text, member_code text, centers text[])
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.name, tl.member_code, t.centers from teacher_logins tl join teachers t on t.id = tl.teacher_id where tl.user_id = auth.uid();
$$;
revoke all on function public.my_teacher() from public, anon;
grant execute on function public.my_teacher() to authenticated;

-- 선생님 인증 — 이름과 휴대전화 뒷번호 4자리가 회원관리에 적어 둔 것과 같으면 이 카카오 계정과 잇는다
-- 결과: ok / bad_phone / no_match / taken(다른 카카오 계정에 이미 이어짐)
create or replace function public.claim_teacher(p_name text, p_phone text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v teacher_logins%rowtype;
begin
  if auth.uid() is null then
    return 'no_login';
  end if;
  if length(v_digits) <> 4 then
    return 'bad_phone';
  end if;
  select tl.* into v from teacher_logins tl join teachers t on t.id = tl.teacher_id
  where btrim(t.name) = btrim(p_name) and right(regexp_replace(coalesce(tl.phone, ''), '\D', '', 'g'), 4) = v_digits;
  if not found then
    return 'no_match';
  end if;
  if v.user_id is not null and v.user_id <> auth.uid() then
    return 'taken';
  end if;
  update teacher_logins set user_id = null, linked_at = null where user_id = auth.uid() and teacher_id <> v.teacher_id;
  update teacher_logins set user_id = auth.uid(), linked_at = now() where teacher_id = v.teacher_id;
  return 'ok';
end;
$$;
revoke all on function public.claim_teacher(text, text) from public, anon;
grant execute on function public.claim_teacher(text, text) to authenticated;

-- 선생님은 선생님 명단(이름·센터·출근 요일)을 읽을 수 있다
drop policy if exists "teacher read teachers" on teachers;
create policy "teacher read teachers" on teachers for select to authenticated using (public.is_teacher());

-- 시간표 보기 — 선생님·관리자만, 한 번에 40일까지. 아이 이름·번호·결석·옮김·메모 (보호자 정보·결제는 빼고)
drop function if exists public.teacher_lessons(date, date);
create function public.teacher_lessons(p_from date, p_to date)
returns table (
  day date,
  lesson_time text,
  teacher_id uuid,
  side text,
  source text,
  status text,
  name text,
  child_number int,
  absent boolean,
  moved boolean,
  note text,
  center text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.is_teacher() or public.is_admin()) then
    raise exception 'not allowed';
  end if;
  if p_to - p_from > 40 then
    raise exception 'too long';
  end if;
  return query
    select l.day, l.lesson_time, l.teacher_id, l.side, l.source, l.status, l.name, c.number, l.absent, l.moved, l.note, l.center
    from public.lessons_between(p_from, p_to) l
    left join children c on c.id = l.child_id;
end;
$$;
revoke all on function public.teacher_lessons(date, date) from public, anon;
grant execute on function public.teacher_lessons(date, date) to authenticated;

select 'ok' as result;
