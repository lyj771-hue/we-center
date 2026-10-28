-- WE 소아재활센터 — 수업스케쥴 "한발 늦음" 기록 (대시보드 · 스케줄 잡기) (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
--
-- 보호자 화면엔 시간이 열려 있어 눌렀는데, 그 사이 다른 보호자가 먼저 잡은 경우(book_slot = 'taken')만 남긴다.
-- 같은 보호자가 같은 시간을 여러 번 눌러도 한 번만. 관리자만 읽는다.

create table if not exists booking_misses (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references schedules(id) on delete cascade,
  slot_id uuid references slots(id) on delete set null,
  user_id uuid not null,
  winner_id uuid,                              -- 먼저 잡은 보호자
  created_at timestamptz not null default now()
);
create unique index if not exists booking_misses_once on booking_misses (slot_id, user_id);
create index if not exists booking_misses_schedule on booking_misses (schedule_id);

alter table booking_misses enable row level security;
drop policy if exists "admin read booking_misses" on booking_misses;
create policy "admin read booking_misses" on booking_misses for select to authenticated using (public.is_admin());

-- 보호자가 'taken'을 받은 직후 부른다 — 정말 다른 분이 잡은 칸일 때만 남긴다
create or replace function public.log_booking_miss(p_slot uuid)
returns void
language sql security definer set search_path = public
as $$
  insert into booking_misses (schedule_id, slot_id, user_id, winner_id)
  select s.schedule_id, s.id, auth.uid(), s.booked_by
  from slots s
  where s.id = p_slot and auth.uid() is not null and s.booked_by is not null and s.booked_by <> auth.uid()
  on conflict (slot_id, user_id) do nothing;
$$;
revoke all on function public.log_booking_miss(uuid) from public, anon;
grant execute on function public.log_booking_miss(uuid) to authenticated;

select 'ok' as result;
