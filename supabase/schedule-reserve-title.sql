-- WE 소아재활센터 — '스케줄 게시 예정 알림' 제목에 다음주/공휴일 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
-- 제목: #{센터} #{스케줄} 수업 스케줄 게시 예정 안내 — #{스케줄} = 다음주(한 주 스케줄) / 공휴일(날짜를 고른 스케줄)
-- (schedule-reserve.sql 의 cron_schedule_prealert 만 다시 만든다)

-- 때가 된 글마다 그 센터 승인된 보호자(번호 있는)에게 한 묶음을 만들고, 아직 안 보낸 줄을 돌려준다
drop function if exists public.cron_schedule_prealert(text);
create function public.cron_schedule_prealert(p_secret text)
returns table (id uuid, template_id text, solapi_id text, phone text, vars jsonb)
language plpgsql security definer set search_path = public
as $$
#variable_conflict use_column
declare
  sc record;
  v_when text;
  v_batch uuid;
  v_dow text[] := array['일', '월', '화', '수', '목', '금', '토'];
begin
  if not public.cron_ok(p_secret) then
    return;
  end if;
  for sc in
    select s.* from schedules s
    where s.publish_at is not null and s.prealert_at is null and s.hidden_at is null
      and s.publish_at <= now() + interval '5 minutes' and s.publish_at > now() - interval '30 minutes'
    for update skip locked
  loop
    update schedules set prealert_at = now() where schedules.id = sc.id;
    v_batch := gen_random_uuid();
    v_when := to_char(sc.publish_at at time zone 'Asia/Seoul', 'YYYY/MM/DD') || '('
              || v_dow[extract(dow from sc.publish_at at time zone 'Asia/Seoul')::int + 1] || ') '
              || to_char(sc.publish_at at time zone 'Asia/Seoul', 'HH24:MI');
    insert into outbox_messages (template_id, ref_id, child_id, user_id, child_name, phone, vars, batch_id)
    select 'schedule_reserved', sc.id, ch.id, p.user_id, coalesce(ch.name, p.nickname), p.phone,
           jsonb_build_object('이름', coalesce(ch.name, p.nickname), '센터', case sc.center when 'uijeongbu' then '의정부점' else '수색점' end,
                              '스케줄', case when sc.days is null then '다음주' else '공휴일' end,
                              '제목', sc.title, '게시시간', v_when, '글번호', sc.id),
           v_batch
    from profiles p
    left join lateral (select c.id, c.name from children c where c.guardian_user_id = p.user_id order by (c.center = sc.center) desc limit 1) ch on true
    where p.phone is not null and coalesce(p.nickname, '') <> ''
      and ((coalesce(p.center, 'eunpyeong') = sc.center and p.approved_at is not null)
           or exists (select 1 from member_centers mc where mc.user_id = p.user_id and mc.center = sc.center and mc.approved_at is not null));
  end loop;

  return query
    select o.id, o.template_id, a.template_id, o.phone, o.vars
    from outbox_messages o left join alimtalk_templates a on a.id = o.template_id
    where o.template_id = 'schedule_reserved' and o.status = 'pending' and o.error is null
      and o.created_at > now() - interval '10 minutes';
end;
$$;
revoke all on function public.cron_schedule_prealert(text) from public;
grant execute on function public.cron_schedule_prealert(text) to anon, authenticated;

select 'ok' as result;
