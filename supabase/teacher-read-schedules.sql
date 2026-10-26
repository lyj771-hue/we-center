-- WE 소아재활센터 — 선생님도 수업스케쥴을 두 지점 모두 볼 수 있게 (2026-10-26)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
-- schedule.sql · teacher-login.sql 을 먼저 돌린 뒤에. 보기만 — 신청·수정 권한은 그대로(보호자·관리자).

do $$
declare t text;
begin
  foreach t in array array['schedules', 'slots', 'bookings'] loop
    execute format('drop policy if exists "teacher read %1$s" on public.%1$I', t);
    execute format('create policy "teacher read %1$s" on public.%1$I for select to authenticated using (public.is_teacher())', t);
  end loop;
end $$;
