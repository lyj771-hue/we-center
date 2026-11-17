-- WE 소아재활센터 — 선생님 앱 마이페이지: 내 월별 수업 진행 횟수 (2026-11)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
--
-- 진행 횟수 = 시간표에서 [결제 완료]로 확정된 수업(lesson_payments.confirmed). 로그인한 선생님 본인 것만.
--   사설   = 현금 · 신용카드(A·B·C) · 선결제(A·B·C)
--   지원금 = 바우처 · 굳센 · 장맞춤 · 꿈이든(소급 포함) · 우진학교(외부·자율) · 지원금
--   방문 · 직접 작성 · 미결제는 어느 쪽에도 넣지 않는다

create or replace function public.my_teacher_month_counts(p_months int default 12)
returns table (month text, private_count int, support_count int)
language sql stable security definer set search_path = public
as $$
  select to_char(lp.day, 'YYYY-MM') as month,
         count(*) filter (where lp.method in ('cash', 'card', 'card_b', 'card_c', 'prepaid', 'prepaid_b', 'prepaid_c'))::int,
         count(*) filter (where lp.method in ('voucher', 'gusen', 'jangmatchum', 'kkumideun', 'voucher_retro', 'gusen_retro', 'jangmatchum_retro', 'kkumideun_retro',
                                              'woojin', 'woojin_ext', 'woojin_self', 'subsidy'))::int
  from lesson_payments lp
  join teacher_logins tl on tl.teacher_id = lp.teacher_id and tl.user_id = auth.uid()
  where lp.confirmed is not false
    and lp.day >= (date_trunc('month', (now() at time zone 'Asia/Seoul')::date) - make_interval(months => greatest(p_months, 1) - 1))::date
    and lp.day <= (now() at time zone 'Asia/Seoul')::date + 62
  group by 1
  order by 1 desc;
$$;
revoke all on function public.my_teacher_month_counts(int) from public, anon;
grant execute on function public.my_teacher_month_counts(int) to authenticated;

select 'ok' as result;
