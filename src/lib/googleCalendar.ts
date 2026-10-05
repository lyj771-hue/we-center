import { createSign } from 'node:crypto';

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
