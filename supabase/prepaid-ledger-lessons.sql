-- 보호자 화면 선결제 카드 — 사용(차감) 줄 메모에 그날 수업 시간만 옆으로 두 칸씩 띄워서 (선생님 이름 없이, 관리자 카드와 같게, 2026-11-20)
-- 예: 2026/11/18 사용 −2 · 메모 "15:40  16:30"
-- Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
-- (count-exclude-wonjae.sql 의 my_prepaid_ledger 를 바꾼다 — 휴직 중인 이원재 선생님 수업은 그대로 뺀다.
--  보호자 앱의 선생님 보기(viewer_call, teacher-view-child.sql)도 이 함수를 불러서 같이 바뀐다)

create or replace function public.my_prepaid_ledger(p_center text default null)
returns table (day date, kind text, count int, memo text, at timestamptz, method text)
language sql
stable
security definer
set search_path = public
as $$
  with c as (select public.my_center_child(p_center) as id)
  select pc.day, case when pc.adjust then 'adjust' else 'charge' end, pc.count, pc.memo, pc.created_at, pc.method from prepaid_charges pc, c where pc.child_id = c.id
  union all
  -- 사용 — 날짜·종류마다 한 줄. 메모 = 그날 수업 시간(시간 순, 앞 0 뺌), 두 칸 띄어 옆으로
  select lp.day, 'use'::text, count(*)::int,
         string_agg(regexp_replace(coalesce(lp.time::text, ''), '^0', ''), '  ' order by lpad(coalesce(lp.time::text, ''), 5, '0')),
         max(lp.created_at), lp.method
  from lesson_payments lp
  join c on lp.child_id = c.id
  where lp.method in ('prepaid', 'prepaid_b', 'prepaid_c') and lp.confirmed
    and not exists (select 1 from teachers x where x.id = lp.teacher_id and x.name = '이원재')
  group by lp.day, lp.method
  order by 1, 5;
$$;
revoke all on function public.my_prepaid_ledger(text) from public, anon;
grant execute on function public.my_prepaid_ledger(text) to authenticated;

select 'ok' as result;
