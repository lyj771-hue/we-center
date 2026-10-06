import { createHash, createSign } from 'node:crypto';

// 구글 캘린더 — 서비스 계정으로 선생님 캘린더에 수업 일정을 넣고 빼고, 빈 시간을 읽는다. (서버에서만)
// 환경 변수 GOOGLE_SERVICE_ACCOUNT 에 서비스 계정 JSON 키 전체를 넣는다.
// 각 선생님 캘린더는 그 서비스 계정 이메일에 "일정 변경" 권한으로 공유돼 있어야 한다.

const SCOPE = 'https://www.googleapis.com/auth/calendar';
const API = 'https://www.googleapis.com/calendar/v3';
export const LESSON_MINUTES = 50;
export const TIME_ZONE = 'Asia/Seoul';

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

let cached: { token: string; exp: number } | null = null;

function account(): ServiceAccount {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT 가 없어요');
  return JSON.parse(raw) as ServiceAccount;
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString('base64url');

/** 서비스 계정 접근 토큰 (1시간짜리, 만료 1분 전까지 재사용) */
async function accessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp - 60 > now) return cached.token;
  const sa = account();
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const sign = createSign('RSA-SHA256');
  sign.update(`${head}.${claim}`);
  const jwt = `${head}.${claim}.${b64url(sign.sign(sa.private_key))}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  if (!res.ok) throw new Error(`구글 토큰 오류 ${res.status}`);
  const data = await res.json();
  cached = { token: data.access_token, exp: now + (data.expires_in ?? 3600) };
  return cached.token;
}

async function call(method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** 시간 칸 id(uuid) → 구글 일정 id (영문 소문자 a~v·숫자만 허용 — uuid 의 16진수는 그대로 쓸 수 있다) */
export const eventIdFor = (slotId: string) => slotId.replace(/-/g, '');

/** "2026-10-12" + "14:00" → 그 시각과 50분 뒤 (서울 시간) */
function lessonRange(day: string, time: string) {
  const start = new Date(`${day}T${time}:00+09:00`);
  const end = new Date(start.getTime() + LESSON_MINUTES * 60000);
  const fmt = (d: Date) => new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 19);   // 서울 벽시계 시각
  return { start: { dateTime: fmt(start), timeZone: TIME_ZONE }, end: { dateTime: fmt(end), timeZone: TIME_ZONE } };
}

/** 수업 일정을 넣는다(이미 있으면 내용만 고친다 — 지웠던 일정도 다시 살린다) */
export async function upsertLesson(calendarId: string, slotId: string, day: string, time: string, summary: string, description: string) {
  const id = eventIdFor(slotId);
  const event = { id, summary, description, status: 'confirmed', ...lessonRange(day, time) };
  const cal = encodeURIComponent(calendarId);
  let res = await call('POST', `/calendars/${cal}/events`, event);
  if (res.status === 409) res = await call('PUT', `/calendars/${cal}/events/${id}`, event);
  if (!res.ok) throw new Error(`구글 일정 저장 오류 ${res.status}: ${await res.text()}`);
}

/** 수업 일정을 지운다(없으면 그냥 넘어간다) */
export async function removeLesson(calendarId: string, slotId: string) {
  const res = await call('DELETE', `/calendars/${encodeURIComponent(calendarId)}/events/${eventIdFor(slotId)}`);
  if (!res.ok && res.status !== 404 && res.status !== 410) throw new Error(`구글 일정 삭제 오류 ${res.status}`);
}

/** 바쁜 시간들 [{start, end}] (ISO) — from·to 는 "YYYY-MM-DD" (to 날 포함) */
export async function busyTimes(calendarId: string, from: string, to: string): Promise<{ start: string; end: string }[]> {
  const timeMin = new Date(`${from}T00:00:00+09:00`).toISOString();
  const timeMax = new Date(new Date(`${to}T00:00:00+09:00`).getTime() + 86400000).toISOString();
  const res = await call('POST', '/freeBusy', { timeMin, timeMax, timeZone: TIME_ZONE, items: [{ id: calendarId }] });
  if (!res.ok) throw new Error(`구글 빈 시간 조회 오류 ${res.status}`);
  const data = await res.json();
  const cal = data.calendars?.[calendarId];
  if (cal?.errors?.length) throw new Error(`캘린더를 읽을 수 없어요 (${cal.errors[0].reason}) — 서비스 계정에 공유됐는지 확인`);
  return cal?.busy ?? [];
}

// ── 시간표(고정 수업·그날 바꾼 칸) ─────────────────────────────────────
// 고정 수업 = 매주 반복 일정 하나(이번 주 월요일부터, 대한민국 공휴일은 빼고).
// 그날만 바꾼 고정 칸(결석·옮김·비움·이름 변경) = 그 날짜 반복 일정만 고친다.
// 빈타임 칸에 관리자가 직접 넣은 아이 = 그날 한 번짜리 일정.
// 일정 id 는 칸 위치(선생님·요일·시간 / 날짜·선생님·시간)로 정해서, 다시 맞출 때 같은 일정을 고친다.


const HOLIDAY_CAL = 'ko.south_korea#holiday@group.v.calendar.google.com';
const hex = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 30);
/** 고정 수업 반복 일정 id — "vf" + 칸 위치 (구글 일정 id 는 a~v·숫자만 된다) */
export const fixedEventId = (teacherId: string, weekday: number, time: string) => `vf${hex(`${teacherId}|${weekday}|${time}`)}`;
/** 빈타임 칸(관리자가 넣은 아이) 일정 id — "vc" + 날짜·칸 위치 */
export const openCellEventId = (day: string, teacherId: string, time: string) => `vc${hex(`${day}|${teacherId}|${time}`)}`;

export interface LessonText {
  summary: string;
  description: string;
  memberCode?: string;
}

/** 서울 벽시계 "YYYY-MM-DDTHH:MM:SS" */
const wall = (d: Date) => new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 19);
const seoul = (day: string, time: string) => new Date(`${day}T${time}:00+09:00`);

/** 대한민국 공휴일 날짜들 (구글 공휴일 캘린더 — "기념일"은 빼고 "공휴일"만) */
export async function koreanHolidays(from: string, to: string): Promise<string[]> {
  const q = new URLSearchParams({ timeMin: `${from}T00:00:00+09:00`, timeMax: `${to}T23:59:59+09:00`, singleEvents: 'true', maxResults: '250' });
  const res = await call('GET', `/calendars/${encodeURIComponent(HOLIDAY_CAL)}/events?${q}`);
  if (!res.ok) throw new Error(`공휴일 읽기 오류 ${res.status}`);
  const data = await res.json();
  return (data.items ?? [])
    .filter((e: { description?: string; start?: { date?: string } }) => (e.description ?? '').startsWith('공휴일') && e.start?.date)
    .map((e: { start: { date: string } }) => e.start.date);
}

/** 고정 수업 반복 일정 넣기/고치기 — firstDay = 첫 수업 날짜, holidays = 빼는 날짜들 */
export async function upsertFixedLesson(calendarId: string, teacherId: string, weekday: number, time: string, firstDay: string, holidays: string[], text: LessonText) {
  const id = fixedEventId(teacherId, weekday, time);
  const start = seoul(firstDay, time);
  const end = new Date(start.getTime() + LESSON_MINUTES * 60000);
  const byday = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][weekday];
  const ex = holidays.filter(d => new Date(`${d}T12:00:00+09:00`).getUTCDay() === weekday && d >= firstDay);
  const recurrence = [`RRULE:FREQ=WEEKLY;BYDAY=${byday}`];
  if (ex.length) recurrence.push(`EXDATE;TZID=${TIME_ZONE}:${ex.map(d => `${d.replace(/-/g, '')}T${time.replace(':', '')}00`).join(',')}`);
  const event = {
    id, status: 'confirmed', summary: text.summary, description: text.description,
    start: { dateTime: wall(start), timeZone: TIME_ZONE }, end: { dateTime: wall(end), timeZone: TIME_ZONE },
    recurrence,
    extendedProperties: { private: { source: 'we-timetable', kind: 'fixed', memberCode: text.memberCode ?? '' } },
  };
  const cal = encodeURIComponent(calendarId);
  let res = await call('POST', `/calendars/${cal}/events`, event);
  if (res.status === 409) res = await call('PUT', `/calendars/${cal}/events/${id}`, event);
  if (!res.ok) throw new Error(`고정 수업 저장 오류 ${res.status}: ${await res.text()}`);
}

export async function removeEvent(calendarId: string, id: string) {
  const res = await call('DELETE', `/calendars/${encodeURIComponent(calendarId)}/events/${id}`);
  if (!res.ok && res.status !== 404 && res.status !== 410) throw new Error(`일정 삭제 오류 ${res.status}`);
}

/** 이 캘린더에서 우리 시간표가 넣은 고정 수업 반복 일정 id 들 */
export async function listFixedEventIds(calendarId: string): Promise<string[]> {
  const ids: string[] = [];
  let page = '';
  do {
    const q = new URLSearchParams({ privateExtendedProperty: 'kind=fixed', maxResults: '2500', ...(page ? { pageToken: page } : {}) });
    const res = await call('GET', `/calendars/${encodeURIComponent(calendarId)}/events?${q}`);
    if (!res.ok) throw new Error(`일정 목록 오류 ${res.status}`);
    const data = await res.json();
    for (const e of data.items ?? []) if (e.status !== 'cancelled') ids.push(e.id);
    page = data.nextPageToken ?? '';
  } while (page);
  return ids;
}

/** 반복 일정의 그날 하나 — text 로 고치기(원래대로 돌릴 때도 고정 수업 글을 넘긴다) / null 이면 그날만 빼기 */
export async function setFixedOccurrence(calendarId: string, teacherId: string, weekday: number, time: string, day: string, change: LessonText | null) {
  const id = fixedEventId(teacherId, weekday, time);
  const cal = encodeURIComponent(calendarId);
  const start = seoul(day, time);
  const q = new URLSearchParams({ timeMin: new Date(start.getTime() - 60000).toISOString(), timeMax: new Date(start.getTime() + 60000).toISOString(), showDeleted: 'true' });
  const res = await call('GET', `/calendars/${cal}/events/${id}/instances?${q}`);
  if (res.status === 404 || res.status === 410) return;   // 반복 일정이 아직 없다
  if (!res.ok) throw new Error(`반복 일정 읽기 오류 ${res.status}`);
  const inst = ((await res.json()).items ?? [])[0];
  if (!inst) return;   // 공휴일 등으로 원래 없는 날
  if (change === null) {
    if (inst.status !== 'cancelled') await call('DELETE', `/calendars/${cal}/events/${inst.id}`);
    return;
  }
  const r = await call('PATCH', `/calendars/${cal}/events/${inst.id}`, { status: 'confirmed', summary: change.summary, description: change.description });
  if (!r.ok) throw new Error(`그날 일정 고치기 오류 ${r.status}`);
}

/** 빈타임 칸 한 번짜리 일정 넣기/고치기 */
export async function upsertOpenCell(calendarId: string, day: string, teacherId: string, time: string, text: LessonText) {
  const id = openCellEventId(day, teacherId, time);
  const start = seoul(day, time);
  const end = new Date(start.getTime() + LESSON_MINUTES * 60000);
  const event = {
    id, status: 'confirmed', summary: text.summary, description: text.description,
    start: { dateTime: wall(start), timeZone: TIME_ZONE }, end: { dateTime: wall(end), timeZone: TIME_ZONE },
    extendedProperties: { private: { source: 'we-timetable', kind: 'cell', memberCode: text.memberCode ?? '' } },
  };
  const cal = encodeURIComponent(calendarId);
  let res = await call('POST', `/calendars/${cal}/events`, event);
  if (res.status === 409) res = await call('PUT', `/calendars/${cal}/events/${id}`, event);
  if (!res.ok) throw new Error(`빈타임 일정 저장 오류 ${res.status}`);
}
