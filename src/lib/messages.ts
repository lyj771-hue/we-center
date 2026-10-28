import { supabase } from './supabaseClient';

// 관리자 "알림 메시지" — 알림 종류별 메시지 포맷·알림 조건 (supabase/message-templates.sql)

export type MessageTemplate = { id: string; grp: string; label: string; body: string; condition: string; sort: number; updatedAt: string };

/** 묶음 — 이 순서로 보여 준다. vars = 그 묶음 메시지에 넣을 수 있는 #{변수} */
export const MESSAGE_GROUPS: { key: string; label: string; vars: string[] }[] = [
  { key: 'lesson',    label: '수업·공지',   vars: ['이름', '날짜', '월일', '요일', '센터', '제목', '글번호', '선생님', '시간', '사유', '수업1', '수업2', '수업3', '수업4', '수업5', '수업6', '수업7', '수업8'] },
  { key: 'timetable', label: '시간표 신청·취소', vars: ['이름', '날짜', '월일', '요일', '시간', '선생님', '센터', '신청결과', '남은시간', '구분', '내용'] },
  { key: 'prepaid',   label: '선결제',      vars: ['이름', '구분', '날짜', '기존횟수', '변동', '남은횟수'] },
  { key: 'member',    label: '회원',        vars: ['이름', '날짜', '센터', '결과'] },
  { key: 'fixed',     label: '고정 스케줄', vars: ['이름', '구분', '날짜', '요일', '수업', '선생님', '변동내용'] },
  { key: 'etc',       label: '기타',        vars: ['이름', '날짜', '센터'] },
  // 공지 메시지 — 메시지 모양 화면의 [공지 메시지] 탭. 공지사항 글을 올릴 때 목적별로 골라 보낸다(버튼 = 그 공지 글)
  { key: 'notice_kind', label: '공지 메시지', vars: ['이름', '센터', '명절', '글번호'] },
];

/** 미리보기용 예시 값 — 알림마다 다른 값은 DEFAULT_TEMPLATES 의 samples 가 덮어쓴다. 날짜는 늘 연도까지 */
export const SAMPLE_VARS: Record<string, string> = {
  이름: '김유담', 아이이름: '김유담', 날짜: '2026/10/16', 월일: '10/16', 요일: '목', 시간: '15:40', 선생님: '이정길', 센터: '은평점',
  제목: '추석 연휴 휴무 안내', 글번호: '1', 신청결과: '확정', 결과: '승인', 구분: '사용', 기존횟수: '46', 변동: '-2회', 남은횟수: '44',
  명절: '추석', 수업: '매주 화 15:40', 변동내용: '화 15:40 → 목 16:20', 사유: '휴무', 남은시간: '1시간 30분',
  게시시간: '2026/10/30(금) 15:30',
  수업1: '15:40 이정길 선생님', 수업2: '16:20 이정길 선생님', 수업3: '17:00 이정길 선생님', 수업4: '17:40 이정길 선생님',
  수업5: '10:00 이정길 선생님', 수업6: '10:40 이정길 선생님', 수업7: '11:20 이정길 선생님', 수업8: '13:20 이정길 선생님',
};

/** 메시지 화면·심사 올리기의 탭 — 보호자 알림 / 관리자에게 가는 알림 / 공지 메시지 */
export type MessageTab = 'alert' | 'admin' | 'notice';
/** 관리자에게 보내는 알림인지 — id 끝이 _admin(심사 화면은 _admin_2 처럼 개수가 붙을 수 있다) 이거나 이름에 (관리자에게) */
export const isAdminMessage = (t: { id?: string; key?: string; label?: string }) =>
  /_admin(_\d+)?$/.test(t.id ?? t.key ?? '') || (t.label ?? '').includes('(관리자에게)');
export const tabOfMessage = (t: { grp: string; id?: string; key?: string; label?: string }): MessageTab =>
  t.grp === 'notice_kind' ? 'notice' : isAdminMessage(t) ? 'admin' : 'alert';

/** 시스템에서 실제로 보내는 곳 — 심사 올리기 목록에 '발송 연결'로 보여 준다. 없으면 아직 보내는 기능이 없는 알림.
 *  새 알림을 보내게 만들면 여기에도 적는다 */
const SEND_WIRING: Record<string, string> = {
  lesson_tomorrow: '시간표 관리(날짜별) [이 날 수업 알림] 버튼',
  schedule_notice: '수업스케쥴 새 글을 올릴 때',
  schedule_reserved: '예약 게시한 수업스케쥴 글이 올라가기 5분 전 (서버가 저절로)',
  schedule_updated: '수업스케쥴 글을 고쳐 저장·다시 올릴 때, 선생님이 게시글 시간을 더할 때',
  teacher_leave: '시간표 관리 선생님 [휴무] 저장할 때',
  booking_result: '시간표 관리 [스케줄 변경 완료](수업 취소·확정), 보호자가 수업스케쥴 신청할 때, 신청 취소할 때',
  lesson_cancel_admin: '보호자 수업 취소 신청을 승인할 때 (관리자 번호로)',
  teacher_schedule_admin: '선생님이 수업스케쥴 게시글 시간을 더하거나 내릴 때 (관리자 번호로)',
  lesson_cancel_late: '수업 2시간 안 남기고 신청한 취소를 승인할 때',
  prepaid_use: '선결제 카드 충전·차감·수정, 시간표 [결제 완료]로 선결제 확정할 때',
  member_approved: '회원관리에서 [승인]할 때',
  fixed_change: '[이 날부터 고정]·고정 시간표에서 아이가 바뀔 때',
};
/** 이 알림(심사 화면 key, 예: lesson_tomorrow_3 · notice_holiday)을 시스템이 보내는 곳 — 없으면 undefined */
export const sendWiringOf = (key: string): string | undefined =>
  SEND_WIRING[key] ?? SEND_WIRING[key.replace(/_\d+$/, '')] ?? (key.startsWith('notice_') ? '공지사항에 글을 올릴 때 공지 메시지를 고르면' : undefined);

export const fillVars =(body: string, vars: Record<string, string> = SAMPLE_VARS) =>
  body.replace(/#\{([^}]+)\}/g, (m, k: string) => vars[k.trim()] ?? m);

/** 알림톡 모양 (아이템리스트형) — 맨 위 그림 · 타이틀 · 설명 · 항목 표 · 안내 글 · 버튼 */
export type MessageImage = 'none' | 'logo' | 'card';
export const MESSAGE_IMAGES: { key: MessageImage; label: string; src?: string }[] = [
  { key: 'logo', label: 'We 로고', src: '/alimtalk/logo.png' },
  { key: 'card', label: '선결제 카드', src: '/alimtalk/card.png' },
  { key: 'none', label: '그림 없음' },
];
export type MessageSpec = {
  image: MessageImage;
  title: string;
  sub: string;
  items: { name: string; value: string }[];
  body: string;
  button: { name: string; url: string };   // name 이 비면 버튼 없음
};
const EMPTY_SPEC: MessageSpec = { image: 'logo', title: '', sub: 'We 센터', items: [], body: '', button: { name: '', url: '' } };

/** DB body 칸에 JSON 으로 둔다. 예전처럼 글만 적힌 body 는 null (→ 기본 모양을 쓴다) */
export function parseSpec(body: string): MessageSpec | null {
  if (!body.trim().startsWith('{')) return null;
  try {
    const j = JSON.parse(body);
    return { ...EMPTY_SPEC, ...j, items: Array.isArray(j.items) ? j.items : [], button: { ...EMPTY_SPEC.button, ...(j.button ?? {}) } };
  } catch { return null; }
}
export const specToBody = (s: MessageSpec) => JSON.stringify(s);

const SITE = 'https://we-center.vercel.app';

type DefaultTemplate = Omit<MessageTemplate, 'updatedAt' | 'body'> & { spec: MessageSpec; samples?: Record<string, string> };

const fromRow = (r: Record<string, unknown>): MessageTemplate => ({
  id: r.id as string, grp: (r.grp as string) ?? 'etc', label: (r.label as string) ?? '', body: (r.body as string) ?? '',
  condition: (r.condition as string) ?? '', sort: (r.sort as number) ?? 0, updatedAt: r.updated_at as string,
});

/** 기본 알림 종류 — DB에 아직 없어도 나온다. 모양·조건은 처음 안(1차) — 화면에서 고쳐 [저장] */
export const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  {
    id: 'lesson_tomorrow', grp: 'lesson', label: '수업 일정 알림', sort: 10,
    spec: { image: 'logo', title: '#{이름} 님 수업 안내', sub: 'We 센터',
      items: [{ name: '일자', value: '#{날짜}(#{요일})' }, { name: '센터', value: '#{센터}' }, { name: '수업 1', value: '#{수업1}' }, { name: '수업 2', value: '#{수업2}' }],
      body: '#{이름} 님, #{월일}(#{요일}) 수업을 안내드립니다.\n변경이나 취소는 센터로 연락해 주세요.', button: { name: '주간 스케줄 보기', url: `${SITE}/mypage?d=#{날짜}` } },
    condition: '관리자가 날짜를 골라 보내면, 그날 수업이 있는 아이마다 한 번 (결석·다른 선생님으로 옮긴 수업은 빼고).\n수업 개수(1~8개)에 맞는 템플릿으로 보낸다 — 1개용~8개용을 따로 심사받는다.',
  },
  {
    id: 'schedule_notice', grp: 'lesson', label: '스케줄 공지 알림', sort: 30,
    spec: { image: 'logo', title: '#{센터} 빈 수업 안내', sub: 'We 센터',
      items: [{ name: '제목', value: '#{제목}' }, { name: '게시일', value: '#{날짜}' }],
      body: '#{이름} 님, 빈 수업 시간이 올라왔어요.\n아래 버튼을 눌러 원하시는 시간을 신청해 주세요.\n\n※ 이 메시지는 We 센터 수업 신청을 위한 빈 수업 알림으로, 새 빈 수업이 올라올 때마다 발송됩니다.', button: { name: '수업 신청하기', url: `${SITE}/schedule/#{글번호}` } },
    samples: { 제목: '이번주 10/20~10/24 빈타임 안내' },
    condition: '수업스케줄에 빈 수업 게시글을 올릴 때 관리자가 보낼지 고르면, 그 센터에 승인된 보호자 모두에게 한 번.\n먼저 신청한 순서로 정해지니 게시글을 올리는 즉시 보낸다.',
  },
  {
    id: 'schedule_reserved', grp: 'lesson', label: '스케줄 게시 예정 알림', sort: 32,
    spec: { image: 'logo', title: '#{센터} #{기간} 수업 스케줄 게시 예정 안내', sub: 'We 센터',
      items: [{ name: '제목', value: '#{제목}' }, { name: '게시 시간', value: '#{게시시간}' }],
      body: '#{이름} 님, 빈 수업 시간이 #{게시시간}에 올라와요.\n게시되면 아래 버튼을 눌러 원하시는 시간을 신청해 주세요. 먼저 신청한 순서로 정해져요.\n\n※ 이 메시지는 We 센터 수업 신청을 위한 빈 수업 게시 예정 알림으로, 예약된 빈 수업이 게시되기 5분 전에 발송됩니다.', button: { name: '빈 수업 보기', url: `${SITE}/schedule/#{글번호}` } },
    samples: { 제목: '다음 주 11/2~11/7 빈 수업 안내', 기간: '다음주' },
    condition: '수업스케줄 게시글을 예약 게시로 올리면, 게시 5분 전에 서버가 저절로 그 센터에 승인된 보호자(전화번호 있는) 모두에게 한 번.\n버튼은 그 게시글로 가고, 게시 전에 누르면 "몇 시에 게시돼요" 화면이 보이다가 게시 시각에 저절로 열린다. (supabase/schedule-reserve.sql)',
  },
  {
    id: 'schedule_updated', grp: 'lesson', label: '스케줄 수정 알림', sort: 35,
    spec: { image: 'logo', title: '#{센터} 빈 수업 안내 수정', sub: 'We 센터',
      items: [{ name: '제목', value: '#{제목}' }, { name: '수정일', value: '#{날짜}' }],
      body: '#{이름} 님, 빈 수업 안내가 업데이트되었어요.\n아래 버튼을 눌러 바뀐 시간을 확인해 주세요.\n\n※ 이 메시지는 We 센터 수업 신청을 위한 빈 수업 알림으로, 빈 수업 안내가 바뀔 때마다 발송됩니다.', button: { name: '수업 신청하기', url: `${SITE}/schedule/#{글번호}` } },
    samples: { 제목: '이번주 10/20~10/24 빈타임 안내' },
    condition: '수업스케줄 게시글을 [고치기]로 저장할 때 관리자가 보낼지 고르면, 또는 선생님이 게시글에 시간을 더할 때, 그 센터에 승인된 보호자(전화번호 있는) 모두에게 한 번.\n지금은 [보낼 알림]에 쌓아 두고, 솔라피 연결 뒤 보낸다.',
  },
  {
    id: 'teacher_leave', grp: 'lesson', label: '선생님 휴무 수업 취소 알림', sort: 40,
    spec: { image: 'logo', title: '#{이름} 님 수업 취소 안내', sub: 'We 센터',
      items: [{ name: '일자', value: '#{날짜}(#{요일})' }, { name: '시간', value: '#{시간}' }, { name: '선생님', value: '#{선생님} 선생님' }, { name: '사유', value: '#{사유}' }],
      body: '#{이름} 님, #{월일}(#{요일}) #{선생님} 선생님 휴무로 위 시간 수업이 취소되었습니다.', button: { name: '주간 스케줄 보기', url: `${SITE}/mypage?d=#{날짜}` } },
    samples: { 시간: '15:40, 16:20' },
    condition: '시간표(날짜별)에서 선생님 [휴무]를 저장할 때, 휴무 시간에 수업이 있던 아이(고정·빈타임 신청)마다 한 번.\n휴무 창에서 받을 아이를 고르고, 사유를 적으면 #{사유}에 들어간다(안 적으면 "휴무").\n지금은 [보낼 알림]에 쌓아 두고, 솔라피 연결 뒤 보낸다.',
  },
  {
    id: 'booking_result', grp: 'timetable', label: '시간표 신청 확정/취소 알림', sort: 10,
    spec: { image: 'logo', title: '#{이름} 님 수업 #{신청결과}', sub: 'We 센터',
      items: [{ name: '일자', value: '#{날짜}(#{요일})' }, { name: '시간', value: '#{시간}' }, { name: '선생님', value: '#{선생님} 선생님' }, { name: '결과', value: '#{신청결과}' }],
      body: '#{이름} 님, 신청하신 수업이 #{신청결과}되었습니다.\n변경이나 취소는 센터로 연락해 주세요.', button: { name: '주간 수업 보기', url: `${SITE}/mypage?d=#{날짜}` } },
    samples: { 날짜: '2026/10/20', 요일: '월' },
    condition: '보호자가 신청한 수업을 관리자가 확정하거나 취소할 때, 그 보호자에게 한 번.\n마이페이지 수업 취소 신청을 관리자가 승인할 때도 (2시간 넘게 남았을 때 신청한 것 — 아니면 늦은 취소 안내).\n#{신청결과} = 확정 / 취소',
  },
  {
    id: 'lesson_cancel_admin', grp: 'timetable', label: '보호자 수업 취소 알림 (관리자에게)', sort: 20,
    spec: { image: 'logo', title: '수업 취소 알림', sub: 'We 센터 #{센터}',
      items: [{ name: '아이', value: '#{이름}' }, { name: '일자', value: '#{날짜}(#{요일})' }, { name: '시간', value: '#{시간}' }, { name: '선생님', value: '#{선생님} 선생님' }, { name: '남은 시간', value: '#{남은시간}' }],
      body: '보호자가 신청한 수업 취소가 승인되었어요.\n시간표 관리에서 그 칸에 다른 아이를 넣을 수 있어요.', button: { name: '시간표 관리', url: `${SITE}/admin/timetable` } },
    samples: { 날짜: '2026/10/21', 요일: '화', 시간: '15:40' },
    condition: '보호자가 마이페이지에서 신청한 수업 취소를 관리자가 [알림] 화면에서 승인할 때 관리자에게 한 번 (받는 번호 = Vercel 환경 변수 ALIMTALK_ADMIN_PHONE).\n#{남은시간} = 취소 신청한 때 수업까지 남은 시간',
  },
  {
    id: 'teacher_schedule_admin', grp: 'timetable', label: '선생님 빈 수업 변경 알림 (관리자에게)', sort: 25,
    spec: { image: 'logo', title: '#{선생님} 선생님 빈 수업 변경', sub: 'We 센터 #{센터}', items: [],
      body: '#{선생님} 선생님이 빈 수업을 #{구분}\n#{내용}\n\n※ 이 메시지는 선생님이 수업스케쥴 게시글에서 시간을 더하거나 내릴 때 센터 관리자에게 발송돼요', button: { name: '시간표 관리', url: `${SITE}/admin/timetable` } },
    samples: { 선생님: '이정길', 구분: '추가했어요', 내용: '10/27(화) 15:40, 16:20', 센터: '수색점' },
    condition: '선생님이 수업스케쥴 게시글에서 내 시간을 더하거나(추가했어요) 내릴 때(내렸어요) 관리자에게 한 번 (받는 번호 = Vercel 환경 변수 ALIMTALK_ADMIN_PHONE). 내릴 때 보호자에게는 안 간다.\n#{구분} = 추가했어요 / 내렸어요',
  },
  {
    id: 'lesson_cancel_late', grp: 'timetable', label: '늦은 취소 안내 (보호자에게)', sort: 30,
    spec: { image: 'logo', title: '#{이름} 님 수업 취소 접수', sub: 'We 센터',
      items: [{ name: '일자', value: '#{날짜}(#{요일})' }, { name: '시간', value: '#{시간}' }, { name: '선생님', value: '#{선생님} 선생님' }],
      body: '#{이름} 님, 수업 취소가 접수되었습니다.\n다음부터는 수업 시작 최소 2시간 전에 취소해 주세요.', button: { name: '주간 스케줄 보기', url: `${SITE}/mypage?d=#{날짜}` } },
    samples: { 날짜: '2026/10/21', 요일: '화', 시간: '15:40' },
    condition: '보호자가 수업 시작 2시간이 안 남았을 때 마이페이지에서 취소를 신청했고, 관리자가 승인할 때 그 보호자에게 한 번 (수업 확정 취소 알림 대신).\n신청할 때 마이페이지에도 같은 안내 팝업이 뜬다.',
  },
  {
    id: 'prepaid_use', grp: 'prepaid', label: '선결제 사용·충전·변경 알림', sort: 10,
    // 그림 = 이미 통과한 We 로고 (카드 그림은 카카오 로고형 기준 ③ '로고 안 배경색 없이'에 걸려 반려됨)
    spec: { image: 'logo', title: '#{이름} 님 선결제 #{구분}', sub: 'We 센터',
      items: [{ name: '일자', value: '#{날짜}' }, { name: '기존 횟수', value: '#{기존횟수}회' }, { name: '변동', value: '#{변동}' }, { name: '남은 횟수', value: '#{남은횟수}회' }],
      body: '#{이름} 님, 선결제 #{구분} 내역을 안내드립니다.\n전체 내역은 아래 버튼에서 볼 수 있어요.', button: { name: '선결제 카드 보기', url: `${SITE}/mypage` } },
    samples: { 날짜: '2026/10/15' },
    condition: '사용: 시간표 관리에서 [결제 완료]로 확정할 때, 선결제로 결제한 아이마다 하루 한 번 (그날 횟수를 합쳐서).\n충전: 관리자가 선결제 충전을 저장할 때.\n변경: 관리자가 잔여 횟수를 직접 고칠 때.\n#{구분} = 사용 / 충전 / 변경, #{변동} = -2회 / +20회 / -4회',
  },
  {
    id: 'member_approved', grp: 'member', label: '회원가입 승인/거절 알림', sort: 10,
    spec: { image: 'logo', title: '#{이름} 님 회원가입 #{결과}', sub: 'We 센터',
      items: [{ name: '신청일', value: '#{날짜}' }, { name: '센터', value: '#{센터}' }, { name: '결과', value: '#{결과}' }],
      body: '#{이름} 님, We 센터 회원가입이 #{결과}되었습니다.\n문의는 센터로 연락해 주세요.', button: { name: '홈페이지 바로가기', url: SITE } },
    samples: { 날짜: '2026/10/14' },
    condition: '관리자가 회원 관리에서 승인하거나 거절할 때, 그 보호자에게 한 번.\n#{결과} = 승인 / 거절 (거절 버튼은 아직 없음 — 발송 기능 만들 때 같이)',
  },
  {
    id: 'fixed_change', grp: 'fixed', label: '고정 스케줄 확정/취소/변동 알림', sort: 10,
    spec: { image: 'logo', title: '#{이름} 님 고정 수업 #{구분}', sub: 'We 센터',
      items: [{ name: '적용일', value: '#{날짜}(#{요일})' }, { name: '수업', value: '#{수업}' }, { name: '선생님', value: '#{선생님} 선생님' }, { name: '내용', value: '#{변동내용}' }],
      body: '#{이름} 님, 고정 수업이 #{구분}되었습니다.\n문의는 센터로 연락해 주세요.', button: { name: '주간 스케줄 보기', url: `${SITE}/mypage?d=#{날짜}` } },
    samples: { 날짜: '2026/10/22', 구분: '변동' },
    condition: '관리자가 아이의 고정 수업을 새로 정하거나(확정), 끝내거나(취소), 요일·시간·선생님을 바꿀 때(변동) 그 보호자에게 한 번.\n#{구분} = 확정 / 취소 / 변동',
  },
  // ── 공지 메시지 (목적별) — 카카오가 '공지' 같은 넓은 말머리를 반려해서 목적마다 나눴다. 여러 명에게 가니 본문 끝에 고지 문장
  {
    id: 'notice_schedule_upload', grp: 'notice_kind', label: '수업 스케줄 업로드 일정 안내', sort: 10,
    spec: { image: 'logo', title: '#{센터} 수업 스케줄 업로드 일정 안내', sub: 'We 센터', items: [],
      body: '#{이름} 님,\n수업 스케줄 업로드 일정을 안내드려요\n빈 수업은 올라온 뒤 먼저 신청한 순서로 정해져요\n\n※ 이 메시지는 We 센터 수업 스케줄 업로드 일정 안내로, 새 스케줄을 올리기 전에 발송돼요', button: { name: '안내 보기', url: `${SITE}/notices/#{글번호}` } },
    condition: '공지사항에 이 목적의 글을 올릴 때 관리자가 골라 보내면, 승인된 보호자 모두에게 한 번. 버튼은 그 공지 글로 간다.',
  },
  {
    id: 'notice_christmas', grp: 'notice_kind', label: '크리스마스 행사 일정 안내', sort: 20,
    spec: { image: 'logo', title: 'We 센터 크리스마스 행사 일정 안내', sub: 'We 센터', items: [],
      body: '#{이름} 님,\n크리스마스 행사를 안내드려요\n자세한 일정과 참여 방법은 아래 버튼에서 확인해 주세요\n\n※ 이 메시지는 We 센터 크리스마스 행사 안내로, 행사 일정이 있을 때 발송돼요', button: { name: '행사 안내 보기', url: `${SITE}/notices/#{글번호}` } },
    condition: '공지사항에 이 목적의 글을 올릴 때 관리자가 골라 보내면, 승인된 보호자 모두에게 한 번. 버튼은 그 공지 글로 간다.',
  },
  {
    id: 'notice_copay', grp: 'notice_kind', label: '본인 부담금 납부 안내', sort: 30,
    spec: { image: 'logo', title: '#{센터} 본인 부담금 납부 안내', sub: 'We 센터', items: [],
      body: '#{이름} 님,\n바우처 본인 부담금 납부를 안내드려요\n이미 납부하셨다면 이 안내는 넘기셔도 돼요\n\n※ 이 메시지는 We 센터 본인 부담금 납부 안내로, 매월 납부 기간에 발송돼요', button: { name: '납부 안내 보기', url: `${SITE}/notices/#{글번호}` } },
    condition: '공지사항에 이 목적의 글을 올릴 때 관리자가 골라 보내면, 승인된 보호자 모두에게 한 번. 버튼은 그 공지 글로 간다.',
  },
  {
    id: 'notice_hoppang', grp: 'notice_kind', label: '호빵데이 운영 일정 안내', sort: 40,
    spec: { image: 'logo', title: '#{센터} 호빵데이 운영 일정 안내', sub: 'We 센터', items: [],
      body: '#{이름} 님,\n호빵데이 운영 일정을 안내드려요\n자세한 일정과 참여 방법은 아래 버튼에서 확인해 주세요\n\n※ 이 메시지는 We 센터 호빵데이 행사 안내로, 행사 일정이 있을 때 발송돼요', button: { name: '운영 일정 보기', url: `${SITE}/notices/#{글번호}` } },
    condition: '공지사항에 이 목적의 글을 올릴 때 관리자가 골라 보내면, 승인된 보호자 모두에게 한 번. 버튼은 그 공지 글로 간다.',
  },
  {
    id: 'notice_writing', grp: 'notice_kind', label: '백일장 투표 참여 안내', sort: 50,
    spec: { image: 'logo', title: 'We 센터 백일장 투표 참여 안내', sub: 'We 센터', items: [],
      body: '#{이름} 님,\n센터 백일장 투표 참여를 안내드려요\n자세한 일정과 참여 방법은 아래 버튼에서 확인해 주세요\n\n※ 이 메시지는 We 센터 백일장 참여 안내로, 백일장이 있을 때 발송돼요', button: { name: '백일장 안내 보기', url: `${SITE}/notices/#{글번호}` } },
    condition: '공지사항에 이 목적의 글을 올릴 때 관리자가 골라 보내면, 승인된 보호자 모두에게 한 번. 버튼은 그 공지 글로 간다.',
  },
  {
    id: 'notice_marathon', grp: 'notice_kind', label: '마라톤 참여 일정 안내', sort: 60,
    spec: { image: 'logo', title: 'We 센터 마라톤 참여 일정 안내', sub: 'We 센터', items: [],
      body: '#{이름} 님,\nWe 센터와 함께하는 마라톤 일정을 안내드려요\n자세한 일정과 참여 방법은 아래 버튼에서 확인해 주세요\n\n※ 이 메시지는 We 센터 마라톤 행사 안내로, 행사 일정이 있을 때 발송돼요', button: { name: '참여 일정 보기', url: `${SITE}/notices/#{글번호}` } },
    condition: '공지사항에 이 목적의 글을 올릴 때 관리자가 골라 보내면, 승인된 보호자 모두에게 한 번. 버튼은 그 공지 글로 간다.',
  },
  {
    id: 'notice_no_gift', grp: 'notice_kind', label: '선물 안 주고 안 받기 안내', sort: 70,
    spec: { image: 'logo', title: 'We 센터 선물 안 주고 안 받기 안내', sub: 'We 센터', items: [],
      body: '#{이름} 님,\nWe 센터는 선생님께 드리는 선물과 간식을 정중히 사양하고 있어요\n보내 주시는 마음만 감사히 받을게요\n\n※ 이 메시지는 We 센터 선물 안 주고 안 받기 안내로, 센터 운영 방침을 안내할 때 발송돼요', button: { name: '안내 보기', url: `${SITE}/notices/#{글번호}` } },
    condition: '공지사항에 이 목적의 글을 올릴 때 관리자가 골라 보내면, 승인된 보호자 모두에게 한 번. 버튼은 그 공지 글로 간다.',
  },
  {
    id: 'notice_lost', grp: 'notice_kind', label: '분실물 보관 안내', sort: 80,
    spec: { image: 'logo', title: '#{센터} 분실물 보관 안내', sub: 'We 센터', items: [],
      body: '#{이름} 님,\n센터에서 보관 중인 분실물을 안내드려요\n꼭 확인하시고 센터로 연락 부탁드려요\n\n※ 이 메시지는 We 센터 분실물 보관 안내로, 보관 중인 분실물이 있을 때 발송돼요', button: { name: '분실물 보기', url: `${SITE}/notices/#{글번호}` } },
    condition: '공지사항에 이 목적의 글을 올릴 때 관리자가 골라 보내면, 승인된 보호자 모두에게 한 번. 버튼은 그 공지 글로 간다.',
  },
  {
    id: 'notice_facility', grp: 'notice_kind', label: '시설 점검 안내', sort: 90,
    spec: { image: 'logo', title: '#{센터} 시설 점검 안내', sub: 'We 센터', items: [],
      body: '#{이름} 님,\n센터 시설 점검 일정을 안내드려요\n점검 시간에는 일부 공간 이용이 제한될 수 있어요\n\n※ 이 메시지는 We 센터 시설 점검 안내로, 점검 일정이 있을 때 발송돼요', button: { name: '안내 보기', url: `${SITE}/notices/#{글번호}` } },
    condition: '공지사항에 이 목적의 글을 올릴 때 관리자가 골라 보내면, 승인된 보호자 모두에게 한 번. 버튼은 그 공지 글로 간다.',
  },
  {
    id: 'notice_holiday_lessons', grp: 'notice_kind', label: '명절 연휴 수업 운영 안내', sort: 100,
    spec: { image: 'logo', title: '#{센터} #{명절} 연휴 수업 운영 안내', sub: 'We 센터', items: [],
      body: '#{이름} 님,\n#{명절} 연휴 기간 수업 운영 일정을 안내드려요\n연휴 중 수업 여부는 아래 버튼에서 확인해 주세요\n\n※ 이 메시지는 We 센터 명절 연휴 수업 운영 안내로, 명절 연휴 전에 발송돼요', button: { name: '안내 보기', url: `${SITE}/notices/#{글번호}` } },
    condition: '공지사항에 이 목적의 글을 올릴 때 관리자가 골라 보내면, 승인된 보호자 모두에게 한 번. 버튼은 그 공지 글로 간다.',
  },
  {
    id: 'notice_holiday', grp: 'notice_kind', label: '휴일 안내', sort: 110,
    spec: { image: 'logo', title: 'We 센터 휴일 안내', sub: 'We 센터', items: [],
      body: '#{이름} 님,\nWe 센터 휴일을 안내드려요\n휴일에는 수업이 변경될 수 있어요\n\n※ 이 메시지는 We 센터 휴일 안내로, 센터 휴일 전에 발송돼요', button: { name: '휴일 안내 보기', url: `${SITE}/notices/#{글번호}` } },
    condition: '공지사항에 이 목적의 글을 올릴 때 관리자가 골라 보내면, 승인된 보호자 모두에게 한 번. 버튼은 그 공지 글로 간다.',
  },
];

/** 예전 기본 종류 — 선결제 하나로 합쳤다. DB에 남아 있어도 안 보인다 */
const RETIRED = ['prepaid_charge', 'prepaid_adjust', 'notice'];   // notice = 예전 '공지 알림' 하나짜리 → 공지 메시지(목적별 11개)로 나눔

/** 알림 한 줄 — 화면에서 쓰는 모양 */
export type MessageRow = MessageTemplate & { spec: MessageSpec; samples: Record<string, string>; builtIn: boolean; saved: boolean };


/** 저장된 것 + 아직 저장 안 된 기본 종류. 예전 글만 적힌 기본 종류는 새 기본 모양으로 (조건은 적어 둔 게 있으면 그대로) */
export function toRows(saved: MessageTemplate[]): MessageRow[] {
  const rows: MessageRow[] = saved.filter(r => !RETIRED.includes(r.id)).map(r => {
    const d = DEFAULT_TEMPLATES.find(x => x.id === r.id);
    const spec = parseSpec(r.body);
    return {
      ...r,
      label: d && !spec ? d.label : r.label,
      grp: d?.grp ?? r.grp,
      spec: spec ?? (d ? d.spec : { ...EMPTY_SPEC, body: r.body }),
      condition: r.condition.trim() ? r.condition : d?.condition ?? '',
      samples: { ...SAMPLE_VARS, ...(d?.samples ?? {}) },
      builtIn: !!d,
      saved: !!spec || (!d && !!r.updatedAt),
    };
  });
  for (const d of DEFAULT_TEMPLATES) {
    if (rows.some(r => r.id === d.id)) continue;
    rows.push({ id: d.id, grp: d.grp, label: d.label, sort: d.sort, body: '', condition: d.condition, updatedAt: '',
      spec: d.spec, samples: { ...SAMPLE_VARS, ...(d.samples ?? {}) }, builtIn: true, saved: false });
  }
  return rows.sort((a, b) => a.sort - b.sort);
}

export async function getMessageTemplates(): Promise<MessageTemplate[]> {
  const { data, error } = await supabase.from('message_templates').select('*').order('sort');
  if (error) throw error;
  return (data ?? []).map(fromRow);
}

export const newSpec = (): MessageSpec => ({ ...EMPTY_SPEC, items: [{ name: '', value: '' }] });

/** 테이블이 아직 없음 (supabase/message-templates.sql 을 안 돌림) */
export const isMissingTable = (e: unknown) => (e as { code?: string })?.code === 'PGRST205' || (e as { code?: string })?.code === '42P01';

export async function saveMessageTemplate(t: Omit<MessageTemplate, 'updatedAt'>): Promise<MessageTemplate> {
  const { data, error } = await supabase.from('message_templates')
    .upsert({ id: t.id, grp: t.grp, label: t.label.trim(), body: t.body, condition: t.condition, sort: t.sort, updated_at: new Date().toISOString() })
    .select().single();
  if (error) throw error;
  return fromRow(data);
}

export async function deleteMessageTemplate(id: string): Promise<void> {
  const { error } = await supabase.from('message_templates').delete().eq('id', id);
  if (error) throw error;
}
