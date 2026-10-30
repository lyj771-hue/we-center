-- WE 소아재활센터 — 아이 명단 보호자 휴대전화 전체 번호·관계 칸 (2026-10)
-- phones: 번호들(숫자만), phone_relations: 같은 순서의 관계(맘·아버님·할머님 …, 이름만 저장된 번호는 빈칸).
-- 회원가입 때 받은 카카오계정 번호가 phones 중 하나와 같고 이름도 같으면 그 아이와 이어진다.
-- 번호 자체는 연락처 파일에서 만든 SQL(프로젝트에 저장하지 않음)로 넣는다. 이 파일은 칸만 만든다.
alter table children add column if not exists phones text[];
alter table children add column if not exists phone_relations text[];
select 'ok' as result;
