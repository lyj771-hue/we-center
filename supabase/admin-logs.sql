-- WE 소아재활센터 — 관리 내역 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
--
-- admin_logs: 관리자가 한 일을 남긴다 — 지금은 수업스케쥴 올리기·고치기(시간 넣기/빼기, 취소 승인, 신청 취소, 휴무, 제목·안내).
--   알림 → [관리 내역] 탭에서 본다. 관리자만 읽고 쓴다.

create table if not exists admin_logs (
  id uuid primary key default gen_random_uuid(),
  center text not null default 'eunpyeong',
  kind text not null,                        -- schedule_new / schedule_edit …
  title text not null,
  detail text,                               -- 한 일 목록(줄마다 하나)
  actor text,                                -- 관리자 / 직원
  ref_id uuid,                               -- 수업스케쥴 id 등
  created_at timestamptz not null default now()
);
create index if not exists admin_logs_created on admin_logs (created_at desc);
alter table admin_logs enable row level security;
drop policy if exists "admin all admin_logs" on admin_logs;
create policy "admin all admin_logs" on admin_logs for all to authenticated using (public.is_admin()) with check (public.is_admin());

select 'ok' as result;
