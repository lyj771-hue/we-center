-- WE 소아재활센터 — 메모에 "장)"이라고 적어 둔 의정부 수업을 결제방식 장맞춤으로 바꾸기 (2026-10, 한 번만)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. (jangmatchum.sql 을 먼저 실행해야 한다)
-- 여러 번 실행해도 괜찮다 — 두 번째부터는 바꿀 게 없어서 0으로 나온다.
--
-- 장맞춤이 생기기 전에는 의정부 시간표 메모(또는 결제 "직접 작성")에 "장)" · "(장" · "(장)"이라고 적어 두었다.
--   고정 수업 · 날짜별 칸: 결제 글자를 '장'(장맞춤)으로, 메모에서 그 표시를 지운다(메모가 그것뿐이면 메모 칸이 비워진다)
--   결제 기록(직접 작성): 결제를 장맞춤으로, 직접 작성 글자는 지운다 — 확정(빨강)·고름(파랑) 상태는 그대로
-- 의정부만 바꾼다. 맨 아래 숫자 = 바꾼 줄 수.

with f as (
  update fixed_lessons
  set payment = '장' || case when coalesce(payment, '') ilike '%x%' then 'x' else '' end,
      note = nullif(btrim(regexp_replace(note, '\(\s*장\s*\)?|장\s*\)', '', 'g')), '')
  where center = 'uijeongbu' and note ~ '\(\s*장|장\s*\)'
  returning 1
),
b as (
  update board_cells
  set payment = '장' || case when coalesce(payment, '') ilike '%x%' then 'x' else '' end,
      note = nullif(btrim(regexp_replace(note, '\(\s*장\s*\)?|장\s*\)', '', 'g')), '')
  where center = 'uijeongbu' and note ~ '\(\s*장|장\s*\)'
  returning 1
),
p as (
  update lesson_payments
  set method = 'jangmatchum',
      note = nullif(btrim(regexp_replace(note, '\(\s*장\s*\)?|장\s*\)', '', 'g')), '')
  where center = 'uijeongbu' and method = 'other' and note ~ '\(\s*장|장\s*\)'
  returning 1
)
select (select count(*) from f) as "고정 수업", (select count(*) from b) as "날짜별 칸", (select count(*) from p) as "결제 기록";
