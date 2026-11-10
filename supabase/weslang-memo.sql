-- WE 소아재활센터 — We슐랭 한 줄 메모 (2026-11-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
--
-- 글쓰기의 '한 줄 메모' — 목록에서 대표 사진 아래 크래프트지 메모에 손글씨로 보인다. 비우면 null(메모지 없음).

alter table posts add column if not exists memo text;
