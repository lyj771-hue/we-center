-- WE 소아재활센터 — 우진학교를 우진학교외부 · 우진학교자율로 나누기 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
--
-- 결제방식·쓰는 결제 체크·남은 금액이 둘로 나뉜다: woojin_ext(우진학교외부) / woojin_self(우진학교자율).
-- 남은 금액은 [결제 완료]로 확정될 때마다 6만원씩 저절로 빠지고, 확정을 풀거나 지우면 다시 더한다(아래 4).
-- 남은 금액이 6만원보다 적으면 시간표 결제 칸에서 고를 수 없다(화면에서 막는다).
-- 지금까지의 우진학교 남은 금액 · 체크 · 고정 결제 글자(우)는 우진학교외부로 옮긴다 — 자율인 아이는 아이 명단에서 고쳐 주세요.
-- 예전 결제 기록(woojin)은 그대로 '우진학교'로 남는다.

-- 1. 칸
alter table children add column if not exists woojin_ext_balance int not null default 0;
alter table children add column if not exists woojin_self_balance int not null default 0;
alter table children add column if not exists uses_woojin_ext boolean not null default false;
alter table children add column if not exists uses_woojin_self boolean not null default false;

-- 2. 지금 값 → 우진학교외부 (옮긴 뒤 예전 칸은 비워서 다시 실행해도 두 번 옮기지 않는다)
update children set woojin_ext_balance = woojin_ext_balance + woojin_balance, woojin_balance = 0 where woojin_balance <> 0;
update children set uses_woojin_ext = true, uses_woojin = false where uses_woojin;
update fixed_lessons set payment = replace(payment, '우', '외') where payment like '%우%';
update board_cells set payment = replace(payment, '우', '외') where payment like '%우%' and day >= current_date;

-- 3. 결제 기록에 우진학교외부·자율 허용
alter table lesson_payments drop constraint if exists lesson_payments_method_check;
alter table lesson_payments add constraint lesson_payments_method_check
  check (method in ('voucher', 'gusen', 'jangmatchum', 'kkumideun', 'woojin', 'woojin_ext', 'woojin_self', 'subsidy', 'prepaid', 'card', 'cash', 'other',
                    'voucher_retro', 'gusen_retro', 'jangmatchum_retro', 'kkumideun_retro', 'unpaid'));
alter table child_month_usage drop constraint if exists child_month_usage_method_check;
alter table child_month_usage add constraint child_month_usage_method_check
  check (method in ('voucher', 'gusen', 'jangmatchum', 'kkumideun', 'woojin', 'woojin_ext', 'woojin_self', 'subsidy', 'prepaid'));

-- 4. 확정되면 남은 금액에서 6만원 — 확정을 풀거나 결제방식을 바꾸거나 지우면 되돌린다
create or replace function public.woojin_balance_apply()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.confirmed and old.method in ('woojin_ext', 'woojin_self') then
    execute format('update children set %1$I = %1$I + 60000 where id = $1', old.method || '_balance') using old.child_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.confirmed and new.method in ('woojin_ext', 'woojin_self') then
    execute format('update children set %1$I = %1$I - 60000 where id = $1', new.method || '_balance') using new.child_id;
  end if;
  return null;
end;
$$;
drop trigger if exists lesson_payments_woojin_balance on lesson_payments;
create trigger lesson_payments_woojin_balance
  after insert or update or delete on lesson_payments
  for each row execute function public.woojin_balance_apply();

-- 5. 마이페이지 — jangmatchum.sql 의 함수들에 우진학교외부·자율을 더한 것

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
    and lp.method in ('voucher', 'gusen', 'jangmatchum', 'kkumideun', 'subsidy', 'woojin', 'woojin_ext', 'woojin_self')
  order by lp.day, lp.time;
$$;
revoke all on function public.my_payment_history() from public, anon;
grant execute on function public.my_payment_history() to authenticated;

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
  uses_jangmatchum boolean,
  uses_woojin_ext boolean,
  uses_woojin_self boolean
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
         coalesce(c.uses_woojin, false), coalesce(c.uses_subsidy, false), coalesce(c.uses_jangmatchum, false),
         coalesce(c.uses_woojin_ext, false), coalesce(c.uses_woojin_self, false)
  from profiles p
  left join children c on c.id = public.my_center_child(p_center)
  where p.user_id = auth.uid();
$$;
revoke all on function public.my_child(text) from public, anon;
grant execute on function public.my_child(text) to authenticated;

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
  union all select 'woojin_ext', coalesce((select n from month_used where method = 'woojin_ext'), 0), c.woojin_ext_balance from c
  union all select 'woojin_self', coalesce((select n from month_used where method = 'woojin_self'), 0), c.woojin_self_balance from c
  union all select 'subsidy', coalesce((select used from manual where method = 'subsidy'), (select n from month_used where method = 'subsidy'), 0), c.subsidy_balance from c
  union all select 'prepaid', (select n from all_prepaid), c.prepaid_total from c;
$$;
revoke all on function public.my_payments(text) from public, anon;
grant execute on function public.my_payments(text) to authenticated;

select 'ok' as result;
