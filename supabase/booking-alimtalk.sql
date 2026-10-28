-- WE 소아재활센터 — 보호자가 수업스케쥴에서 신청하면 '수업 확정' 알림톡 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
-- (alimtalk-templates.sql · teacher-leave.sql(outbox_messages) 다음에)
--
-- 신청은 보호자가 하므로, 보호자 계정으로도 '내 신청'에 대해서만 알림을 만들고 결과를 적을 수 있게 한다.
-- prepare_booking_alimtalk(칸): 내 신청인지 확인 → 보낼 알림 한 줄(outbox_messages)을 만들고 템플릿 ID·번호·변수를 돌려준다
-- mark_my_outbox(줄, 상태, 오류): 내 알림 줄의 결과(보냄·실패)를 적는다

create or replace function public.prepare_booking_alimtalk(p_slot uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  v_tid text;
  v_child record;
  v_phone text;
  v_name text;
  v_vars jsonb;
  v_id uuid;
  v_dow text[] := array['일', '월', '화', '수', '목', '금', '토'];
begin
  select s.id, s.day, s.time, s.booked_at, t.name as teacher, coalesce(sc.center, 'eunpyeong') as center into v
  from slots s join teachers t on t.id = s.teacher_id left join schedules sc on sc.id = s.schedule_id
  where s.id = p_slot and s.booked_by = auth.uid() and s.cancel_state is null;
  if not found then
    return null;
  end if;
  -- 같은 신청에 두 번 만들지 않는다 — 이번에 잡은 뒤(booked_at 이후)에 만든 것만 본다. 취소했다가 다시 잡으면 다시 보낸다
  if exists (select 1 from outbox_messages where ref_id::text = p_slot::text and template_id = 'booking_result' and user_id = auth.uid()
             and vars->>'신청결과' = '확정' and created_at >= coalesce(v.booked_at, now())) then
    return null;
  end if;
  select template_id into v_tid from alimtalk_templates where id = 'booking_result';
  select c.id, c.name into v_child from children c where c.guardian_user_id = auth.uid()
    order by (c.center = v.center) desc limit 1;
  select phone, nickname into v_phone, v_name from profiles where user_id = auth.uid();
  v_vars := jsonb_build_object(
    '이름', coalesce(v_child.name, v_name, ''),
    '날짜', to_char(v.day, 'YYYY/MM/DD'),
    '요일', v_dow[extract(dow from v.day)::int + 1],
    '시간', regexp_replace(v.time, '^0', ''),
    '선생님', v.teacher,
    '신청결과', '확정'
  );
  insert into outbox_messages (template_id, ref_id, child_id, user_id, child_name, phone, vars, status, error)
  values ('booking_result', p_slot, v_child.id, auth.uid(), coalesce(v_child.name, v_name, ''), v_phone, v_vars,
          case when v_phone is null then 'skipped' else 'pending' end,
          case when v_phone is null then '번호 없음' when v_tid is null then '솔라피 템플릿 ID가 아직 없어요' end)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'template_id', v_tid, 'phone', v_phone, 'vars', v_vars);
end;
$$;
revoke all on function public.prepare_booking_alimtalk(uuid) from public, anon;
grant execute on function public.prepare_booking_alimtalk(uuid) to authenticated;

create or replace function public.mark_my_outbox(p_id uuid, p_status text, p_error text)
returns void
language sql
security definer
set search_path = public
as $$
  update outbox_messages
  set status = p_status, error = p_error, sent_at = case when p_status = 'sent' then now() end
  where id = p_id and user_id = auth.uid() and status = 'pending' and p_status in ('sent', 'failed');
$$;
revoke all on function public.mark_my_outbox(uuid, text, text) from public, anon;
grant execute on function public.mark_my_outbox(uuid, text, text) to authenticated;

select 'ok' as result;
