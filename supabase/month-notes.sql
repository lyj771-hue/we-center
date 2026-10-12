-- WE 소아재활센터 — 회원 관리 "결제내역" 탭의 월별 메모 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
--
-- child_month_notes: 아이·달마다 메모 한 줄 (관리자만).

create table if not exists child_month_notes (
  child_id uuid not null references children (id) on delete cascade,
  month date not null,                                   -- 그 달 1일
  memo text not null default '',
  updated_at timestamptz not null default now(),
  primary key (child_id, month)
);
alter table child_month_notes enable row level security;
drop policy if exists "admin all child_month_notes" on child_month_notes;
create policy "admin all child_month_notes" on child_month_notes for all to authenticated using (public.is_admin()) with check (public.is_admin());

select 'ok' as result;
