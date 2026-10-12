-- WE 소아재활센터 — 마이페이지 결제별 사용 기록(바우처·굳센·꿈이든·지원금·우진학교) (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
--
-- 시간표 [결제 완료]로 확정된 이번 달 수업 결제 — 보호자는 자기 아이 것만 본다. 매월 1일에 새 달로 넘어간다.

drop function if exists public.my_payment_history();
create function public.my_payment_history()
returns table (day date, method text, lesson_time text, teacher_name text, note text, at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  with c as (select id from children where guardian_user_id = auth.uid() limit 1)
  select lp.day, lp.method, lp.time, t.name, lp.note, lp.created_at
  from lesson_payments lp
  join c on c.id = lp.child_id
  left join teachers t on t.id = lp.teacher_id
  where lp.confirmed
    and lp.method in ('voucher', 'gusen', 'kkumideun', 'subsidy', 'woojin')
    and lp.day >= date_trunc('month', current_date)::date
    and lp.day < (date_trunc('month', current_date) + interval '1 month')::date
  order by lp.day, lp.time;
$$;
revoke all on function public.my_payment_history() from public, anon;
grant execute on function public.my_payment_history() to authenticated;

select 'ok' as result;
