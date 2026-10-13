-- WE 소아재활센터 — 직원 관리자 계정 (2026-10)
-- 관리자 로그인을 둘로: admin@we-center.local(전체, 수업 현황까지) / staff@we-center.local(직원, 수업 현황 메뉴 없음)
--
-- 먼저: Supabase 대시보드 → Authentication → Users → Add user → Create new user
--       이메일 staff@we-center.local, 비밀번호(전체 관리자와 다르게), "Auto Confirm User" 체크
-- 그다음: SQL Editor → New query → 이 파일을 붙여넣고 Run. 여러 번 실행해도 괜찮다.
-- (직원도 시간표·회원 관리 등을 쓰려면 DB 쓰기 권한이 있어야 해서 관리자 명단에 넣는다. 수업 현황은 화면에서만 가린다)

insert into admins (user_id)
select id from auth.users where email = 'staff@we-center.local'
on conflict do nothing;

select u.email, (a.user_id is not null) as 관리자 from auth.users u left join admins a on a.user_id = u.id
where u.email in ('admin@we-center.local', 'staff@we-center.local');
