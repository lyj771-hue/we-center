-- WE 소아재활센터 — 빈 수업 알림 고지 문구 줄이기 (2026-10-26)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run.
-- 스케줄 공지 · 스케줄 수정 알림 본문의 "※ 이 메시지는 …" 문장만 바꾼다.

update message_templates
set body = replace(body, '수업 신청을 위해 보호자님께 보내 드리는 빈 수업 알림으로', '수업 신청을 위한 빈 수업 알림으로'), updated_at = now()
where id in ('schedule_notice', 'schedule_updated') and body like '%보호자님께 보내 드리는 빈 수업 알림으로%';

select id, body::jsonb->>'body' as body from message_templates where id in ('schedule_notice', 'schedule_updated');
