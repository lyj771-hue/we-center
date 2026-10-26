-- WE 소아재활센터 — 게시글 표시(공지사항: 고른 센터·명절) (2026-10-26)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.

alter table posts add column if not exists tags text[];

select 'ok' as result;
