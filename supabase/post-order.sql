-- WE 소아재활센터 — 게시글 순서 (We슐랭 목록 순서 바꾸기) (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
-- sort_order: 관리자가 정한 순서(작을수록 위). 비어 있으면 아직 안 정한 새 글 — 맨 위에 올린 날짜 순으로 나온다.

alter table posts add column if not exists sort_order int;

select 'ok' as result;
