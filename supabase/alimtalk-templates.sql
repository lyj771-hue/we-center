-- WE 소아재활센터 — 알림톡 템플릿 ID (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
--
-- alimtalk_templates: 사이트 알림 종류(message_templates.id, 예: booking_result) → 솔라피 템플릿 ID(KA01TP…).
--   카카오 심사를 통과해 ID가 적힌 알림만 실제로 보낸다. 관리자만.

create table if not exists alimtalk_templates (
  id text primary key,
  template_id text not null,
  updated_at timestamptz not null default now()
);
alter table alimtalk_templates enable row level security;
drop policy if exists "admin all alimtalk_templates" on alimtalk_templates;
create policy "admin all alimtalk_templates" on alimtalk_templates for all to authenticated using (public.is_admin()) with check (public.is_admin());

select 'ok' as result;
