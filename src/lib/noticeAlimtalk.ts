import { getMessageTemplates, toRows, type MessageRow } from './messages';
import { getMembers, getMemberCenters } from './store';
import { getChildren } from './timetable';
import { addAndSendOutbox, newBatchId } from './leave';

// 공지사항에 글을 올릴 때 보내는 공지 메시지(목적별 11개, 메시지 모양의 [공지 메시지] 탭) — 승인된 보호자 모두에게 단체로.
// 제목·본문에 #{센터}가 있으면 센터(수색점/의정부점)를 꼭 골라야 하고 그 센터 보호자에게만, #{명절}이 있으면 명절 이름을 꼭 적는다.

export type NoticeCenter = 'eunpyeong' | 'uijeongbu';
export const CENTER_LABEL: Record<NoticeCenter, string> = { eunpyeong: '수색점', uijeongbu: '의정부점' };

const textOf = (r: MessageRow) => [r.spec.title, r.spec.body, r.spec.button.url, ...r.spec.items.flatMap(i => [i.name, i.value])].join('\n');
export const needsCenter = (r: MessageRow) => textOf(r).includes('#{센터}');
export const needsHoliday = (r: MessageRow) => textOf(r).includes('#{명절}');

/** 공지 메시지 종류 — 저장된 모양이 있으면 그걸로 */
export async function getNoticeKinds(): Promise<MessageRow[]> {
  const saved = await getMessageTemplates().catch(() => []);
  return toRows(saved).filter(r => r.grp === 'notice_kind');
}

/** 받을 보호자 — 센터를 고르면 그 센터에 승인된 보호자, 아니면 어느 센터든 승인된 보호자. 번호 없는 사람은 따로 센다 */
export async function noticeRecipients(center: NoticeCenter | null) {
  const [members, extra, kids] = await Promise.all([getMembers(), getMemberCenters(), getChildren()]);
  const inCenter = (m: (typeof members)[number], c: NoticeCenter) =>
    ((m.center ?? 'eunpyeong') === c && !!m.approvedAt) || !!extra.get(`${m.userId}|${c}`);
  const approved = members.filter(m => m.nickname && (center ? inCenter(m, center) : inCenter(m, 'eunpyeong') || inCenter(m, 'uijeongbu')));
  const withPhone = approved.filter(m => m.phone);
  const list = withPhone.map(m => {
    const kid = kids.find(k => k.guardianUserId === m.userId && (!center || (k.center ?? 'eunpyeong') === center)) ?? kids.find(k => k.guardianUserId === m.userId);
    return { userId: m.userId, phone: m.phone!, childId: kid?.id, name: kid?.name ?? m.nickname, label: kid ? `${kid.name}${kid.number ?? ''}` : m.nickname };
  });
  return { list, noPhone: approved.length - withPhone.length };
}

/** 단체로 보내기 — 한 묶음(batch_id)으로 남겨 알림 내역에 한 줄로 보인다 */
export async function sendNotice(kind: MessageRow, postId: string, center: NoticeCenter | null, holiday: string, recipients: Awaited<ReturnType<typeof noticeRecipients>>['list']) {
  const batchId = newBatchId();
  return addAndSendOutbox(recipients.map(r => ({
    templateId: kind.id, refId: postId, childId: r.childId, userId: r.userId, childName: r.label, phone: r.phone, batchId,
    vars: { 이름: r.name, 글번호: postId, ...(center ? { 센터: CENTER_LABEL[center] } : {}), ...(holiday.trim() ? { 명절: holiday.trim() } : {}) },
  })));
}
