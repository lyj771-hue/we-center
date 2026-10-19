-- WE 소아재활센터 — 김유담(테스트) 기록·회원 정보 모두 지우기. 고정 수업(fixed_lessons)과 아이 명단(수색·의정부 김유담)은 남긴다 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 되돌릴 수 없다.
-- 지운 뒤 김유담 보호자 카카오 계정으로 다시 로그인하면 가입 창부터 새로 한다.

create temp table t_kids on commit drop as
  select id from children where name = '김유담';
create temp table t_users on commit drop as
  select guardian_user_id as uid from children where name = '김유담' and guardian_user_id is not null
  union
  select user_id from profiles where btrim(nickname) = '김유담' or btrim(coalesce(center_nickname, '')) = '김유담';

-- 수업·결제 기록 (두 지점 모두)
delete from lesson_payments where child_id in (select id from t_kids);
delete from board_cells where child_id in (select id from t_kids) or name = '김유담';
delete from child_month_usage where child_id in (select id from t_kids);
delete from child_month_notes where child_id in (select id from t_kids);
delete from prepaid_charges where child_id in (select id from t_kids);

-- 수업스케쥴 신청·신청 글
update slots set booked_by = null, booked_at = null, cancel_state = null where booked_by in (select uid from t_users);
delete from bookings where user_id in (select uid from t_users);

-- 보낼 알림 (휴무 등 — teacher-leave.sql 을 돌린 뒤에만 표가 있다)
do $$ begin
  if to_regclass('public.outbox_messages') is not null then
    delete from outbox_messages where child_id in (select id from t_kids) or user_id in (select uid from t_users);
  end if;
end $$;

-- 회원 정보 — 아이 연결 끊기, 지점 가입 기록·프로필 지우기 (카카오 계정은 남겨서 다시 로그인하면 새로 가입)
update children set guardian_user_id = null where id in (select id from t_kids) or guardian_user_id in (select uid from t_users);
delete from member_centers where user_id in (select uid from t_users);
delete from profiles where user_id in (select uid from t_users);

-- 결과 — 남은 것
select c.center as 지점, c.member_code as 코드, c.name as 이름,
       (select count(*) from fixed_lessons f where f.child_id = c.id) as 고정수업_남음,
       (select count(*) from lesson_payments p where p.child_id = c.id) as 결제기록,
       (select count(*) from prepaid_charges p where p.child_id = c.id) as 선결제기록,
       c.guardian_user_id is not null as 계정연결
from children c where c.name = '김유담';
