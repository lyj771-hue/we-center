-- WE 소아재활센터 — 의정부 굳센을 전부 꿈이든으로 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 다시 실행해도 더 바뀌는 것은 없다.
-- 의정부는 굳센을 쓰지 않는다. 엑셀의 e 를 굳센으로 넣은 것을 꿈이든으로 고친다. 수색 기록은 건드리지 않는다.
-- 문장 하나로 한꺼번에 — 중간에 실패하면 아무것도 바뀌지 않는다.

with kid as (select id from children where center = 'uijeongbu'),
pays as (
  update lesson_payments lp
  set method = case lp.method when 'gusen' then 'kkumideun' else 'kkumideun_retro' end
  where lp.method in ('gusen', 'gusen_retro')
    and (lp.center = 'uijeongbu' or (lp.center is null and lp.child_id in (select id from kid)))
  returning 1
),
cells as (
  update board_cells set payment = replace(replace(payment, 'e', 'c'), 'E', 'C')
  where center = 'uijeongbu' and payment ~ '[eE]'
  returning 1
),
fixed as (
  update fixed_lessons set payment = replace(replace(payment, 'e', 'c'), 'E', 'C')
  where center = 'uijeongbu' and payment ~ '[eE]'
  returning 1
),
flags as (
  update children
  set uses_kkumideun = uses_kkumideun or uses_gusen, uses_gusen = false,
      kkumideun_limit = case when coalesce(kkumideun_limit, 0) = 0 then gusen_limit else kkumideun_limit end, gusen_limit = 0
  where center = 'uijeongbu' and (uses_gusen or coalesce(gusen_limit, 0) <> 0)
  returning 1
),
usage_move as (
  update child_month_usage u set method = 'kkumideun'
  where u.method = 'gusen' and u.child_id in (select id from kid)
    and not exists (select 1 from child_month_usage x where x.child_id = u.child_id and x.month = u.month and x.method = 'kkumideun')
  returning 1
),
usage_left as (
  select count(*) as n from child_month_usage u
  where u.method = 'gusen' and u.child_id in (select id from kid)
    and exists (select 1 from child_month_usage x where x.child_id = u.child_id and x.month = u.month and x.method = 'kkumideun')
)
select '결제 기록' as 항목, count(*)::text as 바뀐_수 from pays
union all select '시간표 칸 글자 e→c', count(*)::text from cells
union all select '고정 수업 글자 e→c', count(*)::text from fixed
union all select '아이 체크·한도', count(*)::text from flags
union all select '직접 적은 월 사용 횟수', count(*)::text from usage_move
union all select '꿈이든 값이 이미 있어 못 옮긴 월 사용 횟수', n::text from usage_left;
