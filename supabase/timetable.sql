-- WE 소아재활센터 — 관리자 시간표 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
--
-- 날짜별 시간표: 시간 줄 × 선생님마다 [고정 | 빈타임] 두 칸 (센터 스프레드시트 "스케줄표"와 같은 모양)
--   children       아이 명단 — 이름, 같은 이름 구분 숫자, 기본 결제 방식(b=바우처 등), 메모
--   fixed_lessons  요일별 고정 수업 — 선생님 × 요일 × 시간 → 아이. 날짜별 표의 왼쪽(고정) 칸에 자동으로 깔린다
--   board_cells    날짜별 칸 — 그날만 바꾼 고정 칸(결석·옮김·변경·비움)과 빈타임 칸에 직접 넣은 아이, ?(미정), x(수업 안 함)
-- 보호자가 수업스케쥴에서 신청한 것은 빈타임 칸에 자동으로 보인다(slots 표). 모두 관리자만 보고 쓴다.

create table if not exists children (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  number int,                                -- 같은 이름 구분 숫자 (3김채현 의 3)
  payment text not null default '',          -- 기본 결제 방식 글자 (b, e, c, v …)
  memo text,
  created_at timestamptz not null default now()
);

create table if not exists fixed_lessons (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references teachers (id) on delete cascade,
  weekday int not null check (weekday between 0 and 6),   -- 0=일 1=월 … 6=토
  time text not null check (time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  child_id uuid references children (id) on delete set null,
  name text not null,                        -- 표에 보이는 이름 (아이 명단에 없어도 된다)
  payment text not null default '',
  oral boolean not null default false,       -- 구강 수업 (이름 앞 S)
  unique (teacher_id, weekday, time)
);

create table if not exists board_cells (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  teacher_id uuid not null references teachers (id) on delete cascade,
  time text not null check (time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  side text not null check (side in ('fixed', 'open')),   -- 왼쪽(고정) / 오른쪽(빈타임)
  status text not null check (status in ('child', 'undecided', 'off', 'none')),
    -- child = 아이 수업, undecided = ?(미정), off = x(그 시간 수업 안 함), none = 그날만 고정 수업 비움
  child_id uuid references children (id) on delete set null,
  name text,
  payment text not null default '',
  oral boolean not null default false,
  absent boolean not null default false,     -- 결석 (이름 뒤 x)
  moved boolean not null default false,      -- 다른 선생님에게 옮김 (줄 긋기)
  note text,
  updated_at timestamptz not null default now(),
  unique (day, teacher_id, time, side)
);

alter table children enable row level security;
alter table fixed_lessons enable row level security;
alter table board_cells enable row level security;

do $$
declare
  t text;
  p record;
begin
  foreach t in array array['children', 'fixed_lessons', 'board_cells'] loop
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('create policy "admin all %1$s" on public.%1$I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- 예시: 김유담 — 수요일 18:30 허홍석 선생님, 금요일 17:40 이정길 선생님 고정 (바우처)
insert into children (name, payment)
select '김유담', 'b' where not exists (select 1 from children where name = '김유담');

insert into fixed_lessons (teacher_id, weekday, time, child_id, name, payment)
select t.id, v.wd, v.tm, c.id, c.name, c.payment
from (values ('허홍석', 3, '18:30'), ('이정길', 5, '17:40')) as v(teacher, wd, tm)
join teachers t on t.name = v.teacher
join children c on c.name = '김유담'
on conflict (teacher_id, weekday, time) do nothing;

select f.name, t.name as teacher, f.weekday, f.time, f.payment from fixed_lessons f join teachers t on t.id = f.teacher_id order by f.weekday, f.time;
