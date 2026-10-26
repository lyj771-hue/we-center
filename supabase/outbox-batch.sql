-- WE 소아재활센터 — 단체 알림 묶음 (2026-10-26)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
-- outbox_messages.batch_id — 공지·스케줄 수정처럼 여러 보호자에게 한 번에 보낸 알림은 같은 값.
-- 알림 → 보호자 알림 내역에서 한 줄로 묶어 "N명"으로 보이고, 눌러서 누구에게 갔는지 본다.

alter table outbox_messages add column if not exists batch_id uuid;
create index if not exists outbox_messages_batch on outbox_messages (batch_id) where batch_id is not null;

select 'ok' as result;
