-- WE 소아재활센터 — 보호자 화면(마이페이지·앱)에 소급 수업도 원래 결제로 보이기 + 굳센3회차미납은 '결제필요' (2026-11-19)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
-- (count-exclude-wonjae.sql · siblings.sql · gusen-extra.sql 다음에)
--
-- 바우처소급·굳센소급·꿈이든소급·장맞춤소급은 아직 [결제 완료]로 확정되지 않아 보호자 화면에서 빠져 있었다.
-- 이제 보호자에게는 그냥 바우처·굳센·꿈이든·장맞춤으로 보이고 그 달 횟수에도 센다(시간표 회차와 같게 — 소급은 원래 결제로 센다).
-- 나중에 실제 결제로 처리되면(소급 → 굳센) 같은 수업이 같은 자리·같은 회차 그대로 보인다.
-- 굳센 3회차인데 추가금액을 아직 안 받은 수업(굳센3회차미납)은 굳센으로 세고, 사용 내역에 pay_needed = true → 화면에 '결제필요'.

-- 소급 → 원래 결제
create or replace function public.retro_base(p_method text)
returns text
language sql immutable
as $$
  select case p_method
    when 'voucher_retro' then 'voucher'
    when 'gusen_retro' then 'gusen'
    when 'kkumideun_retro' then 'kkumideun'
    when 'jangmatchum_retro' then 'jangmatchum'
    else p_method end;
$$;

-- 결제 현황 — 이번 달 사용 횟수에 소급도 원래 결제로 센다 (count-exclude-wonjae.sql 과 같고 month_used 만 다름)
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
    select public.retro_base(lp.method) as method, count(*)::int as n from lesson_payments lp, c
    where lp.child_id = c.id
      and (lp.confirmed or lp.method in ('voucher_retro', 'gusen_retro', 'kkumideun_retro', 'jangmatchum_retro'))
      and not exists (select 1 from teachers x where x.id = lp.teacher_id and x.name = '이원재')
      and lp.day >= date_trunc('month', current_date)::date
      and lp.day < (date_trunc('month', current_date) + interval '1 month')::date
    group by 1
  ),
  manual as (
    select u.method, u.used from child_month_usage u, c where u.child_id = c.id and u.month = date_trunc('month', current_date)::date
  ),
  all_prepaid as (
    select lp.method, count(*)::int as n from lesson_payments lp, c
    where lp.child_id = c.id and lp.confirmed and not exists (select 1 from teachers x where x.id = lp.teacher_id and x.name = '이원재') and lp.method in ('prepaid', 'prepaid_b', 'prepaid_c')
    group by lp.method
  )
  select 'voucher', coalesce((select used from manual where method = 'voucher'), (select n from month_used where method = 'voucher'), 0), c.voucher_limit from c
  union all select 'gusen', coalesce((select used from manual where method = 'gusen'), (select n from month_used where method = 'gusen'), 0), c.gusen_limit from c
  union all select 'jangmatchum', coalesce((select used from manual where method = 'jangmatchum'), (select n from month_used where method = 'jangmatchum'), 0), 8 from c
  union all select 'kkumideun', coalesce((select used from manual where method = 'kkumideun'), (select n from month_used where method = 'kkumideun'), 0), c.kkumideun_limit from c
  union all select 'woojin_ext', coalesce((select n from month_used where method = 'woojin_ext'), 0), c.woojin_ext_balance from c
  union all select 'woojin_self', coalesce((select n from month_used where method = 'woojin_self'), 0), c.woojin_self_balance from c
  union all select 'subsidy', coalesce((select used from manual where method = 'subsidy'), (select n from month_used where method = 'subsidy'), 0), c.subsidy_balance from c
  union all select 'prepaid', coalesce((select n from all_prepaid where method = 'prepaid'), 0), c.prepaid_total from c
  union all select 'prepaid_b', coalesce((select n from all_prepaid where method = 'prepaid_b'), 0), c.prepaid_b_total from c
  union all select 'prepaid_c', coalesce((select n from all_prepaid where method = 'prepaid_c'), 0), c.prepaid_c_total from c;
$$;
revoke all on function public.my_payments(text) from public, anon;
grant execute on function public.my_payments(text) to authenticated;

-- 사용 내역 — 소급도 원래 결제로, 굳센3회차미납은 pay_needed (siblings.sql 과 같은 아이 조건)
-- 굳센 3회차 = 그 아이·그 달 [결제 완료]된 굳센을 날짜·시간 순으로 세어 3번째 (관리자 시간표와 같게, 2026/11/01 부터)
drop function if exists public.my_payment_history();
create function public.my_payment_history()
returns table (day date, method text, lesson_time text, teacher_name text, note text, at timestamptz, center text, pay_needed boolean)
language sql stable security definer set search_path = public
as $$
  with b as (
    select lp.*, (lp.method = 'gusen' and lp.confirmed and lp.day >= date '2026-11-01') as gusen_round
    from lesson_payments lp
    where lp.child_id in (select public.my_selected_children())
      and (lp.confirmed or lp.method in ('voucher_retro', 'gusen_retro', 'kkumideun_retro', 'jangmatchum_retro'))
      and not exists (select 1 from teachers x where x.id = lp.teacher_id and x.name = '이원재')
  ), r as (
    select b.*, row_number() over (partition by b.child_id, b.gusen_round, date_trunc('month', b.day) order by b.day, b.time) as rn
    from b
  )
  select r.day, public.retro_base(r.method), r.time, t.name, r.note, r.created_at, coalesce(r.center, 'eunpyeong'),
         (r.gusen_round and r.rn = 3 and not coalesce(r.extra_paid, false))
  from r
  left join teachers t on t.id = r.teacher_id
  where public.retro_base(r.method) in ('voucher', 'gusen', 'jangmatchum', 'kkumideun', 'subsidy', 'woojin', 'woojin_ext', 'woojin_self')
  order by r.day, r.time;
$$;
revoke all on function public.my_payment_history() from public, anon;
grant execute on function public.my_payment_history() to authenticated;

select 'ok' as result;
