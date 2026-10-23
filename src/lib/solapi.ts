import { createHmac, randomBytes } from 'node:crypto';

// 솔라피(SOLAPI) 알림톡 보내기 — 서버에서만. 키는 Vercel 환경 변수에 둔다(채팅·코드에 적지 않는다)
//   SOLAPI_API_KEY · SOLAPI_API_SECRET  — 솔라피 콘솔 → 개발/연동 → API Key
//   SOLAPI_PFID                        — 연동한 카카오 채널(발신 프로필) ID (KA01PF…)
//   SOLAPI_FROM                        — 솔라피에 등록한 발신번호(숫자만). 알림톡이 안 가면 문자로 대신 보낼 때 쓴다

const BASE = 'https://api.solapi.com';
const API = `${BASE}/messages/v4/send`;

export function solapiReady() {
  return !!(process.env.SOLAPI_API_KEY && process.env.SOLAPI_API_SECRET && process.env.SOLAPI_PFID);
}

function auth() {
  const date = new Date().toISOString();
  const salt = randomBytes(16).toString('hex');
  const signature = createHmac('sha256', process.env.SOLAPI_API_SECRET!).update(date + salt).digest('hex');
  return `HMAC-SHA256 apiKey=${process.env.SOLAPI_API_KEY}, date=${date}, salt=${salt}, signature=${signature}`;
}

/** 알림톡 한 통 — variables 는 { '#{이름}': '김유담', … } 모양. 결과는 솔라피 응답 그대로 */
export async function sendAlimtalk(opts: { to: string; templateId: string; variables: Record<string, string>; smsFallback?: boolean }) {
  const to = opts.to.replace(/\D/g, '');
  const from = (process.env.SOLAPI_FROM ?? '').replace(/\D/g, '');
  const message = {
    to,
    ...(from ? { from } : {}),
    kakaoOptions: {
      pfId: process.env.SOLAPI_PFID,
      templateId: opts.templateId,
      variables: opts.variables,
      disableSms: !opts.smsFallback || !from,
    },
  };
  const res = await fetch(API, {
    method: 'POST',
    headers: { Authorization: auth(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

/** 솔라피 API 아무거나 — path 는 /kakao/v2/templates 처럼. 결과는 { ok, status, data } */
export async function solapiFetch(path: string, init: { method?: string; body?: unknown } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? 'GET',
    headers: { Authorization: auth(), 'Content-Type': 'application/json' },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}
