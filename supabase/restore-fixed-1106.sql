-- WE 소아재활센터 — 11/6 부터 비어 있는 고정 수업을 10/26 ~ 11/5 시간표(요일마다 가장 최근 날)대로 다시 채우기 (2026-11-08)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 결과는 같다.
--
-- 10/26(월) ~ 11/5(목) 날짜별 칸 중 고정 칸(왼쪽)을 요일·시간·선생님마다 가장 최근 날 것으로 본다
-- (11/2 ~ 11/5 에 바뀐 것이 10월 마지막 주보다 먼저). 그 날 아이가 있었고 그 자리에 지금 고정 수업이 없으면 11/6 부터의 고정 수업으로 넣는다 (수색·의정부 둘 다).
--   · 가장 최근 날에 그 칸이 비어 있었으면(none) 고정을 끝낸 것으로 보고 넣지 않는다
--   · '수업 안 함'(x)·'?' 칸은 그날 일이라 건너뛰고 그 전 같은 요일을 본다
--   · 지금 고정 수업이 있는 자리는 건드리지 않는다
--   · 결석했거나 다른 선생님에게 옮긴 칸도 고정으로 친다(그날만 그런 것)
--   · 아이·결제 글자·수업 종류(운동/구강)를 그대로 옮긴다. 메모는 그날 것이라 옮기지 않는다
--   · 11/6 이후 날짜에 따로 바꾼 칸(결석·비움 등)은 그대로 — 고정보다 그날 칸이 먼저 보인다
-- 맨 아래 결과: 지점·요일마다 넣은 고정 수업 수

with src as (
  select distinct on (b.center, b.teacher_id, extract(dow from b.day)::int, b.time)
         b.center, extract(dow from b.day)::int as weekday, b.teacher_id, b.time, b.child_id, b.name, coalesce(b.payment, '') as payment,
         coalesce(b.oral, false) as oral, b.kind, b.status
  from board_cells b
  where b.side = 'fixed' and b.status in ('child', 'none') and b.day between date '2026-10-26' and date '2026-11-05'
  order by b.center, b.teacher_id, extract(dow from b.day)::int, b.time, b.day desc
),
ins as (
  insert into fixed_lessons (center, weekday, teacher_id, time, child_id, name, payment, oral, kind, start_date)
  select s.center, s.weekday, s.teacher_id, s.time, s.child_id, s.name, s.payment, s.oral, s.kind, date '2026-11-06'
  from src s
  where s.status = 'child' and coalesce(btrim(s.name), '') <> ''
    and not exists (select 1 from fixed_lessons f
                    where f.center = s.center and f.teacher_id = s.teacher_id and f.weekday = s.weekday and f.time = s.time)
  on conflict (center, teacher_id, weekday, time) do nothing
  returning center, weekday
)
select case center when 'uijeongbu' then '의정부' else '수색' end as 지점,
       (array['일', '월', '화', '수', '목', '금', '토'])[weekday + 1] as 요일,
       count(*) as 넣은_고정수업
from ins
group by center, weekday
order by center, (weekday + 6) % 7;
