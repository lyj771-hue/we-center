'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Teacher } from '@/lib/schedule';
import type { CellView, Center, Child, PayEntry } from '@/lib/timetable';
import { childLabel, saveDayCell, setLessonPayment } from '@/lib/timetable';
import { getMembers } from '@/lib/store';
import type { Member } from '@/lib/types';
import { addLeave, addAndSendOutbox } from '@/lib/leave';
import { sendSummary } from '@/lib/alimtalkNotify';
import { askConfirm, showAlert } from '@/lib/dialog';

// 선생님 휴무 (시간표 날짜별) — 종일 또는 고른 시간. 그 시간 수업 칸은 "줄 + 휴무"(옮김처럼 수업·결제에서 빠짐)로 바꾸고,
// 휴무 기록과 수업이 있던 아이들에게 보낼 알림(보낼 알림 목록)을 남긴다. 알림은 솔라피가 준비되면 거기서 보낸다.

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const CENTER_LABEL: Record<Center, string> = { eunpyeong: '은평점', uijeongbu: '의정부점' };

export interface LeaveLesson { time: string; side: 'fixed' | 'open'; cell: CellView }

export default function TeacherLeaveDialog({ teacher, day, center, rows, lessons, children, payments, onClose, onDone }: {
  teacher: Teacher;
  day: string;
  center: Center;
  /** 그날 표의 시간 줄 */
  rows: string[];
  /** 이 선생님 그날 수업 (결석·옮김 뺀, 아이가 있는 칸) */
  lessons: LeaveLesson[];
  children: Child[];
  /** 그날 결제 체크 — "아이|시간" */
  payments: Map<string, PayEntry>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [allDay, setAllDay] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState('');
  const [members, setMembers] = useState<Member[] | null>(null);
  const [skip, setSkip] = useState<Set<string>>(new Set());   // 알림 안 보낼 아이
  const [saving, setSaving] = useState(false);
  useEffect(() => { getMembers().then(setMembers).catch(() => setMembers([])); }, []);

  const [y, m, dd] = day.split('-').map(Number);
  const date = new Date(y, m - 1, dd);
  const dayText = `${m}/${dd}(${DOW[date.getDay()]})`;
  const lessonTimes = new Set(lessons.map(l => l.time));
  const times = allDay ? rows : rows.filter(t => picked.has(t));
  const hit = lessons.filter(l => times.includes(l.time));

  // 아이마다 — 수업 시간들과 받을 번호
  const kids = useMemo(() => {
    const map = new Map<string, { childId?: string; name: string; times: string[]; child?: Child }>();
    for (const l of hit) {
      const k = l.cell.childId ?? `name:${l.cell.name}`;
      const child = l.cell.childId ? children.find(c => c.id === l.cell.childId) : undefined;
      const e = map.get(k) ?? { childId: l.cell.childId, name: child ? childLabel(child) : `${l.cell.name ?? ''}${l.cell.number ?? ''}`, times: [], child };
      if (!e.times.includes(l.time)) e.times.push(l.time);
      map.set(k, e);
    }
    return [...map.entries()].map(([key, e]) => {
      const mem = e.child?.guardianUserId ? members?.find(x => x.userId === e.child!.guardianUserId) : undefined;
      return { key, ...e, times: e.times.sort(), userId: e.child?.guardianUserId, phone: mem?.phone };
    });
  }, [hit, children, members]);
  const sendable = kids.filter(k => k.phone && !skip.has(k.key));   // 번호가 있고 체크한 아이만 보낼 알림에 남긴다

  const toggleTime = (t: string) => setPicked(s => { const n = new Set(s); if (n.has(t)) n.delete(t); else n.add(t); return n; });
  const hm = (t: string) => t.replace(/^0/, '');

  const save = async () => {
    if (!allDay && !picked.size) { showAlert('휴무 시간을 골라 주세요.'); return; }
    // 알림이 가면 먼저 알려 준다
    if (sendable.length && !(await askConfirm(`휴무로 바꾸면 보호자 ${sendable.length}명에게 휴무 알림이 가요.\n(${sendable.map(k => k.name).join(', ')})\n진행할까요?`))) return;
    setSaving(true);
    const note = `휴무${reason.trim() ? ` · ${reason.trim()}` : ''}`;
    let failed = 0;
    // 1) 수업 칸 → 줄 + 휴무 (고른 결제 중 확정 안 된 것은 지운다)
    for (const l of hit) {
      const c = l.cell;
      try {
        await saveDayCell(day, teacher.id, l.time, l.side, {
          status: 'child', childId: c.childId ?? null, name: c.name, payment: c.payment, kind: c.kind ?? null,
          absent: false, moved: true, note: c.note && !c.note.startsWith('휴무') ? `${note} / ${c.note}` : note,
        }, center);
        const p = c.childId ? payments.get(`${c.childId}|${l.time}`) : undefined;
        if (p && !p.confirmed) await setLessonPayment(c.childId!, day, l.time, teacher.id, center, null);
      } catch { failed++; }
    }
    // 2) 휴무 기록 + 보호자 알림톡(바로 보냄)
    let sendRes: { sent: number; failed: number; skipped: number; waiting: number } | null = null;
    try {
      const id = await addLeave({ day, teacherId: teacher.id, center, times: allDay ? null : [...picked].sort(), reason });
      sendRes = await addAndSendOutbox(sendable.map(k => ({
        templateId: 'teacher_leave', refId: id, childId: k.childId, userId: k.userId, childName: k.name, phone: k.phone,
        vars: {
          이름: k.child?.name ?? k.name, 날짜: `${y}/${String(m).padStart(2, '0')}/${String(dd).padStart(2, '0')}`, 월일: `${m}/${dd}`,
          요일: DOW[date.getDay()], 시간: k.times.map(hm).join(', '), 선생님: teacher.name, 사유: reason.trim() || '휴무', 센터: CENTER_LABEL[center],
        },
      })));
    } catch (e) {
      setSaving(false);
      showAlert(`휴무 기록·보낼 알림을 저장하지 못했어요.\nSQL(supabase/teacher-leave.sql)을 실행했는지 확인해 주세요.\n${(e as Error).message}`);
      onDone();
      return;
    }
    setSaving(false);
    onDone();
    showAlert(`${teacher.name} 선생님 ${dayText} ${allDay ? '종일' : `${[...picked].sort().map(hm).join(', ')}`} 휴무로 바꿨어요.\n수업 ${hit.length}개 취소${failed ? ` (${failed}개는 저장 실패 — 다시 해 주세요)` : ''}\n휴무 수업 취소 알림톡 — ${sendRes ? sendSummary(sendRes) : '보낼 아이 없음'}\n(알림 → 보호자 알림 내역에서 볼 수 있어요)`);
  };

  const chip = (on: boolean) => `px-3 py-1 rounded-full border text-[13px] ${on ? 'border-[var(--brand)] bg-[var(--brand)] text-white' : 'border-[#e5e5e5] text-[#555] hover:bg-[#f8f8f8]'}`;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div className="bg-white w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl p-5 shadow-2xl space-y-4" onClick={e => e.stopPropagation()}>
        <h2 className="text-[17px] text-[#27272a]">{teacher.name} 선생님 휴무 <span className="text-[13px] text-[#888]">{dayText}</span></h2>

        <div className="flex gap-2">
          <button type="button" onClick={() => setAllDay(true)} className={chip(allDay)}>종일</button>
          <button type="button" onClick={() => setAllDay(false)} className={chip(!allDay)}>시간 고르기</button>
        </div>
        {!allDay && (
          <div className="grid grid-cols-3 gap-1.5">
            {rows.map(t => (
              <label key={t} className={`flex items-center gap-1.5 text-[13px] border rounded px-2 py-1 cursor-pointer ${picked.has(t) ? 'border-[var(--brand)] bg-[#fff1f2]' : 'border-[#eee]'}`}>
                <input type="checkbox" checked={picked.has(t)} onChange={() => toggleTime(t)} />
                <span className="tabular-nums">{hm(t)}</span>
                {lessonTimes.has(t) && <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand)]" title="수업 있음" />}
              </label>
            ))}
          </div>
        )}

        <label className="block">
          <span className="block text-[12px] text-[#888] mb-1">사유 (알림에 들어가요)</span>
          <input value={reason} onChange={e => setReason(e.target.value)} maxLength={40} placeholder="비우면 '휴무' (예: 교육 참석)"
            className="w-full border border-[#e5e5e5] rounded-md px-2.5 py-1.5 text-[14px] focus:outline-none focus:border-[var(--brand)]" />
        </label>

        <div>
          <p className="text-[12px] text-[#888] mb-1.5">취소되는 수업 {hit.length}개 · 알림 받을 아이 (체크 해제하면 안 보내요)</p>
          {kids.length === 0 ? <p className="text-[13px] text-[#bbb]">이 시간에는 수업이 없어요.</p> : (
            <ul className="space-y-1">
              {kids.map(k => (
                <li key={k.key} className="flex items-center gap-2 text-[13px]">
                  <input type="checkbox" checked={!!k.phone && !skip.has(k.key)} disabled={!k.phone}
                    onChange={() => setSkip(s => { const n = new Set(s); if (n.has(k.key)) n.delete(k.key); else n.add(k.key); return n; })} />
                  <span className="text-[#27272a]">{k.name}</span>
                  <span className="text-[#888] tabular-nums">{k.times.map(hm).join(', ')}</span>
                  <span className={`ml-auto text-[11px] ${k.phone ? 'text-[#888]' : 'text-[#e11d48]'}`}>
                    {members === null ? '…' : k.phone ?? (k.userId ? '번호 없음' : '가입 안 함')}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {kids.length > 0 && <p className="mt-1 text-[11px] text-[#aaa]">번호가 없는 아이는 알림을 못 보내요 (센터에서 따로 연락). 보낼 알림 {sendable.length}건</p>}
        </div>

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={save} disabled={saving}
            className="flex-1 bg-[var(--brand)] text-white text-[14px] py-2.5 rounded disabled:opacity-50">{saving ? '저장 중…' : '휴무 저장'}</button>
          <button type="button" onClick={onClose} className="flex-1 border border-[#e5e5e5] text-[14px] py-2.5 rounded hover:bg-[#f8f8f8]">닫기</button>
        </div>
      </div>
    </div>
  );
}
