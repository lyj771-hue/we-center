-- WE 소아재활센터 — 관리자 "알림 메시지" 화면의 알림 종류별 메시지 포맷·알림 조건 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
--
-- message_templates: 알림 한 줄 = 종류(label) · 메시지 포맷(body, #{변수} 자리) · 알림 조건(condition). 관리자만.
-- 기본 종류는 아래에서 넣고(이미 있으면 그대로 둔다), 관리자가 화면에서 줄을 더 만들 수 있다.

create table if not exists message_templates (
  id text primary key,
  grp text not null default 'etc',                      -- 묶음: lesson / timetable / prepaid / member / fixed / etc
  label text not null,                                  -- 알림 종류
  body text not null default '',                        -- 메시지 포맷
  condition text not null default '',                   -- 알림 조건
  sort int not null default 0,
  updated_at timestamptz not null default now()
);
alter table message_templates enable row level security;
drop policy if exists "admin all message_templates" on message_templates;
create policy "admin all message_templates" on message_templates for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into message_templates (id, grp, label, sort) values
  ('lesson_tomorrow',  'lesson',    '내일 수업 시간 알림', 10),
  ('notice',           'lesson',    '공지 알림', 20),
  ('schedule_notice',  'lesson',    '스케줄 공지 알림', 30),
  ('booking_result',   'timetable', '시간표 신청/취소 확정 알림', 10),
  ('prepaid_use',      'prepaid',   '선결제 차감 알림', 10),
  ('prepaid_charge',   'prepaid',   '선결제 충전 알림', 20),
  ('prepaid_adjust',   'prepaid',   '선결제 잔여 횟수 변경 알림', 30),
  ('member_approved',  'member',    '회원가입 승인 알림', 10),
  ('fixed_change',     'fixed',     '고정 스케줄 변동 알림(확정/취소/변동)', 10)
on conflict (id) do nothing;

select 'ok' as result;
