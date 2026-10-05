-- WE 소아재활센터 — 수업스케쥴 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
--
-- 관리자가 한 주(월~금)의 빈 수업 시간을 선생님별로 올리면, 승인된 보호자가 시간을 눌러 선착순으로 신청한다.
--   teachers            선생님 명단
--   schedules           한 주 스케쥴(공지) — 주 시작 월요일, 제목, 안내 문구, 휴무일
--   slots               빈 수업 시간 한 칸 — 누가 신청했는지(booked_by)
--   bookings            신청 기록(댓글) — 수정 불가. 관리자가 취소하면 cancelled_at 이 찍힌다
--   schedule_templates  관리자가 저장해 두는 "형식" (선생님별·요일별 시간)
-- 신청·취소는 아래 함수로만 한다(동시에 눌러도 한 명만 성공하도록 DB가 막는다).

-- 0. 승인된 보호자인지 확인하는 함수
create or replace function public.is_approved()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from profiles where user_id = auth.uid() and approved_at is not null);
$$;

-- 1. 표
create table if not exists teachers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order int not null default 0
);

create table if not exists schedules (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,                 -- 그 주 월요일
  title text not null,
  notice text not null default '',
  holidays jsonb not null default '[]',     -- [{"date":"2026-10-09","label":"한글날"}]
  created_at timestamptz not null default now()
);

create table if not exists slots (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references schedules (id) on delete cascade,
  teacher_id uuid not null references teachers (id) on delete cascade,
  day date not null,
  time text not null check (time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  booked_by uuid references auth.users (id) on delete set null,
  booked_at timestamptz,
  unique (schedule_id, teacher_id, day, time)
);

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references schedules (id) on delete cascade,
  slot_id uuid references slots (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null,
  nickname text not null,
  label text not null,                      -- "이정길 선생님 10월 5일 월요일 14:00"
  created_at timestamptz not null default now(),
  cancelled_at timestamptz
);

create table if not exists schedule_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  data jsonb not null,                      -- {"<선생님 id>": {"1": ["14:00","15:00"], ... "5": [...]}}  (1=월 … 5=금)
  created_at timestamptz not null default now()
);

-- 2. 보안 정책 — 승인된 보호자와 관리자만 보고, 쓰기는 관리자만 (신청은 함수로)
alter table teachers enable row level security;
alter table schedules enable row level security;
alter table slots enable row level security;
alter table bookings enable row level security;
alter table schedule_templates enable row level security;

do $$
declare
  t text;
  p record;
begin
  foreach t in array array['teachers', 'schedules', 'slots', 'bookings', 'schedule_templates'] loop
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    if t <> 'schedule_templates' then
      execute format('create policy "members read %1$s" on public.%1$I for select to authenticated using (public.is_admin() or public.is_approved())', t);
    else
      execute format('create policy "admin read %1$s" on public.%1$I for select to authenticated using (public.is_admin())', t);
    end if;
    execute format('create policy "admin insert %1$s" on public.%1$I for insert to authenticated with check (public.is_admin())', t);
    execute format('create policy "admin update %1$s" on public.%1$I for update to authenticated using (public.is_admin()) with check (public.is_admin())', t);
    execute format('create policy "admin delete %1$s" on public.%1$I for delete to authenticated using (public.is_admin())', t);
  end loop;
end $$;

-- 3. 신청 — 승인된 보호자만, 빈 칸일 때만. 결과: ok / taken(다른 분이 먼저) / not_approved
create or replace function public.book_slot(p_slot uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_slot slots%rowtype;
  v_teacher text;
  v_dow text[] := array['일', '월', '화', '수', '목', '금', '토'];
begin
  select coalesce(nullif(btrim(center_nickname), ''), nickname) into v_name
  from profiles where user_id = auth.uid() and approved_at is not null;
  if v_name is null then
    return 'not_approved';
  end if;

  update slots set booked_by = auth.uid(), booked_at = now()
  where id = p_slot and booked_by is null
  returning * into v_slot;
  if not found then
    return 'taken';
  end if;

  select name into v_teacher from teachers where id = v_slot.teacher_id;
  insert into bookings (schedule_id, slot_id, user_id, nickname, label)
  values (
    v_slot.schedule_id, v_slot.id, auth.uid(), v_name,
    format('%s 선생님 %s월 %s일 %s요일 %s',
      v_teacher, extract(month from v_slot.day)::int, extract(day from v_slot.day)::int,
      v_dow[extract(dow from v_slot.day)::int + 1], v_slot.time)
  );
  return 'ok';
end;
$$;

-- 4. 취소 — 관리자만. 칸은 다시 비고, 신청 기록(댓글)은 남기되 취소 표시
create or replace function public.cancel_slot(p_slot uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    return 'not_allowed';
  end if;
  update bookings set cancelled_at = now() where slot_id = p_slot and cancelled_at is null;
  update slots set booked_by = null, booked_at = null where id = p_slot;
  return 'ok';
end;
$$;

revoke all on function public.book_slot(uuid) from public, anon;
revoke all on function public.cancel_slot(uuid) from public, anon;
grant execute on function public.book_slot(uuid) to authenticated;
grant execute on function public.cancel_slot(uuid) to authenticated;

-- 5. 실시간 반영 — 다른 분이 신청하면 열려 있는 화면도 바로 바뀌게
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'slots') then
    alter publication supabase_realtime add table slots;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'bookings') then
    alter publication supabase_realtime add table bookings;
  end if;
end $$;

-- 6. 선생님 명단 (처음 한 번만 — 이후엔 관리자 화면에서 고친다)
insert into teachers (name, sort_order)
select v.name, v.ord from (values ('설영수', 1), ('이정길', 2), ('이원재', 3), ('허홍석', 4), ('선우용', 5)) as v(name, ord)
where not exists (select 1 from teachers);

-- 확인: 선생님 5명이 보여야 한다
select name, sort_order from teachers order by sort_order;

-- 7. 공휴일 스케쥴 (2026-10 추가) — 월~금 한 주 대신 관리자가 고른 날짜들. 비어 있으면(null) 월~금
alter table schedules add column if not exists days jsonb;
