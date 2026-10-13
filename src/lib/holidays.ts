import { createSign } from 'node:crypto';

// 대한민국 공휴일 — 구글 공개 "대한민국의 휴일" 캘린더를 서비스 계정으로 읽는다. (서버에서만)
// 환경 변수 GOOGLE_SERVICE_ACCOUNT 에 서비스 계정 JSON 키 전체를 넣는다.
// (선생님 캘린더에 수업을 넣던 기능은 2026-10 에 없앴다 — 시간표는 사이트 디비만 쓴다)

const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const API = 'https://www.googleapis.com/calendar/v3';

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
  // 구글이 "너무 빨라요"(403 rateLimitExceeded / 429)라고 하면 조금씩 더 쉬었다가 다시 보낸다
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (attempt >= 6 || (res.status !== 429 && res.status !== 403)) return res;
    if (res.status === 403) {
      const text = await res.clone().text();
      if (!/rateLimitExceeded|userRateLimitExceeded/.test(text)) return res;
    }
    await new Promise(r => setTimeout(r, 1000 * 2 ** attempt + Math.random() * 500));
  }
}

const HOLIDAY_CAL = 'ko.south_korea#holiday@group.v.calendar.google.com';

/** 대한민국 공휴일 날짜들 (구글 공휴일 캘린더 — "기념일"은 빼고 "공휴일"만) */
export async function koreanHolidays(from: string, to: string): Promise<string[]> {
  return (await koreanHolidayList(from, to)).map(h => h.date);
}

/** 공휴일 날짜와 이름 (예: 2026-10-03 개천절) */
export async function koreanHolidayList(from: string, to: string): Promise<{ date: string; name: string }[]> {
  const q = new URLSearchParams({ timeMin: `${from}T00:00:00+09:00`, timeMax: `${to}T23:59:59+09:00`, singleEvents: 'true', maxResults: '250' });
  const res = await call('GET', `/calendars/${encodeURIComponent(HOLIDAY_CAL)}/events?${q}`);
  if (!res.ok) throw new Error(`공휴일 읽기 오류 ${res.status}`);
  const data = await res.json();
  return (data.items ?? [])
    .filter((e: { description?: string; start?: { date?: string } }) => (e.description ?? '').startsWith('공휴일') && e.start?.date)
    .map((e: { summary?: string; start: { date: string } }) => ({ date: e.start.date, name: (e.summary ?? '공휴일').replace(/^쉬는 ?날\s*/, '') }));   // 대체공휴일 "쉬는 날 개천절" → "개천절"
}
