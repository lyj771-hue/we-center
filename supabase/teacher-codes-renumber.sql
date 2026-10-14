-- WE 소아재활센터 — 선생님 회원 코드 다시 매기기 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. (teacher-login.sql 다음에)
--
-- 선생님 명단 순서(sort_order)대로 T001, T002 … 를 다시 붙이되, 김영훈 선생님은 이원재 선생님 바로 앞으로.
-- 명단 순서 자체(시간표 칸 순서)는 바꾸지 않는다 — 회원 코드만.

-- 아직 줄이 없는 선생님도 넣는다 (코드는 아래에서 매긴다)
insert into teacher_logins (teacher_id, member_code)
select id, 'TMP-' || id::text from teachers where not exists (select 1 from teacher_logins tl where tl.teacher_id = teachers.id);

with ordered as (
  select t.id,
         row_number() over (order by
           case when t.name = '김영훈' then coalesce((select sort_order from teachers where name = '이원재'), t.sort_order) - 0.5 else t.sort_order end,
           t.name) as n
  from teachers t
)
update teacher_logins tl set member_code = 'TMP-' || tl.teacher_id::text
where tl.teacher_id in (select id from ordered);

with ordered as (
  select t.id,
         row_number() over (order by
           case when t.name = '김영훈' then coalesce((select sort_order from teachers where name = '이원재'), t.sort_order) - 0.5 else t.sort_order end,
           t.name) as n
  from teachers t
)
update teacher_logins tl set member_code = 'T' || lpad(o.n::text, 3, '0')
from ordered o where o.id = tl.teacher_id;

-- 결과
select tl.member_code as 회원코드, t.name as 이름 from teacher_logins tl join teachers t on t.id = tl.teacher_id order by tl.member_code;
