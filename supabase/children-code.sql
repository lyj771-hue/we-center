-- WE 소아재활센터 — 아이 명단에 회원 코드 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
-- 회원 코드(W0001 …)는 아이마다 자동으로 붙는다. 보호자가 카카오로 가입하면 관리자가 회원 관리에서 이 코드로 아이와 계정을 잇는다.

create sequence if not exists children_code_seq;
alter table children add column if not exists member_code text;
alter table children alter column member_code set default ('W' || lpad(nextval('children_code_seq')::text, 4, '0'));
update children set member_code = 'W' || lpad(nextval('children_code_seq')::text, 4, '0') where member_code is null;
create unique index if not exists children_member_code_key on children (member_code);
alter table children add column if not exists oral boolean not null default false;   -- 구강 수업 아이 (S)

select member_code, name from children order by member_code;
