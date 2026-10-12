-- WE 소아재활센터 — 수업 종류(운동 / 구강 / -) (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
--
-- kind: 'exercise'(운동) · 'oral'(구강) · null(-). 고정 수업·날짜별 칸마다, 그리고 아이마다 기본값(lesson_kind).
-- 예전 oral(구강 체크)은 그대로 두고 kind = 'oral' 과 맞춰 쓴다(다른 함수들이 oral 을 읽는다).

alter table children add column if not exists lesson_kind text;
alter table fixed_lessons add column if not exists kind text;
alter table board_cells add column if not exists kind text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'children_lesson_kind_check') then
    alter table children add constraint children_lesson_kind_check check (lesson_kind in ('exercise', 'oral'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fixed_lessons_kind_check') then
    alter table fixed_lessons add constraint fixed_lessons_kind_check check (kind in ('exercise', 'oral'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'board_cells_kind_check') then
    alter table board_cells add constraint board_cells_kind_check check (kind in ('exercise', 'oral'));
  end if;
end $$;

-- 처음 한 번: 구강 체크가 있던 것은 구강으로
update children set lesson_kind = 'oral' where oral and lesson_kind is null;
update fixed_lessons set kind = 'oral' where oral and kind is null;
update board_cells set kind = 'oral' where oral and kind is null;

select 'ok' as result;
