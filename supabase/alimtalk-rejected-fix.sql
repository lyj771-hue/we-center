-- WE 소아재활센터 — 카카오 반려된 알림톡 4개 고치기 (2026-10-26)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run.
-- 메시지 모양 화면에서 저장한 내용(message_templates.body JSON)에서 반려 이유에 걸린 곳만 바꾼다. 제목(하트 등)은 그대로 둔다.
--   스케줄 공지 · 스케줄 수정: 본문 끝에 "여러 번 발송된다"는 고지 문구 (이미 있으면 다시 붙이지 않는다)
--   공지: 목적을 '센터 휴무 일정 안내' 하나로 — 이름 · 제목 · 항목 · 본문 · 버튼을 새로
--   선결제: 카드 그림 → We 로고 그림

update message_templates
set body = jsonb_set(body::jsonb, '{body}', to_jsonb((body::jsonb->>'body') || E'\n\n※ 이 메시지는 We 센터 수업 신청을 위해 보호자님께 보내 드리는 빈 수업 알림으로, 새 빈 수업이 올라올 때마다 발송됩니다.'))::text,
    updated_at = now()
where id = 'schedule_notice' and body like '{%' and body not like '%빈 수업 알림으로%';

update message_templates
set body = jsonb_set(body::jsonb, '{body}', to_jsonb((body::jsonb->>'body') || E'\n\n※ 이 메시지는 We 센터 수업 신청을 위해 보호자님께 보내 드리는 빈 수업 알림으로, 빈 수업 안내가 바뀔 때마다 발송됩니다.'))::text,
    updated_at = now()
where id = 'schedule_updated' and body like '{%' and body not like '%빈 수업 알림으로%';

update message_templates
set label = '센터 휴무 일정 안내',
    body = (body::jsonb || jsonb_build_object(
      'title', 'We 센터 휴무 일정 안내',
      'items', jsonb_build_array(jsonb_build_object('name', '휴무', 'value', '#{제목}'), jsonb_build_object('name', '안내일', 'value', '#{날짜}')),
      'body', E'#{이름} 님, We 센터 휴무 일정을 안내드립니다.\n휴무일에는 수업이 없으니 아래 버튼에서 일정을 확인해 주세요.',
      'button', jsonb_build_object('name', '휴무 일정 보기', 'url', 'https://we-center.vercel.app/notices/#{글번호}')))::text,
    updated_at = now()
where id = 'notice' and body like '{%';

update message_templates
set body = jsonb_set(body::jsonb, '{image}', '"logo"')::text, updated_at = now()
where id = 'prepaid_use' and body like '{%';

select id, label, body::jsonb->>'title' as title, body::jsonb->>'image' as image from message_templates
where id in ('notice', 'schedule_notice', 'schedule_updated', 'prepaid_use');
