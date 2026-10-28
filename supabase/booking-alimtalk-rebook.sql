-- WE 소아재활센터 — 수업 확정 알림톡: 취소했다가 다시 잡은 시간도 다시 보내기 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
-- 예전엔 그 시간에 한 번이라도 확정 알림을 만들었으면 다시 안 만들었다(10분 안 취소 → 다시 신청하면 알림이 안 감).
-- 이제는 이번 신청(booked_at) 뒤에 만든 알림만 본다.

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

select 'ok' as result;
