-- WE 소아재활센터 — 시간표 칸 중 아이 명단과 안 이어진 이름을 다시 잇기 (2026-11)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
--
-- 엑셀을 넣을 때 명단에서 못 찾은 이름은 "3김주원"처럼 글자로만 들어가서 결제방식을 고를 수 없다.
-- 같은 지점 명단에서 아이를 찾아 잇는다:
--   1) 이름 + 앞 번호가 같은 아이 (3김주원 = 김주원, 번호 3 / 김주원 = 김주원, 번호 없음)
--   2) 없으면 번호를 빼고 이름이 같은 아이가 그 지점에 딱 한 명일 때
-- 맞는 아이가 여럿이면 잇지 않는다. 결제 기록은 건드리지 않는다.

with cells as (
  select b.id, b.center, b.name,
         nullif(substring(b.name from '^(\d+)'), '')::int as num,
         regexp_replace(b.name, '^\d+', '') as base
  from board_cells b
  where b.status = 'child' and b.child_id is null and b.name is not null
),
exact as (
  select c.id as cell_id, min(ch.id::text)::uuid as child_id
  from cells c join children ch
    on coalesce(ch.center, 'eunpyeong') = c.center and ch.name = c.base and coalesce(ch.number, 1) = coalesce(c.num, 1)
  group by c.id having count(*) = 1
),
by_name as (
  select c.id as cell_id, min(ch.id::text)::uuid as child_id
  from cells c join children ch on coalesce(ch.center, 'eunpyeong') = c.center and ch.name = c.base
  where c.id not in (select cell_id from exact)
  group by c.id having count(*) = 1
),
m as (select * from exact union all select * from by_name)
update board_cells b set child_id = m.child_id, name = ch.name
from m join children ch on ch.id = m.child_id
where b.id = m.cell_id;

-- 확인: 그래도 명단과 안 이어진 칸 (아이 명단에 넣거나 이름·번호를 고친 뒤 다시 실행)
select b.day as 날짜, b.center as 지점, t.name as 선생님, b.time as 시간, case b.side when 'open' then '빈타임' else '고정' end as 칸, b.name as 이름
from board_cells b left join teachers t on t.id = b.teacher_id
where b.status = 'child' and b.child_id is null and b.day >= date '2026-11-01'
order by b.day, b.center, t.name, b.time;
