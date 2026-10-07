-- 카카오로 로그인한 계정을 모두 지운다 (관리자 계정 admin@we-center.local 은 남긴다)
-- 회원 정보(보호자 닉네임·뒷번호·승인 등)도 같이 지워지고, 아이 명단과의 연결은 끊긴다. 아이 명단·고정 수업·캘린더는 그대로.
delete from auth.users where id not in (select user_id from admins);
select count(*) as 남은_카카오_계정 from auth.users where id not in (select user_id from admins);
