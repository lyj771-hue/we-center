-- WE 소아재활센터 — 시간표를 센터별(은평 / 의정부)로 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
--
-- 선생님마다 일하는 센터(centers)를 적고, 고정 수업·날짜별 칸에 센터(center)를 붙인다.
-- 지금까지 넣은 시간표는 모두 은평. 설영수 선생님은 두 센터, 김영훈·문석현 선생님은 의정부.

-- 1. 선생님이 일하는 센터
alter table teachers add column if not exists centers text[] not null default '{eunpyeong}';
update teachers set centers = '{uijeongbu}' where name in ('김영훈', '문석현');
update teachers set centers = '{eunpyeong,uijeongbu}' where name = '설영수';

-- 2. 고정 수업·날짜별 칸의 센터 (기존 것은 모두 은평)
alter table fixed_lessons add column if not exists center text not null default 'eunpyeong';
alter table board_cells add column if not exists center text not null default 'eunpyeong';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fixed_lessons_center_check') then
    alter table fixed_lessons add constraint fixed_lessons_center_check check (center in ('eunpyeong', 'uijeongbu'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'board_cells_center_check') then
    alter table board_cells add constraint board_cells_center_check check (center in ('eunpyeong', 'uijeongbu'));
  end if;
  -- 같은 칸 규칙에 센터를 넣는다 (설영수 선생님이 두 센터에서 같은 시간에 따로 칸을 가질 수 있게)
  if exists (select 1 from pg_constraint where conname = 'fixed_lessons_teacher_id_weekday_time_key') then
    alter table fixed_lessons drop constraint fixed_lessons_teacher_id_weekday_time_key;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fixed_lessons_center_slot_key') then
    alter table fixed_lessons add constraint fixed_lessons_center_slot_key unique (center, teacher_id, weekday, time);
  end if;
  if exists (select 1 from pg_constraint where conname = 'board_cells_day_teacher_id_time_side_key') then
    alter table board_cells drop constraint board_cells_day_teacher_id_time_side_key;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'board_cells_center_slot_key') then
    alter table board_cells add constraint board_cells_center_slot_key unique (center, day, teacher_id, time, side);
  end if;
end $$;

select name, centers from teachers order by sort_order;
