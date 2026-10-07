-- WE 소아재활센터 — 선생님 센터별 출근 요일 + 날짜별 선생님 추가 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
--
-- work_days: 센터마다 출근 요일 {"eunpyeong":[2,3,4,5],"uijeongbu":[1,6]} (0=일 … 6=토). 비어 있으면(null) 그 센터 모든 요일.
-- teacher_day_assign: 그날만 그 센터 시간표에 선생님 칸을 더한다(공휴일 등 어디서 일할지 그때 정할 때).

alter table teachers add column if not exists work_days jsonb;
update teachers set work_days = '{"eunpyeong":[2,3,4,5],"uijeongbu":[1,6]}' where name = '설영수';

create table if not exists teacher_day_assign (
  day date not null,
  teacher_id uuid not null references teachers (id) on delete cascade,
  center text not null check (center in ('eunpyeong', 'uijeongbu')),
  primary key (day, teacher_id, center)
);
alter table teacher_day_assign enable row level security;
drop policy if exists "admin all teacher_day_assign" on teacher_day_assign;
create policy "admin all teacher_day_assign" on teacher_day_assign for all to authenticated using (public.is_admin()) with check (public.is_admin());

select name, centers, work_days from teachers order by sort_order;
