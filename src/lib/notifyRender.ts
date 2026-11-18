import { fillVars, toRows, type MessageRow, type MessageTemplate } from './messages';
import { toAppHref } from './appPath';

// 알림톡 모양(message_templates) → 앱 푸시 글 · 앱 🔔 알림 내역 한 줄. 서버(푸시 보내기)와 앱(내역 보기)이 같이 쓴다.
// 알림 종류 id 끝의 숫자(lesson_tomorrow_3, booking_digest_4 처럼 개수별 템플릿)는 떼고 모양을 찾는다.

export interface Rendered {
  title: string;
  items: { name: string; value: string }[];
  body: string;
  button?: { name: string; url: string };   // url = 앱 안 주소
  /** 휴대폰 알림에 보일 짧은 글 */
  pushText: string;
}

export const specRows = (saved: MessageTemplate[]) => toRows(saved);

export function findSpec(templateId: string, rows: MessageRow[]): MessageRow | undefined {
  return rows.find(r => r.id === templateId) ?? rows.find(r => r.id === templateId.replace(/_\d+$/, ''));
}

const HAS_VAR = /#\{[^}]+\}/;
const ALL_VARS = /#\{[^}]+\}/g;

/** 알림톡 버튼 주소(https://we-center.vercel.app/mypage?d=…) → 앱 안 주소 */
export function appUrlOf(url: string): string {
  if (!url) return '/app';
  let u: URL;
  try { u = new URL(url, 'https://we-center.vercel.app'); } catch { return '/app'; }
  if (u.pathname === '/mypage' && u.searchParams.get('d')) return `/app/class?d=${encodeURIComponent(u.searchParams.get('d')!)}`;
  const to = toAppHref(u.pathname);
  if (to) return to + u.search;
  return u.pathname.startsWith('/app') || u.pathname.startsWith('/admin') ? u.pathname + u.search : '/app';
}

export function renderNotification(templateId: string, vars: Record<string, string>, rows: MessageRow[]): Rendered {
  const spec = findSpec(templateId, rows);
  if (!spec) {
    const values = Object.entries(vars ?? {}).map(([name, value]) => ({ name, value: String(value) }));
    return { title: 'We 센터 알림', items: values, body: '', pushText: values.map(v => v.value).join(' · ') };
  }
  const s = spec.spec;
  const v = Object.fromEntries(Object.entries(vars ?? {}).map(([k, x]) => [k, String(x)]));
  const fill = (t: string) => fillVars(t, v);

  // 항목 — 값이 다 채워진 것만. 수업이 3개 넘으면(개수별 템플릿) 모양에 없는 수업N 을 덧붙인다
  const items = s.items.map(i => ({ name: fill(i.name), value: fill(i.value) })).filter(i => i.value.trim() && !HAS_VAR.test(i.value));
  const used = new Set(s.items.flatMap(i => [...i.value.matchAll(/#\{(수업\d)\}/g)].map(m => m[1])));
  for (let k = 1; k <= 8; k++) if (v[`수업${k}`] && !used.has(`수업${k}`)) items.push({ name: `수업 ${k}`, value: v[`수업${k}`] });

  // 본문 — 알림톡 심사용 안내(※ 이 메시지는 …)는 앱에선 뺀다
  const body = fill(s.body).split('\n').filter(l => !l.trim().startsWith('※')).join('\n').replace(ALL_VARS, '').replace(/\n{3,}/g, '\n\n').trim();
  const title = fill(s.title).replace(ALL_VARS, '').trim() || spec.label;
  const button = s.button.name.trim() ? { name: s.button.name, url: appUrlOf(fill(s.button.url)) } : undefined;
  const pushText = items.length
    ? items.slice(0, 4).map(i => `${i.name} ${i.value}`).join('\n')
    : body.split('\n').filter(Boolean).slice(0, 2).join('\n');
  return { title, items, body, button, pushText };
}
