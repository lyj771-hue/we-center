-- WE 소아재활센터 — We슐랭 메뉴 (2026-10)
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run. 여러 번 실행해도 괜찮다.
--
-- 게시글(posts)에 새 분류 'weslang'(We슐랭 — 가게 소개)과 가게 위치 칸(location)을 더한다.

alter table posts add column if not exists location text;

do $$
declare
  c record;
begin
  -- 분류 검사(thoughts·notices·etc)를 지우고 weslang 까지 넣어 다시 건다
  for c in select conname from pg_constraint where conrelid = 'public.posts'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%category%' loop
    execute format('alter table posts drop constraint %I', c.conname);
  end loop;
  alter table posts add constraint posts_category_check check (category in ('thoughts', 'notices', 'etc', 'weslang'));
end $$;

-- 예시 가게 두 곳(가상) — 화면 모양을 보려고 넣는다. 실제 가게를 올리면 [삭제]로 지우면 된다. 이미 있으면 다시 넣지 않는다
insert into posts (category, title, content, location, created_at)
select 'weslang', '[예시] 수색 바지락칼국수',
  '<p><img src="/weslang/kalguksu-1.jpg"></p><p>치료 끝나고 아이랑 들르기 좋은 칼국수집이에요. 국물이 맑고 짜지 않아서 아이들도 잘 먹어요.</p><p><img src="/weslang/kalguksu-2.jpg"></p><p>직접 담근 겉절이가 맛있고, 아기 의자도 있어요.</p><p><img src="/weslang/kalguksu-3.jpg"></p><p>※ 화면 모양을 보여 드리려고 만든 가상의 가게예요.</p>',
  '은평구 수색동 (예시 · 센터에서 걸어서 5분)', now() - interval '1 day'
where not exists (select 1 from posts where category = 'weslang' and title = '[예시] 수색 바지락칼국수');

insert into posts (category, title, content, location, created_at)
select 'weslang', '[예시] 의정부 동네 소금빵집',
  '<p><img src="/weslang/bakery-1.jpg"></p><p>의정부점 근처 작은 빵집이에요. 아침 10시에 나오는 소금빵이 금방 떨어져요.</p><p><img src="/weslang/bakery-2.jpg"></p><p>우유식빵은 아이 간식으로 좋아요. 창가 자리에서 수업 기다리기도 좋아요.</p><p><img src="/weslang/bakery-3.jpg"></p><p>※ 화면 모양을 보여 드리려고 만든 가상의 가게예요.</p>',
  '의정부시 의정부동 (예시 · 의정부점 길 건너)', now()
where not exists (select 1 from posts where category = 'weslang' and title = '[예시] 의정부 동네 소금빵집');

select 'ok' as result;
