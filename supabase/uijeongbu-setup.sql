-- WE 소아재활센터 — 의정부 시간표 준비 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
--
-- 1. 고정 수업에 메모 (의정부 시간표의 메모 칸 — 40분 수업, 4시 시작 같은 것)
-- 2. 이원재 선생님: 은평은 월·화·목·금, 수요일은 의정부 (지금 병가 중)

alter table fixed_lessons add column if not exists note text;

update teachers
set centers = '{eunpyeong,uijeongbu}', work_days = '{"eunpyeong":[1,2,4,5],"uijeongbu":[3]}'
where name = '이원재';

select name, centers, work_days from teachers order by sort_order;
