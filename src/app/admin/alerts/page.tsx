'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdmin } from '@/components/AdminContext';
import KakaoPreview from '@/components/KakaoPreview';
import type { AdminAlert, AlertKind, CancelRequest } from '@/lib/alerts';
import { ALERTS_CHANGED, ALERT_KINDS, alertLink, decideLessonCancel, getAdminAlerts, getCancelRequests, markAlertsRead } from '@/lib/alerts';
import type { OutboxMessage, OutboxStatus } from '@/lib/leave';
import { deleteOutbox, getOutbox, sendOutbox } from '@/lib/leave';
import { getTeachers, parseYmd } from '@/lib/schedule';
import type { MessageRow } from '@/lib/messages';
import { getMessageTemplates, toRows } from '@/lib/messages';
import { askConfirm, showAlert } from '@/lib/dialog';
import type { AdminLog } from '@/lib/adminLog';
import { getAdminLogs } from '@/lib/adminLog';

// 알림 (관리자) — 두 탭
//   관리자 알림     보호자가 가입·다른 지점 가입·수업 신청·취소 신청을 하면 쌓인다(supabase/admin-alerts.sql). 누르면 확인함 + 그 화면으로
//   보호자 알림 내역 어떤 보호자에게 어떤 알림을 보냈는지(보낼 것·보냄·실패) — outbox_messages(supabase/teacher-leave.sql)
//   관리 내역       관리자가 한 일(수업스케쥴 올리기·고치기 등) — admin_logs(supabase/admin-logs.sql)

type Tab = 'admin' | 'sent' | 'log';

const pad = (n: number) => String(n).padStart(2, '0');
const fmt = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const CENTER_LABEL = { eunpyeong: '수색', uijeongbu: '의정부' } as const;
const STATUS: Record<OutboxStatus, string> = { pending: '보낼 것', sent: '보냄', failed: '실패', skipped: '안 보냄' };
const STATUS_STYLE: Record<OutboxStatus, string> = {
  pending: 'bg-[#fffbeb] text-[#b45309]', sent: 'bg-[#ecfdf5] text-[#047857]', failed: 'bg-[#fef2f2] text-[#b91c1c]', skipped: 'bg-[#f4f4f5] text-[#71717a]',
};

export default function AlertsPage() {
  const { isAdmin } = useAdmin();
  const [tab, setTab] = useState<Tab>('admin');
  // 주소에 ?tab=sent 가 있으면 보호자 알림 내역부터 (알림 메시지 화면의 링크)
  useEffect(() => { if (new URLSearchParams(window.location.search).get('tab') === 'sent') setTab('sent'); }, []);

  if (!isAdmin) return <p className="text-center text-[14px] text-[#aaa] py-32">관리자만 볼 수 있는 화면이에요.</p>;

  const tabBtn = (t: Tab, label: string) => (
    <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
      className={`text-[13px] px-4 py-2 border transition-colors ${tab === t ? 'border-[var(--brand)] bg-[var(--brand)] text-white' : 'border-[#e5e5e5] text-[#555] hover:bg-[#f8f8f8]'}`}>{label}</button>
  );
  return (
    <div className="px-5 md:px-8 pt-8 pb-14 md:pt-14 fade-up max-w-[1100px] mx-auto">
      <h1 className="display-heading mb-6">알림</h1>
      <div role="tablist" className="flex gap-1.5 mb-5">
        {tabBtn('admin', '관리자 알림')}
        {tabBtn('sent', '보호자 알림 내역')}
        {tabBtn('log', '관리 내역')}
      </div>
      {tab === 'admin' && <CancelRequests />}
      {tab === 'admin' ? <AdminAlerts /> : tab === 'sent' ? <SentLog /> : <AdminLogs />}
    </div>
  );
}

/** 승인 기다리는 수업 취소 — 보호자가 마이페이지에서 신청. 승인하면 시간표에서 취소 + 관리자·보호자에게 알림톡 */
function CancelRequests() {
  const [list, setList] = useState<CancelRequest[]>([]);
  const [teachers, setTeachers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => { getCancelRequests().then(setList).catch(() => setList([])); }, []);
  useEffect(() => { load(); getTeachers().then(t => setTeachers(Object.fromEntries(t.map(x => [x.id, x.name])))).catch(() => {}); }, [load]);
  if (!list.length) return null;

  const DOW = ['일', '월', '화', '수', '목', '금', '토'];
  const what = (r: CancelRequest) => { const d = parseYmd(r.day); return `${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]}) ${r.time.replace(/^0/, '')} ${teachers[r.teacherId] ?? ''} 선생님`; };
  const before = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`);
  const decide = async (r: CancelRequest, approve: boolean) => {
    const msg = approve
      ? `${r.childName} ${what(r)} 수업 취소를 승인할까요?\n\n시간표에서 그 수업이 "취소 · 보호자"로 바뀌고 알림톡이 가요.\n· 관리자: 보호자 수업 취소 알림\n· 보호자: ${r.late ? '늦은 취소 안내 (수업 2시간 안 남았을 때 신청)' : '수업 취소 알림'}`
      : `${r.childName} ${what(r)} 수업 취소 신청을 거절할까요?\n수업은 그대로 진행되고, 알림은 가지 않아요.`;
    if (!(await askConfirm(msg, approve ? '승인' : '거절'))) return;
    setBusy(r.id);
    try {
      const res = await decideLessonCancel(r.id, approve);
      if (res.result === 'done') await showAlert('이미 처리된 신청이에요.');
      else if (res.result === 'not_found') await showAlert('시간표에서 그 수업을 찾지 못했어요. 이미 바뀌었을 수 있어요.\n시간표 관리에서 확인한 뒤 거절로 정리해 주세요.');
      else if (approve) {
        try {
          const s = await sendOutbox(res.ids);
          await showAlert(`승인했어요.\n알림톡 — 보냄 ${s.sent}건${s.failed ? ` · 실패 ${s.failed}건` : ''}${s.skipped ? ` · 번호 없어 못 보냄 ${s.skipped}건` : ''}${s.waiting ? ` · 템플릿 ID가 없어 남겨만 둠 ${s.waiting}건` : ''}\n(보호자 알림 내역에서 볼 수 있어요)`);
        } catch (e) {
          await showAlert(`승인했지만 알림톡을 보내지 못했어요.\n${(e as Error).message}`);
        }
      } else await showAlert('거절했어요.');
      load();
    } catch (e) {
      showAlert(`처리하지 못했어요 — SQL(supabase/lesson-cancel-approval.sql)을 실행했는지 확인해 주세요.\n${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className="mb-6 rounded-xl border border-[#fde68a] bg-[#fffbeb] p-4">
      <h2 className="text-[14px] text-[#92400e] mb-2">승인 기다리는 수업 취소 {list.length}건</h2>
      <ul className="divide-y divide-[#fde68a]">
        {list.map(r => (
          <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-[13px]">
            <span className="text-[11px] px-1.5 rounded border border-[#e5e5e5] bg-white text-[#666]">{CENTER_LABEL[r.center]}</span>
            <span className="font-medium text-[#27272a]">{r.childName}</span>
            <span className="text-[#555]">{what(r)}</span>
            <span className="text-[12px] text-[#888]">수업 {before(r.minutesBefore)} 전 신청</span>
            {r.late && <span className="text-[11px] px-1.5 rounded bg-[#fee2e2] text-[#b91c1c]">늦은 취소</span>}
            <span className="ml-auto flex gap-1.5">
              <button onClick={() => decide(r, false)} disabled={busy === r.id} className="text-[12px] px-3 h-7 rounded-full border border-[#ddd] bg-white text-[#555] disabled:opacity-40">거절</button>
              <button onClick={() => decide(r, true)} disabled={busy === r.id} className="text-[12px] px-3 h-7 rounded-full bg-[#e11d48] text-white disabled:opacity-40">{busy === r.id ? '처리 중…' : '승인'}</button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** 관리자 알림 — 보호자가 신청한 일. 안 본 것은 굵게·점 */
function AdminAlerts() {
  const router = useRouter();
  const [list, setList] = useState<AdminAlert[] | null>(null);
  const [failed, setFailed] = useState('');
  const [center, setCenter] = useState<'all' | 'eunpyeong' | 'uijeongbu'>('all');
  const [kind, setKind] = useState<'all' | AlertKind>('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const load = useCallback(() => {
    getAdminAlerts().then(l => { setList(l); setFailed(''); }).catch(e => setFailed((e as Error).message));
  }, []);
  useEffect(() => { load(); }, [load]);

  const inCenter = (list ?? []).filter(a => center === 'all' || a.center === center);
  const shown = inCenter.filter(a => (kind === 'all' || a.kind === kind) && (!unreadOnly || !a.readAt));
  // 탭마다 아직 확인 안 한 수 (고른 지점 기준)
  const unreadOf = (k: 'all' | AlertKind) => inCenter.filter(a => !a.readAt && (k === 'all' || a.kind === k)).length;
  const unread = shown.filter(a => !a.readAt);
  const read = async (ids?: string[]) => {
    try { await markAlertsRead(ids); window.dispatchEvent(new Event(ALERTS_CHANGED)); load(); }
    catch (e) { showAlert(`저장하지 못했어요.\n${(e as Error).message}`); }
  };
  const open = async (a: AdminAlert) => {
    if (!a.readAt) await read([a.id]);
    router.push(alertLink(a));
  };
  const sel = 'text-[12px] border border-[#ddd] bg-white px-2 h-8';

  return (
    <div>
      {/* 종류 탭 — 확인 안 한 알림이 있으면 빨간 숫자 */}
      <div role="tablist" className="flex flex-wrap gap-1 mb-3 border-b border-[#e5e5e5]">
        {([{ key: 'all', label: '전체' }, ...ALERT_KINDS] as { key: 'all' | AlertKind; label: string }[]).map(k => {
          const n = unreadOf(k.key);
          return (
            <button key={k.key} role="tab" aria-selected={kind === k.key} onClick={() => setKind(k.key)}
              className={`-mb-px px-3 py-2 text-[13px] border-b-2 transition-colors ${kind === k.key ? 'border-[var(--brand)] text-[var(--brand)]' : 'border-transparent text-[#777] hover:text-[#333]'}`}>
              {k.label}
              {n > 0 && <span className="ml-1.5 inline-block min-w-[16px] rounded-full bg-[#e11d48] px-1 text-center text-[10px] leading-[16px] text-white font-semibold tabular-nums">{n}</span>}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select value={center} onChange={e => setCenter(e.target.value as typeof center)} className={sel} aria-label="지점">
          <option value="all">전체 지점</option><option value="eunpyeong">수색</option><option value="uijeongbu">의정부</option>
        </select>
        <label className="flex items-center gap-1 text-[12px] text-[#555]">
          <input type="checkbox" checked={unreadOnly} onChange={e => setUnreadOnly(e.target.checked)} /> 안 본 것만
        </label>
        <button onClick={() => read(unread.map(a => a.id))} disabled={!unread.length}
          className="ml-auto text-[12px] border border-[#e5e5e5] px-3 h-8 hover:bg-[#f8f8f8] disabled:opacity-40">보이는 것 모두 확인 ({unread.length})</button>
      </div>
      {failed && <p className="text-[13px] text-[#b45309] mb-3">불러오지 못했어요 — SQL(supabase/admin-alerts.sql)을 실행했는지 확인해 주세요. ({failed})</p>}
      {list && shown.length === 0 && <p className="text-[13px] text-[#bbb] py-10 text-center">알림이 없어요.</p>}
      {shown.length > 0 && (
        <div className="rounded-xl border border-[#e5e5e5] bg-white divide-y divide-[#f0f0f0]">
          {shown.map(a => (
            <div key={a.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-[13px] ${a.readAt ? '' : 'bg-[#f8fbff]'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${a.readAt ? 'bg-transparent' : 'bg-[#e11d48]'}`} aria-label={a.readAt ? undefined : '안 봄'} />
              <span className="text-[#999] tabular-nums text-[12px]">{fmt(a.createdAt)}</span>
              <span className="text-[11px] px-1.5 rounded border border-[#e5e5e5] text-[#666]">{CENTER_LABEL[a.center]}</span>
              <span className="text-[11px] px-1.5 rounded bg-[#f4f4f5] text-[#555]">{ALERT_KINDS.find(k => k.key === a.kind)?.label ?? a.kind}</span>
              <button onClick={() => open(a)} className={`text-left hover:underline underline-offset-2 ${a.readAt ? 'text-[#555]' : 'text-[#0a0a0a] font-medium'}`}>{a.title}</button>
              {a.detail && <span className="text-[12px] text-[#888]">{a.detail}</span>}
              <span className="ml-auto text-[11px] text-[#aaa]">
                {a.readAt ? `확인 ${fmt(a.readAt).slice(5)}` : <button onClick={() => read([a.id])} className="underline underline-offset-2 hover:text-[var(--brand)]">확인</button>}
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-[11px] text-[#aaa]">최근 300개까지 보여요. 제목을 누르면 확인함으로 바뀌고 그 화면(회원관리·시간표 관리)으로 가요.</p>
    </div>
  );
}

/** 보호자 알림 내역 — 누구에게 어떤 알림이 갔는지(보낼 것·보냄·실패). 찾기 · 상태 · 종류 · 달 */
function SentLog() {
  const [list, setList] = useState<OutboxMessage[] | null>(null);
  const [rows, setRows] = useState<MessageRow[]>(() => toRows([]));
  const [failed, setFailed] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | OutboxStatus>('all');
  const [kind, setKind] = useState('all');
  const [month, setMonth] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(() => {
    getOutbox(1000).then(l => { setList(l); setFailed(''); }).catch(e => setFailed((e as Error).message));
    getMessageTemplates().then(t => setRows(toRows(t))).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const labelOf = (id: string) => rows.find(r => r.id === id)?.label ?? id;
  const kinds = useMemo(() => [...new Set((list ?? []).map(m => m.templateId))], [list]);
  const shown = (list ?? []).filter(m => (status === 'all' || m.status === status) && (kind === 'all' || m.templateId === kind)
    && (!month || (m.sentAt ?? m.createdAt).slice(0, 7) === month)
    && (!q.trim() || `${m.childName} ${m.phone ?? ''}`.includes(q.trim())));
  const remove = async (m: OutboxMessage) => {
    if (!(await askConfirm(`${m.childName} 알림을 지울까요? (보내지 않아요)`))) return;
    try { await deleteOutbox(m.id); load(); } catch (e) { showAlert(`지우지 못했어요.\n${(e as Error).message}`); }
  };
  const sel = 'text-[12px] border border-[#ddd] bg-white px-2 h-8';

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="아이 이름·번호 찾기" className="text-[12px] border border-[#ddd] px-3 h-8 w-44 outline-none focus:border-[var(--brand)]" />
        <select value={status} onChange={e => setStatus(e.target.value as typeof status)} className={sel} aria-label="상태">
          <option value="all">모든 상태</option>
          {(Object.keys(STATUS) as OutboxStatus[]).map(s => <option key={s} value={s}>{STATUS[s]}</option>)}
        </select>
        <select value={kind} onChange={e => setKind(e.target.value)} className={sel} aria-label="알림 종류">
          <option value="all">모든 알림</option>
          {kinds.map(k => <option key={k} value={k}>{labelOf(k)}</option>)}
        </select>
        <input type="month" value={month} onChange={e => setMonth(e.target.value)} className={sel} aria-label="달" />
        {month && <button onClick={() => setMonth('')} className="text-[11px] text-[#888] underline underline-offset-2">달 지우기</button>}
        <span className="ml-auto text-[12px] text-[#999]">{shown.length}건</span>
      </div>
      <p className="text-[11px] text-[#aaa] mb-3">알림톡(솔라피)을 연결하기 전이라 지금은 '보낼 것'으로 쌓이기만 해요. 연결하면 보낸 시각·실패 사유가 여기 남아요.</p>
      {failed && <p className="text-[13px] text-[#b45309] mb-3">불러오지 못했어요 — SQL(supabase/teacher-leave.sql)을 실행했는지 확인해 주세요. ({failed})</p>}
      {list && shown.length === 0 && <p className="text-[13px] text-[#bbb] py-10 text-center">내역이 없어요.</p>}
      {shown.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-[#e5e5e5] bg-white">
          <table className="w-full text-[12px] text-[#333] border-collapse">
            <thead>
              <tr className="border-b border-[#e5e5e5] text-[#999] text-left">
                {['만든 시각', '아이', '받는 번호', '알림', '내용', '상태', '보낸 시각 / 사유', ''].map((h, i) => <th key={i} className="font-normal px-3 py-2.5 whitespace-nowrap">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {shown.map(m => {
                const t = rows.find(r => r.id === m.templateId);
                return (
                  <FragmentRow key={m.id} cols={8} open={open === m.id && !!t}
                    preview={t ? <div className="max-w-[300px]"><KakaoPreview spec={t.spec} vars={{ ...t.samples, ...m.vars }} /></div> : null}>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums text-[#999]">{fmt(m.createdAt)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{m.childName}</td>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums text-[#888]">{m.phone ?? <span className="text-[#e11d48]">번호 없음</span>}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{labelOf(m.templateId)}</td>
                    <td className="px-3 py-2 text-[#666]">{[m.vars['날짜'], m.vars['시간'], m.vars['구분'], m.vars['사유'], m.vars['신청결과']].filter(Boolean).join(' · ')}</td>
                    <td className="px-3 py-2 whitespace-nowrap"><span className={`text-[11px] px-1.5 rounded ${STATUS_STYLE[m.status]}`}>{STATUS[m.status]}</span></td>
                    <td className="px-3 py-2 text-[#888]">{m.sentAt ? fmt(m.sentAt) : ''}{m.error ? <span className="block text-[#b91c1c]">{m.error}</span> : null}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right">
                      {t && <button onClick={() => setOpen(o => (o === m.id ? null : m.id))} className="text-[11px] text-[#888] underline underline-offset-2 mr-2">{open === m.id ? '접기' : '미리보기'}</button>}
                      {m.status === 'pending' && <button onClick={() => remove(m)} className="text-[11px] text-[#aaa] underline underline-offset-2 hover:text-red-500">지우기</button>}
                    </td>
                  </FragmentRow>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** 표 한 줄 + (펼치면) 아래 미리보기 줄 */
function FragmentRow({ children, cols, open, preview }: { children: React.ReactNode; cols: number; open: boolean; preview: React.ReactNode }) {
  return (
    <>
      <tr className="border-b border-[#f0f0f0] align-top">{children}</tr>
      {open && <tr className="border-b border-[#f0f0f0]"><td colSpan={cols} className="px-3 py-3 bg-[#fafafa]">{preview}</td></tr>}
    </>
  );
}

/** 관리 내역 — 관리자가 한 일. 최근 것부터 */
function AdminLogs() {
  const [list, setList] = useState<AdminLog[] | null>(null);
  const [failed, setFailed] = useState('');
  const [center, setCenter] = useState<'all' | 'eunpyeong' | 'uijeongbu'>('all');
  useEffect(() => { getAdminLogs().then(l => { setList(l); setFailed(''); }).catch(e => setFailed((e as Error).message)); }, []);
  const shown = (list ?? []).filter(l => center === 'all' || l.center === center);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        {([['all', '전체'], ['eunpyeong', '수색'], ['uijeongbu', '의정부']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setCenter(k)}
            className={`text-[12px] px-3 py-1.5 border ${center === k ? 'border-[#0a0a0a] bg-[#0a0a0a] text-white' : 'border-[#e5e5e5] text-[#555] hover:bg-[#f8f8f8]'}`}>{l}</button>
        ))}
      </div>
      {failed && <p className="text-[13px] text-red-400 mb-3">불러오지 못했어요 — SQL(supabase/admin-logs.sql)을 실행했는지 확인해 주세요. ({failed})</p>}
      {!list && !failed && <p className="text-[13px] text-[#aaa]">불러오는 중…</p>}
      {list && !shown.length && <p className="py-10 text-center text-[13px] text-[#bbb]">아직 남은 관리 내역이 없어요.</p>}
      <ul className="divide-y divide-[#f0f0f0] border-y border-[#f0f0f0]">
        {shown.map(l => (
          <li key={l.id} className="py-3">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-[12px] text-[#999] tabular-nums">{fmt(l.createdAt)}</span>
              <span className="text-[11px] text-[#888] border border-[#e5e5e5] rounded px-1">{CENTER_LABEL[l.center as 'eunpyeong' | 'uijeongbu'] ?? l.center}</span>
              {l.actor && <span className="text-[11px] text-[#888]">{l.actor}</span>}
              <span className="text-[14px] text-[#27272a]">{l.title}</span>
            </div>
            {l.detail && <p className="mt-1 text-[12px] leading-[1.8] text-[#555] whitespace-pre-line">{l.detail}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
