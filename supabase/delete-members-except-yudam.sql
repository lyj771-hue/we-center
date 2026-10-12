-- WE 소아재활센터 — 김유담 계정만 남기고 카카오 회원 계정 지우기 (2026-10-12)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 되돌릴 수 없다.
--
-- 지우는 계정: 진하록(5129749748) · 김채현(5124511392) · 문주원(5125293805)
-- 회원 정보(닉네임·뒷번호·승인·지원 항목)가 같이 지워지고 아이 명단과의 연결은 끊긴다. 아이 명단·고정 수업·결제 기록은 그대로.
-- 남기는 계정: 김유담(5121554106), 관리자 계정.

-- 혹시 남아 있는 수업스케쥴 신청은 먼저 비운다(지금은 없음)
update slots set booked_by = null, booked_at = null, cancel_state = null
where booked_by in ('fad1a650-f05a-4120-91a8-c0faeb8f32f6', '50deaba2-a590-4e8f-82c6-09e26bcbbe6c', 'fd31b089-45ea-477a-b659-acf0de554f5a');

delete from auth.users
where id in ('fad1a650-f05a-4120-91a8-c0faeb8f32f6', '50deaba2-a590-4e8f-82c6-09e26bcbbe6c', 'fd31b089-45ea-477a-b659-acf0de554f5a');

select count(*) as 남은_카카오_계정 from auth.users where id not in (select user_id from admins);
