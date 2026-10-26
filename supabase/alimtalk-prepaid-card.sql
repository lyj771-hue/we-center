-- WE 소아재활센터 — 공지 알림 원래대로 + 선결제 알림 그림을 카드 로고로 (2026-10-26)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.

-- 공지 알림 — 원래 모양으로
update message_templates
set label = '공지 알림',
    body = (body::jsonb || jsonb_build_object(
      'title', 'We 센터 공지사항',
      'items', jsonb_build_array(jsonb_build_object('name', '제목', 'value', '#{제목}'), jsonb_build_object('name', '게시일', 'value', '#{날짜}')),
      'body', E'#{이름} 님, 새 공지사항을 안내드립니다.\n자세한 내용은 아래 버튼을 눌러 확인해 주세요.',
      'button', jsonb_build_object('name', '공지 보기', 'url', 'https://we-center.vercel.app/notices/#{글번호}')))::text,
    updated_at = now()
where id = 'notice' and body like '{%';

-- 선결제 — 그림을 카드 로고(We 가로형 로고의 아이콘만 카드로)로
update message_templates
set body = jsonb_set(body::jsonb, '{image}', '"card"')::text, updated_at = now()
where id = 'prepaid_use' and body like '{%';

select id, label, body::jsonb->>'title' as title, body::jsonb->>'image' as image from message_templates where id in ('notice', 'prepaid_use');
