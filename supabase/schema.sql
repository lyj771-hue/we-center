-- WE 소아재활센터 홈페이지 — Supabase 스키마 + 보안 정책 + 시드 데이터
-- 실행 방법: Supabase 대시보드 → SQL Editor → New query → 이 파일 전체를 붙여넣고 Run

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────
-- 1. 테이블
-- ─────────────────────────────────────────────

create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('thoughts', 'notices', 'etc')),
  title text not null,
  content text not null,
  image_url text,
  created_at timestamptz not null default now()
);

create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  center_id text not null check (center_id in ('susaek', 'uijeongbu')),
  name text not null,
  description text,
  image_url text,
  sort_order int not null default 0
);

create table if not exists therapists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text,
  description text,
  photo_url text,
  sort_order int not null default 0
);

create table if not exists subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  sort_order int not null default 0
);

create table if not exists location_info (
  id int primary key default 1,
  content text not null default '',
  image_urls text[] not null default '{}',
  constraint location_info_singleton check (id = 1)
);

-- ─────────────────────────────────────────────
-- 2. Row Level Security — 읽기는 누구나, 쓰기는 로그인한 관리자만
-- ─────────────────────────────────────────────

alter table posts enable row level security;
alter table rooms enable row level security;
alter table therapists enable row level security;
alter table subjects enable row level security;
alter table location_info enable row level security;

create policy "public read posts" on posts for select using (true);
create policy "admin insert posts" on posts for insert to authenticated with check (true);
create policy "admin update posts" on posts for update to authenticated using (true) with check (true);
create policy "admin delete posts" on posts for delete to authenticated using (true);

create policy "public read rooms" on rooms for select using (true);
create policy "admin insert rooms" on rooms for insert to authenticated with check (true);
create policy "admin update rooms" on rooms for update to authenticated using (true) with check (true);
create policy "admin delete rooms" on rooms for delete to authenticated using (true);

create policy "public read therapists" on therapists for select using (true);
create policy "admin insert therapists" on therapists for insert to authenticated with check (true);
create policy "admin update therapists" on therapists for update to authenticated using (true) with check (true);
create policy "admin delete therapists" on therapists for delete to authenticated using (true);

create policy "public read subjects" on subjects for select using (true);
create policy "admin insert subjects" on subjects for insert to authenticated with check (true);
create policy "admin update subjects" on subjects for update to authenticated using (true) with check (true);
create policy "admin delete subjects" on subjects for delete to authenticated using (true);

create policy "public read location_info" on location_info for select using (true);
create policy "admin insert location_info" on location_info for insert to authenticated with check (true);
create policy "admin update location_info" on location_info for update to authenticated using (true) with check (true);

-- ─────────────────────────────────────────────
-- 3. Storage — images 버킷: 읽기는 공개, 업로드/수정/삭제는 관리자만
-- ─────────────────────────────────────────────

create policy "public read images" on storage.objects for select using (bucket_id = 'images');
create policy "admin upload images" on storage.objects for insert to authenticated with check (bucket_id = 'images');
create policy "admin update images" on storage.objects for update to authenticated using (bucket_id = 'images') with check (bucket_id = 'images');
create policy "admin delete images" on storage.objects for delete to authenticated using (bucket_id = 'images');

-- ─────────────────────────────────────────────
-- 4. 시드 데이터 (기존 더미 콘텐츠 이관)
-- ─────────────────────────────────────────────

insert into rooms (center_id, name, description, image_url, sort_order) values
  ('susaek',     '대기실',   '편안한 휴식을 위한 대기 공간입니다.',                 '/images/rooms/susaek-waiting.svg', 1),
  ('susaek',     '치료실 1', '개인 심리운동 치료가 이루어지는 공간입니다.',         '/images/rooms/susaek-room1.svg', 2),
  ('susaek',     '치료실 2', '감각통합 치료를 위한 전용 공간입니다.',               '/images/rooms/susaek-room2.svg', 3),
  ('uijeongbu',  '대기실',   '편안한 휴식을 위한 대기 공간입니다.',                 '/images/rooms/uijeongbu-waiting.svg', 1),
  ('uijeongbu',  '치료실 1', '개인 심리운동 치료가 이루어지는 공간입니다.',         '/images/rooms/uijeongbu-room1.svg', 2),
  ('uijeongbu',  '치료실 2', '감각통합 치료를 위한 전용 공간입니다.',               '/images/rooms/uijeongbu-room2.svg', 3);

insert into therapists (name, role, description, photo_url, sort_order) values
  ('김지현', '심리운동 재활사', '10년의 임상 경험을 바탕으로 아동 심리운동 치료를 전문으로 합니다.', '/images/therapists/kim-jihyun.svg', 1),
  ('박소연', '감각통합 재활사', '감각처리 어려움을 가진 아동을 위한 맞춤형 치료를 제공합니다.', '/images/therapists/park-soyeon.svg', 2),
  ('이민준', '언어 재활사',     '언어 발달 지연 및 의사소통 향상을 위한 치료를 담당합니다.', '/images/therapists/lee-minjun.svg', 3);

insert into subjects (name, description, sort_order) values
  ('심리운동',     '움직임을 통해 아동의 심리적·신체적 발달을 촉진하는 치료입니다. 놀이, 운동, 신체 활동을 통해 자아 인식과 사회성을 향상시킵니다.', 1),
  ('감각통합치료', '감각 처리 과정의 어려움을 가진 아동을 위한 전문 치료입니다. 다양한 감각 자극을 통해 뇌의 통합 기능을 향상시킵니다.', 2),
  ('인지행동치료', '아동의 사고 패턴과 행동을 분석하고 긍정적인 방향으로 변화시키는 치료입니다.', 3),
  ('언어치료',     '언어 발달 지연, 조음 장애, 의사소통 어려움을 가진 아동을 위한 전문 치료입니다.', 4),
  ('미술치료',     '미술 활동을 통해 아동의 감정 표현과 창의적 발달을 도모하는 치료입니다.', 5),
  ('놀이치료',     '놀이를 매개로 아동의 심리적 문제를 해결하고 정서적 발달을 지원하는 치료입니다.', 6);

insert into location_info (id, content, image_urls) values (
  1,
  '수색 센터
서울특별시 은평구 수색로 예시 주소

의정부 센터
경기도 의정부시 예시 주소

주차 안내
건물 지하 주차장 이용 가능 (2시간 무료)',
  array['/images/location/susaek.svg', '/images/location/uijeongbu.svg']
);

insert into posts (category, title, content, image_url, created_at) values
(
  'thoughts',
  '아이의 속도를 기다려주는 것',
  '치료실에서 만나는 아이들은 저마다 다른 속도로 자랍니다. 어떤 아이는 한 걸음이 오래 걸리고, 어떤 아이는 어느 순간 훌쩍 자라 있기도 합니다.

부모님들은 종종 "우리 아이만 늦는 것 같다"는 불안을 이야기하십니다. 하지만 재활치료에서 가장 중요한 것은 옆 아이와의 비교가 아니라, 어제의 우리 아이와 오늘의 우리 아이를 비교하는 것입니다.

We센터는 각 아이의 속도를 존중하며, 작은 변화 하나하나를 부모님과 함께 기록하고 나누고자 합니다.',
  '/images/posts/th-1.svg',
  '2026-07-18T09:00:00.000Z'
),
(
  'thoughts',
  '감각통합치료, 언제 시작해야 할까요?',
  '"우리 아이가 유난히 촉각에 예민한데, 감각통합치료가 필요할까요?" 상담 중 가장 많이 받는 질문 중 하나입니다.

감각통합의 어려움은 옷의 태그를 불편해하거나, 특정 질감의 음식을 거부하거나, 큰 소리에 과도하게 반응하는 등 일상 속 작은 신호로 먼저 나타나는 경우가 많습니다.

중요한 것은 "문제가 확실해질 때까지 기다리는 것"이 아니라, 신호가 보일 때 전문가와 함께 아이의 감각 프로파일을 정확히 파악하는 것입니다. 조기에 개입할수록 아이가 일상에서 느끼는 불편함을 줄여줄 수 있습니다.',
  '/images/posts/th-2.svg',
  '2026-07-05T09:00:00.000Z'
),
(
  'thoughts',
  '치료실 밖에서도 이어지는 성장',
  '50분의 치료 시간은 아이의 하루 중 일부일 뿐입니다. 진짜 성장은 치료실을 나선 이후, 가정과 어린이집, 놀이터에서 이어집니다.

그래서 We센터는 매 회기가 끝난 뒤 부모님께 오늘 다룬 목표와 가정에서 함께 해볼 수 있는 작은 활동을 안내해 드리려 합니다. 치료사와 부모가 같은 방향을 보고 있을 때, 아이는 훨씬 더 안정적으로 자랍니다.',
  '/images/posts/th-3.svg',
  '2026-06-20T09:00:00.000Z'
),
(
  'notices',
  '8월 임시 휴진 안내 (광복절 연휴)',
  '안녕하세요, WE 소아재활센터입니다.

광복절 연휴로 인해 아래 기간 동안 수색·의정부 두 센터 모두 임시 휴진합니다.

- 휴진 기간: 2026년 8월 15일(토) ~ 8월 16일(일)
- 정상 진료: 2026년 8월 17일(월)부터

예약에 참고하시어 이용에 착오 없으시길 바랍니다. 감사합니다.',
  '/images/posts/no-1.svg',
  '2026-07-22T09:00:00.000Z'
),
(
  'notices',
  '의정부센터 언어치료 프로그램 신설 안내',
  '의정부센터에 언어치료 프로그램이 새롭게 개설되었습니다.

언어 발달 지연, 조음 장애, 의사소통 어려움을 겪는 아동을 대상으로 전문 언어재활사가 1:1 맞춤 치료를 진행합니다.

상담 및 초기 평가 예약은 센터로 전화 또는 방문 접수해 주시기 바랍니다.',
  '/images/posts/no-2.svg',
  '2026-07-12T09:00:00.000Z'
),
(
  'notices',
  '발달재활서비스 바우처 갱신 신청 안내',
  '2026년 하반기 발달재활서비스 바우처 갱신 신청 기간이 도래하였습니다.

기존에 바우처를 이용 중이신 회원님께서는 주소지 관할 주민센터에서 갱신 신청을 진행해 주시기 바라며, 필요 서류(진단서, 소견서 등) 발급과 관련해 도움이 필요하시면 센터로 문의해 주세요.',
  '/images/posts/no-3.svg',
  '2026-06-30T09:00:00.000Z'
),
(
  'etc',
  '2026 여름방학 부모교육 세미나 후기',
  '지난주 진행된 여름방학 부모교육 세미나에 많은 분들이 참석해 주셔서 감사합니다.

이번 세미나는 "가정에서 이어가는 감각통합 놀이"를 주제로, 실제 치료실에서 사용하는 도구를 가정용으로 대체하는 방법을 함께 실습해 보았습니다.

참석하지 못하신 분들을 위해 다음 학기에도 같은 주제의 세미나를 준비할 예정이니 많은 관심 부탁드립니다.',
  '/images/posts/et-1.svg',
  '2026-07-25T09:00:00.000Z'
),
(
  'etc',
  '센터 이용 자주 묻는 질문 (FAQ)',
  'Q. 초기 상담은 어떻게 예약하나요?
A. 전화 또는 센터 방문을 통해 초기 평가 예약이 가능합니다.

Q. 바우처와 일반 결제를 함께 사용할 수 있나요?
A. 네, 가능합니다. 자세한 내용은 결제정보 페이지를 참고해 주세요.

Q. 형제자매가 함께 대기할 수 있는 공간이 있나요?
A. 두 센터 모두 보호자 및 형제자매를 위한 대기 공간을 운영하고 있습니다.',
  '/images/posts/et-2.svg',
  '2026-07-08T09:00:00.000Z'
),
(
  'etc',
  '교구 및 도서 기부 안내',
  'We센터에서는 상태가 양호한 아동용 교구, 그림책, 감각놀이 도구 기부를 상시 받고 있습니다.

기부해 주신 물품은 소독 후 치료실 및 대기 공간에서 아이들을 위해 소중히 사용됩니다.

기부를 원하시는 분은 센터 데스크로 문의해 주시면 안내해 드리겠습니다.',
  '/images/posts/et-3.svg',
  '2026-06-15T09:00:00.000Z'
);
