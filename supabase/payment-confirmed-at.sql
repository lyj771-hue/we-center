-- WE 소아재활센터 — 결제 기록에 '결제 완료를 누른 시각'(confirmed_at) 남기기 (2026-11-09)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
--
-- lesson_payments.day          = 수업한 날 (결제 완료 버튼에 해당되는 날) — 보호자 마이페이지·회차·차감은 이 날 기준
-- lesson_payments.confirmed_at = 관리자가 [결제 완료]를 누른 시각(처리일) — 관리자 내역에 수업일과 함께 보인다
--   · 확정될 때(처음 확정, 또는 확정된 결제방식을 바꿀 때) 지금 시각이 찍힌다. 확정을 풀면 지운다
--   · 지금까지 확정된 기록은 처음 저장한 시각(created_at)으로 채운다(정확한 누른 시각은 남아 있지 않아서)

alter table lesson_payments add column if not exists confirmed_at timestamptz;
update lesson_payments set confirmed_at = created_at where confirmed and confirmed_at is null;

create or replace function public.payment_confirmed_at()
returns trigger
language plpgsql
as $$
begin
  if new.confirmed then
    if tg_op = 'INSERT' or not old.confirmed or old.method is distinct from new.method then
      new.confirmed_at := now();
    else
      new.confirmed_at := coalesce(old.confirmed_at, new.confirmed_at, now());
    end if;
  else
    new.confirmed_at := null;
  end if;
  return new;
end;
$$;
drop trigger if exists lesson_payments_confirmed_at on lesson_payments;
create trigger lesson_payments_confirmed_at
  before insert or update on lesson_payments
  for each row execute function public.payment_confirmed_at();

select count(*) filter (where confirmed) as 확정된_기록, count(*) filter (where confirmed_at is not null) as 처리일_있는_기록 from lesson_payments;
