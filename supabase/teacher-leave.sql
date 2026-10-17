-- WE 소아재활센터 — 선생님 휴무 · 보낼 알림 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
--
-- teacher_leaves   시간표(날짜별)에서 [휴무]로 남긴 기록 — 그날 · 선생님 · 센터 · 휴무 시간(비면 종일) · 사유.
--                  휴무 시간의 수업 칸은 "줄 + 휴무"(옮김과 같이 수업·결제에서 빠진다)로 바뀐다(화면에서).
-- outbox_messages  보낼 알림 — 알림톡 발송(솔라피)이 준비되기 전까지 여기 쌓아 두고, 준비되면 여기서 보낸다.
--                  status: pending(보낼 것) / sent / failed / skipped. vars = 템플릿 #{변수} 값.
-- 둘 다 관리자만.

create table if not exists teacher_leaves (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  teacher_id uuid not null references teachers (id) on delete cascade,
  center text not null default 'eunpyeong',
  times text[],                          -- null = 종일
  reason text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index if not exists teacher_leaves_day on teacher_leaves (day, center);
alter table teacher_leaves enable row level security;
drop policy if exists "admin all teacher_leaves" on teacher_leaves;
create policy "admin all teacher_leaves" on teacher_leaves for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists outbox_messages (
  id uuid primary key default gen_random_uuid(),
  template_id text not null,             -- message_templates.id (예: teacher_leave)
  ref_id uuid,                           -- 무엇 때문에 생긴 알림인지 (예: teacher_leaves.id)
  child_id uuid references children (id) on delete set null,
  user_id uuid,                          -- 받는 보호자 계정
  child_name text,
  phone text,                            -- 보낼 번호 (없으면 못 보냄)
  vars jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists outbox_messages_status on outbox_messages (status, created_at);
alter table outbox_messages enable row level security;
drop policy if exists "admin all outbox_messages" on outbox_messages;
create policy "admin all outbox_messages" on outbox_messages for all to authenticated using (public.is_admin()) with check (public.is_admin());
