import { getMembers } from './store';
import { getChildren, getPaymentCounts, childLabel, PREPAID_KINDS, prepaidTotalOf, type Center, type Child, type PrepaidKey } from './timetable';
import { addAndSendOutbox, newBatchId } from './leave';
import type { Member } from './types';

// 보호자에게 바로 가는 알림톡 (관리자 화면에서만 부른다 — 보낼 알림에 남기고 솔라피로 바로 보낸다)
//   회원가입 승인(member_approved) · 선결제 사용·충전·변경(prepaid_use) · 고정 수업 확정·취소·변동(fixed_change) · 수업 일정(lesson_tomorrow_1~8)
// 날짜는 늘 2026/10/27 꼴. 번호 없는 보호자는 '번호 없음'으로 남는다.

export type SendResult = { sent: number; failed: number; skipped: number; waiting: number };
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const pad = (n: number) => String(n).padStart(2, '0');
export const slash = (ymd: string) => ymd.slice(0, 10).replace(/-/g, '/');
const today = () => { const d = new Date(); return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`; };
const isoSlash = (iso?: string) => { if (!iso) return today(); const d = new Date(iso); return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`; };
const dowOf = (ymd: string) => { const [y, m, d] = ymd.split('-').map(Number); return DOW[new Date(y, m - 1, d).getDay()]; };
export const centerName = (c: Center) => (c === 'uijeongbu' ? '의정부점' : '은평점');
const hm = (t: string) => t.replace(/^0/, '');

/** "보냄 2건 · 실패 1건 …" */
export const sendSummary = (r: SendResult) =>
  `보냄 ${r.sent}건${r.failed ? ` · 실패 ${r.failed}건` : ''}${r.skipped ? ` · 번호 없어 못 보냄 ${r.skipped}건` : ''}${r.waiting ? ` · 템플릿 ID가 없어 남겨만 둠 ${r.waiting}건` : ''}`;

/** 아이 → 보호자 계정 */
async function guardianOf(childIds: string[]) {
  const [kids, members] = await Promise.all([getChildren(), getMembers()]);
  return new Map(childIds.map(id => {
    const kid = kids.find(k => k.id === id);
    const m = kid?.guardianUserId ? members.find(x => x.userId === kid.guardianUserId) : undefined;
    return [id, { kid, m }] as const;
  }));
}

// ── 회원가입 승인 ───────────────────────────────────────────────

/** 관리자가 [승인]을 누르면 그 보호자에게 */
export async function notifyMemberApproved(m: Member, center: Center, requestedAt?: string): Promise<SendResult> {
  return addAndSendOutbox([{
    templateId: 'member_approved', userId: m.userId, childName: m.nickname, phone: m.phone,
    vars: { 이름: m.nickname, 날짜: isoSlash(requestedAt ?? m.joinedAt), 센터: centerName(center), 결과: '승인' },
  }]);
}

// ── 선결제 ─────────────────────────────────────────────────────

/** #{구분} 앞에 붙는 종류 글자 — "선결제 A 사용" */
const letterOf = (method: PrepaidKey) => PREPAID_KINDS.find(x => x.key === method)!.letter;

/** 선결제 카드에서 충전·차감·수정 — 아이 하나 */
export async function notifyPrepaid(child: Child, kind: '사용' | '충전' | '변경', day: string, before: number, delta: number, method: PrepaidKey = 'prepaid'): Promise<SendResult> {
  const g = (await guardianOf([child.id])).get(child.id);
  if (!g?.kid?.guardianUserId) return { sent: 0, failed: 0, skipped: 0, waiting: 0 };   // 보호자 계정과 안 이어진 아이
  return addAndSendOutbox([{
    templateId: 'prepaid_use', childId: child.id, userId: g.kid.guardianUserId, childName: childLabel(child), phone: g.m?.phone,
    vars: { 이름: child.name, 구분: `${letterOf(method)} ${kind}`, 날짜: slash(day), 기존횟수: String(before), 변동: `${delta > 0 ? '+' : ''}${delta}회`, 남은횟수: String(before + delta) },
  }]);
}

/** [결제 완료]로 선결제 수업을 확정한 뒤 — 아이마다 그날 한 번(그날 확정한 횟수를 합쳐서). 남은 횟수는 확정 뒤 디비 기준 */
export async function notifyPrepaidUses(day: string, uses: { childId: string; count: number; method: PrepaidKey }[]): Promise<SendResult> {
  const list = uses.filter(u => u.count > 0);
  if (!list.length) return { sent: 0, failed: 0, skipped: 0, waiting: 0 };
  const [g, counts] = await Promise.all([guardianOf(list.map(u => u.childId)), getPaymentCounts('2000-01-01', '2999-12-31')]);
  return addAndSendOutbox(list.flatMap(u => {
    const x = g.get(u.childId);
    if (!x?.kid?.guardianUserId) return [];
    const after = prepaidTotalOf(x.kid, u.method) - (counts.get(u.childId)?.[u.method] ?? 0);
    return [{
      templateId: 'prepaid_use', childId: u.childId, userId: x.kid.guardianUserId, childName: childLabel(x.kid), phone: x.m?.phone,
      vars: { 이름: x.kid.name, 구분: `${letterOf(u.method)} 사용`, 날짜: slash(day), 기존횟수: String(after + u.count), 변동: `-${u.count}회`, 남은횟수: String(after) },
    }];
  }));
}

// ── 고정 수업 ───────────────────────────────────────────────────

export interface FixedChange { childId: string; result: '확정' | '취소'; weekday: number; time: string; teacherName: string; from: string }

/** 고정 수업이 새로 정해지거나(확정) 끝날 때(취소). 같은 아이가 한쪽은 끝나고 한쪽은 생기면 '변동' 하나로 */
export async function notifyFixedChanges(changes: FixedChange[]): Promise<SendResult> {
  if (!changes.length) return { sent: 0, failed: 0, skipped: 0, waiting: 0 };
  const g = await guardianOf([...new Set(changes.map(c => c.childId))]);
  const slot = (c: FixedChange) => `매주 ${DOW[c.weekday]} ${hm(c.time)}`;
  const byChild = new Map<string, FixedChange[]>();
  for (const c of changes) byChild.set(c.childId, [...(byChild.get(c.childId) ?? []), c]);
  const batchId = newBatchId();
  return addAndSendOutbox([...byChild].flatMap(([childId, cs]) => {
    const x = g.get(childId);
    if (!x?.kid?.guardianUserId) return [];
    const added = cs.filter(c => c.result === '확정'), ended = cs.filter(c => c.result === '취소');
    const main = added[0] ?? ended[0];
    const kind = added.length && ended.length ? '변동' : main.result;
    const content = kind === '변동'
      ? `${ended.map(c => `${slot(c)} ${c.teacherName}`).join(', ')} → ${added.map(c => `${slot(c)} ${c.teacherName}`).join(', ')}`
      : `${cs.map(c => `${slot(c)} ${c.teacherName}`).join(', ')} ${kind === '확정' ? '새로 확정' : '끝남'}`;
    return [{
      templateId: 'fixed_change', childId, userId: x.kid.guardianUserId, childName: childLabel(x.kid), phone: x.m?.phone, batchId,
      vars: { 이름: x.kid.name, 구분: kind, 날짜: slash(main.from), 요일: DOW[main.weekday], 수업: slot(main), 선생님: main.teacherName, 변동내용: content },
    }];
  }));
}

// ── 수업 일정 ───────────────────────────────────────────────────

/** 관리자가 날짜를 골라 보내는 수업 일정 — 아이마다 한 번, 수업 개수(1~8)에 맞는 템플릿(lesson_tomorrow_N) */
export async function notifyLessonDay(day: string, center: Center, lessons: { childId: string; time: string; teacherName: string }[]): Promise<SendResult> {
  const byChild = new Map<string, { time: string; teacherName: string }[]>();
  for (const l of lessons) byChild.set(l.childId, [...(byChild.get(l.childId) ?? []), l]);
  if (!byChild.size) return { sent: 0, failed: 0, skipped: 0, waiting: 0 };
  const g = await guardianOf([...byChild.keys()]);
  const [, m, d] = day.split('-').map(Number);
  const batchId = newBatchId();
  return addAndSendOutbox([...byChild].flatMap(([childId, ls]) => {
    const x = g.get(childId);
    if (!x?.kid?.guardianUserId) return [];
    const sorted = [...ls].sort((a, b) => a.time.localeCompare(b.time)).slice(0, 8);
    return [{
      templateId: `lesson_tomorrow_${sorted.length}`, childId, userId: x.kid.guardianUserId, childName: childLabel(x.kid), phone: x.m?.phone, batchId,
      vars: {
        이름: x.kid.name, 날짜: slash(day), 요일: dowOf(day), 월일: `${m}/${d}`, 센터: centerName(center),
        ...Object.fromEntries(sorted.map((l, i) => [`수업${i + 1}`, `${hm(l.time)} ${l.teacherName} 선생님`])),
      },
    }];
  }));
}
