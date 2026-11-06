-- WE 소아재활센터 — 10월 은평 스케줄표 새 파일(11/3 받은 "(1)")에서 바뀐 칸만 시간표에 반영 (2026-11)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
--
-- 처음 넣은 파일(10/30)과 새 파일을 한 칸씩 비교한 결과 — 시간표가 달라지는 칸은 아래 6곳뿐이다(나머지는 회차 숫자만 붙음).
-- 결제는 건드리지 않는다: 결제 기록(lesson_payments)과 칸의 결제 글자(payment)는 그대로.
--   새 파일에서 결제 글자만 바뀐 칸(10/30 설영수 11:30 이원석·14:50 김리한, 선우용 18:30 옥경인, 10/31 선우용 09:50 이수현)은 반영하지 않는다.
-- 처음 넣은 뒤 화면에서 그 칸을 고쳤으면(이름이 다르면) 건드리지 않는다.

create temp table t_t on commit drop as select id, name from teachers;

-- 1. 결석 — 10/30 설영수 16:50 김규현, 10/31 이정길 12:20 김서윤
update board_cells b set absent = true, updated_at = now()
from t_t t
where t.id = b.teacher_id and b.center = 'eunpyeong' and b.side = 'fixed' and b.status = 'child' and not b.absent
  and ((b.day = date '2026-10-30' and t.name = '설영수' and b.time = '16:50' and b.name like '%김규현%')
    or (b.day = date '2026-10-31' and t.name = '이정길' and b.time = '12:20' and b.name like '%김서윤%'));

-- 2. 빈타임에서 빠진 아이 — 10/30 16:50 김예은(설영수·이정길·허홍석·선우용), 10/30 17:40 설영수 권민건
--    그 아이 그 시간 결제 기록이 있으면 지우지 않고 아래 결과에 남긴다
delete from board_cells b
using t_t t
where t.id = b.teacher_id and b.center = 'eunpyeong' and b.side = 'open' and b.day = date '2026-10-30'
  and ((b.time = '16:50' and t.name in ('설영수', '이정길', '허홍석', '선우용') and b.name like '%김예은%')
    or (b.time = '17:40' and t.name = '설영수' and b.name like '%권민건%'))
  and not exists (select 1 from lesson_payments p where p.child_id = b.child_id and p.day = b.day and p.time = b.time);

-- 3. 수업 안 함 — 10/30 허홍석 19:20 빈타임 "밴드" → x
update board_cells b set status = 'off', child_id = null, name = null, payment = '', absent = false, updated_at = now()
from t_t t
where t.id = b.teacher_id and b.center = 'eunpyeong' and b.side = 'open' and b.day = date '2026-10-30'
  and t.name = '허홍석' and b.time = '19:20' and b.name = '밴드';

-- 4. 새로 들어온 아이 — 10/31 이정길 12:20 빈타임 김유담 (화면에서 이미 넣었으면 그대로)
insert into board_cells (center, day, teacher_id, time, side, status, child_id, name, payment, oral, absent, moved, updated_at)
select 'eunpyeong', date '2026-10-31', t.id, '12:20', 'open', 'child', c.id, '김유담', 'b', false, false, false, now()
from t_t t
left join lateral (select id from children where name = '김유담' and coalesce(center, 'eunpyeong') = 'eunpyeong' limit 1) c on true
where t.name = '이정길'
on conflict (center, day, teacher_id, time, side) do nothing;

-- 결과 — 6곳 지금 상태 (결제기록 = 그 아이 그 시간 결제가 있는지)
select to_char(b.day, 'MM/DD') as 날짜, t.name as 선생님, b.time as 시간, case b.side when 'open' then '빈타임' else '고정' end as 칸,
       b.status as 상태, b.name as 이름, b.absent as 결석,
       exists (select 1 from lesson_payments p where p.child_id = b.child_id and p.day = b.day and p.time = b.time) as 결제기록
from board_cells b join t_t t on t.id = b.teacher_id
where b.center = 'eunpyeong'
  and ((b.day = date '2026-10-30' and ((t.name = '설영수' and b.time in ('16:50', '17:40')) or (b.time = '16:50' and b.side = 'open') or (t.name = '허홍석' and b.time = '19:20' and b.side = 'open')))
    or (b.day = date '2026-10-31' and t.name = '이정길' and b.time = '12:20'))
order by b.day, b.time, t.name, b.side;
