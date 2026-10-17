-- WE 소아재활센터 — 의정부 결제방식 "장맞춤" 추가 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
--
-- 의정부는 굳센 대신 장맞춤을 쓴다(화면에서 수색 = 굳센, 의정부 = 장맞춤). 굳센과 따로 센다.
-- 굳센처럼 한 달 회차를 세고 월 최대 8회 — 9회째부터 시간표에서 빨간 글씨로 [결제 완료]를 막는다(화면에서).
-- 시간표 결제 글자는 '장', 결제 칸에는 "장맞춤2"처럼 보인다.

-- 아이 명단 — 장맞춤을 쓰는 아이 체크
alter table children add column if not exists uses_jangmatchum boolean not null default false;

-- 결제 기록 · 그 달 직접 적은 사용 횟수에 장맞춤 허용
alter table lesson_payments drop constraint if exists lesson_payments_method_check;
alter table lesson_payments add constraint lesson_payments_method_check
  check (method in ('voucher', 'gusen', 'jangmatchum', 'kkumideun', 'woojin', 'subsidy', 'prepaid', 'card', 'cash', 'other'));

alter table child_month_usage drop constraint if exists child_month_usage_method_check;
alter table child_month_usage add constraint child_month_usage_method_check
  check (method in ('voucher', 'gusen', 'jangmatchum', 'kkumideun', 'woojin', 'subsidy', 'prepaid'));

-- ── 마이페이지 — multi-center-children.sql 의 함수들에 장맞춤을 더한 것 ──

-- 결제 기록(지난 달도) — 장맞춤 사용 카드
drop function if exists public.my_payment_history();
create function public.my_payment_history()
returns table (day date, method text, lesson_time text, teacher_name text, note text, at timestamptz, center text)
language sql
stable
security definer
set search_path = public
as $$
  select lp.day, lp.method, lp.time, t.name, lp.note, lp.created_at, coalesce(lp.center, 'eunpyeong')
  from lesson_payments lp
  left join teachers t on t.id = lp.teacher_id
  where lp.child_id in (select c.id from children c where c.guardian_user_id = auth.uid())
    and lp.confirmed
    and lp.method in ('voucher', 'gusen', 'jangmatchum', 'kkumideun', 'subsidy', 'woojin')
  order by lp.day, lp.time;
$$;
revoke all on function public.my_payment_history() from public, anon;
grant execute on function public.my_payment_history() to authenticated;

-- 내 아이 정보 — 맨 뒤에 uses_jangmatchum
drop function if exists public.my_child();
drop function if exists public.my_child(text);
create function public.my_child(p_center text default null)
returns table (
  member_code text,
  child_name text,
  child_number int,
  payment text,
  oral boolean,
  voucher boolean,
  gusen boolean,
  kkumideun boolean,
  woojin boolean,
  subsidy boolean,
  prepaid_eunpyeong int,
  prepaid_uijeongbu int,
  uses_voucher boolean,
  uses_gusen boolean,
  uses_kkumideun boolean,
  uses_prepaid boolean,
  uses_woojin boolean,
  uses_subsidy boolean,
  uses_jangmatchum boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select c.member_code, c.name, c.number, ''::text, c.oral,
         coalesce(p.voucher, false), coalesce(p.gusen, false), coalesce(p.kkumideun, false),
         coalesce(p.woojin, false), coalesce(p.subsidy, false),
         coalesce(p.prepaid_eunpyeong, 0), coalesce(p.prepaid_uijeongbu, 0),
         coalesce(c.uses_voucher, false), coalesce(c.uses_gusen, false), coalesce(c.uses_kkumideun, false), coalesce(c.uses_prepaid, false),
         coalesce(c.uses_woojin, false), coalesce(c.uses_subsidy, false), coalesce(c.uses_jangmatchum, false)
  from profiles p
  left join children c on c.id = public.my_center_child(p_center)
  where p.user_id = auth.uid();
$$;
revoke all on function public.my_child(text) from public, anon;
grant execute on function public.my_child(text) to authenticated;

-- 결제 현황 — 장맞춤 줄(이번 달 사용 / 한 달 8회)
drop function if exists public.my_payments();
drop function if exists public.my_payments(text);
create function public.my_payments(p_center text default null)
returns table (method text, used int, total int)
language sql
stable
security definer
set search_path = public
as $$
  with c as (select * from children where id = public.my_center_child(p_center)),
  month_used as (
    select lp.method, count(*)::int as n from lesson_payments lp, c
    where lp.child_id = c.id and lp.confirmed and lp.day >= date_trunc('month', current_date)::date
      and lp.day < (date_trunc('month', current_date) + interval '1 month')::date
    group by lp.method
  ),
  manual as (
    select u.method, u.used from child_month_usage u, c where u.child_id = c.id and u.month = date_trunc('month', current_date)::date
  ),
  all_prepaid as (
    select count(*)::int as n from lesson_payments lp, c where lp.child_id = c.id and lp.confirmed and lp.method = 'prepaid'
  )
  select 'voucher', coalesce((select used from manual where method = 'voucher'), (select n from month_used where method = 'voucher'), 0), c.voucher_limit from c
  union all select 'gusen', coalesce((select used from manual where method = 'gusen'), (select n from month_used where method = 'gusen'), 0), c.gusen_limit from c
  union all select 'jangmatchum', coalesce((select used from manual where method = 'jangmatchum'), (select n from month_used where method = 'jangmatchum'), 0), 8 from c
  union all select 'kkumideun', coalesce((select used from manual where method = 'kkumideun'), (select n from month_used where method = 'kkumideun'), 0), c.kkumideun_limit from c
  union all select 'woojin', coalesce((select used from manual where method = 'woojin'), (select n from month_used where method = 'woojin'), 0), c.woojin_balance from c
  union all select 'subsidy', coalesce((select used from manual where method = 'subsidy'), (select n from month_used where method = 'subsidy'), 0), c.subsidy_balance from c
  union all select 'prepaid', (select n from all_prepaid), c.prepaid_total from c;
$$;
revoke all on function public.my_payments(text) from public, anon;
grant execute on function public.my_payments(text) to authenticated;
