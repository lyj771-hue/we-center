import { supabase } from './supabaseClient';
import { askConfirm, showAlert } from './dialog';
import { sendOutbox } from './leave';

// 관리자 알림 (supabase/admin-alerts.sql) — 보호자가 가입·수업 신청 등을 하면 DB 트리거가 쌓는다. 관리자만

/** 알림을 확인하면 이 이벤트 → 관리자 띠의 빨간 숫자도 새로 */
export const ALERTS_CHANGED = 'admin-alerts-changed';

export type AlertKind = 'signup' | 'branch' | 'book' | 'cancel_request' | 'cancel_withdraw' | 'lesson_cancel';
export const ALERT_KINDS: { key: AlertKind; label: string }[] = [
  { key: 'signup', label: '가입 신청' },
  { key: 'branch', label: '다른 지점 가입' },
  { key: 'book', label: '수업 신청' },
  { key: 'cancel_request', label: '취소 신청' },
  { key: 'cancel_withdraw', label: '취소 철회' },
  { key: 'lesson_cancel', label: '수업 취소 신청' },   // 보호자가 마이페이지에서 취소 신청 (lesson-cancel-approval.sql)
];

export interface AdminAlert { id: string; kind: AlertKind; center: 'eunpyeong' | 'uijeongbu'; title: string; detail?: string; createdAt: string; readAt?: string }

export async function getAdminAlerts(limit = 300): Promise<AdminAlert[]> {
  const { data, error } = await supabase.from('admin_alerts').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []).map(r => ({
    id: r.id as string, kind: r.kind as AlertKind, center: r.center === 'uijeongbu' ? 'uijeongbu' : 'eunpyeong',
    title: r.title as string, detail: (r.detail as string | null) ?? undefined, createdAt: r.created_at as string, readAt: (r.read_at as string | null) ?? undefined,
  }));
}

/** 아직 안 본 알림 수 — 표가 없으면(SQL 전) 0 */
export async function getUnreadAlertCount(): Promise<number> {
  const { count, error } = await supabase.from('admin_alerts').select('id', { count: 'exact', head: true }).is('read_at', null);
  if (error) return 0;
  return count ?? 0;
}

/** 확인함 표시 (ids 가 없으면 전부) */
export async function markAlertsRead(ids?: string[]): Promise<void> {
  let q = supabase.from('admin_alerts').update({ read_at: new Date().toISOString() }).is('read_at', null);
  if (ids) q = q.in('id', ids);
  const { error } = await q;
  if (error) throw error;
}

/** 알림을 누르면 갈 곳 */
export const alertLink = (a: AdminAlert) => {
  const uj = a.center === 'uijeongbu';
  if (a.kind === 'signup' || a.kind === 'branch') return uj ? '/members/uijeongbu' : '/members';
  return uj ? '/admin/timetable/uijeongbu' : '/admin/timetable';
};

// ── 마이페이지 수업 취소 신청 (supabase/lesson-cancel-approval.sql) ─────────────

export interface CancelRequest {
  id: string; childName: string; day: string; time: string; teacherId: string; side: 'fixed' | 'open'; center: 'eunpyeong' | 'uijeongbu';
  minutesBefore: number; late: boolean; createdAt: string;
}

/** 승인 기다리는 취소 신청 — 수업 날짜 순 */
export async function getCancelRequests(): Promise<CancelRequest[]> {
  const { data, error } = await supabase.from('lesson_cancels').select('*').eq('status', 'requested').order('day').order('time');
  if (error) throw error;
  return (data ?? []).map(r => ({
    id: r.id as string, childName: (r.child_name as string) ?? '', day: r.day as string, time: r.time as string, teacherId: r.teacher_id as string, side: r.side === 'open' ? 'open' : 'fixed',
    center: r.center === 'uijeongbu' ? 'uijeongbu' : 'eunpyeong', minutesBefore: (r.minutes_before as number) ?? 0, late: !!r.late, createdAt: r.created_at as string,
  }));
}

/** 승인(true) / 거절(false) — 승인하면 보낼 알림 id 들(관리자 · 보호자). result: ok / not_found(수업이 이미 바뀜) / done(이미 처리됨) */
export async function decideLessonCancel(id: string, approve: boolean): Promise<{ result: 'ok' | 'not_found' | 'done'; ids: string[] }> {
  const { data, error } = await supabase.rpc('decide_lesson_cancel', { p_id: id, p_approve: approve });
  if (error) throw error;
  return data as { result: 'ok' | 'not_found' | 'done'; ids: string[] };
}

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
/** "10/23(목) 15:40 이정길 선생님" */
export const cancelRequestLabel = (r: CancelRequest, teacherName: string) => {
  const [y, m, d] = r.day.split('-').map(Number);
  return `${m}/${d}(${DOW[new Date(y, m - 1, d).getDay()]}) ${r.time.replace(/^0/, '')} ${teacherName} 선생님`;
};
export const minutesLabel = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`);

/** 승인/거절 — 먼저 어떤 알림이 가는지 묻고, 승인하면 알림톡을 바로 보낸다. 처리했으면 true (알림 화면 · 시간표 관리 같이 쓴다) */
export async function decideCancelWithDialogs(r: CancelRequest, approve: boolean, teacherName: string): Promise<boolean> {
  const what = `${r.childName} ${cancelRequestLabel(r, teacherName)}`;
  const msg = approve
    ? `${what} 수업 취소를 승인할까요?\n\n시간표에서 그 수업이 "취소 · 보호자"로 바뀌고 알림톡이 가요.\n· 관리자: 보호자 수업 취소 알림\n· 보호자: ${r.late ? '늦은 취소 안내 (수업 2시간 안 남았을 때 신청)' : '수업 취소 알림'}`
    : `${what} 수업 취소 신청을 거절할까요?\n수업은 그대로 진행되고, 알림은 가지 않아요.`;
  if (!(await askConfirm(msg, approve ? '승인' : '거절'))) return false;
  try {
    const res = await decideLessonCancel(r.id, approve);
    if (res.result === 'done') { await showAlert('이미 처리된 신청이에요.'); return true; }
    if (res.result === 'not_found') { await showAlert('시간표에서 그 수업을 찾지 못했어요. 이미 바뀌었을 수 있어요.\n확인한 뒤 거절로 정리해 주세요.'); return false; }
    if (!approve) { await showAlert('거절했어요.'); return true; }
    try {
      const s = await sendOutbox(res.ids);
      await showAlert(`승인했어요.\n알림톡 — 보냄 ${s.sent}건${s.failed ? ` · 실패 ${s.failed}건` : ''}${s.skipped ? ` · 번호 없어 못 보냄 ${s.skipped}건` : ''}${s.waiting ? ` · 템플릿 ID가 없어 남겨만 둠 ${s.waiting}건` : ''}\n(알림 → 보호자 알림 내역에서 볼 수 있어요)`);
    } catch (e) {
      await showAlert(`승인했지만 알림톡을 보내지 못했어요.\n${(e as Error).message}`);
    }
    return true;
  } catch (e) {
    await showAlert(`처리하지 못했어요 — SQL(supabase/lesson-cancel-approval.sql)을 실행했는지 확인해 주세요.\n${(e as Error).message}`);
    return false;
  }
}
