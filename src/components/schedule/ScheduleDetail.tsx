'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useAdmin } from '@/components/AdminContext';
import { useMember } from '@/components/MemberContext';
import ScheduleBoard from './ScheduleBoard';
import ScheduleEditor from './ScheduleEditor';
import ScheduleGate from './ScheduleGate';
import type { Schedule, Slot, Teacher } from '@/lib/schedule';
import {
  approveCancel, bookSlot, cancelSlot, deleteSchedule, getSchedule, getTeachers, requestCancel, shortDay, withdrawCancel,
} from '@/lib/schedule';

// 수업스케쥴 하나 — 공지 + 선생님별 시간 + 신청 댓글. 승인된 보호자는 시간을 눌러 선착순으로 신청한다.
// 누를 때마다 DB가 다시 확인하고(동시에 눌러도 한 명만 성공), 끝나면 새로 불러온다.
// 다른 분이 신청하면 실시간으로 화면이 바뀐다(Supabase Realtime). 관리자는 고치기·지우기·신청 취소.

export default function ScheduleDetail({ id }: { id: string }) {
  const router = useRouter();
  const { isAdmin } = useAdmin();
  const { userId, profile } = useMember();
  const canView = isAdmin || (!!userId && !!profile?.approvedAt);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busySlot, setBusySlot] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [popup, setPopup] = useState<string | null>(null);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const myName = profile ? (profile.centerNickname || profile.nickname) : undefined;

  const load = useCallback(async () => {
    try {
      const [t, s] = await Promise.all([getTeachers(), getSchedule(id)]);
      setTeachers(t);
      setSchedule(s);
    } catch {
      setSchedule(null);
    } finally {
      setLoaded(true);
    }
  }, [id]);

  useEffect(() => { if (canView) load(); }, [canView, load]);

  // 실시간: 이 스케쥴의 칸·신청 기록이 바뀌면 잠깐 모았다가 다시 불러온다
  useEffect(() => {
    if (!canView) return;
    const again = () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(load, 300);
    };
    const ch = supabase
      .channel(`schedule-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'slots', filter: `schedule_id=eq.${id}` }, again)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `schedule_id=eq.${id}` }, again)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [canView, id, load]);

  const handlePick = async (slot: Slot, teacher: Teacher) => {
    if (!confirm(`${teacher.name} 선생님 ${shortDay(slot.day)} ${slot.time}\n이 시간으로 신청할까요?\n(취소가 필요하면 신청완료 버튼을 눌러 취소 신청할 수 있어요)`)) return;
    setBusySlot(slot.id);
    try {
      const r = await bookSlot(slot.id);
      if (r === 'taken') setPopup('방금 다른 분이 먼저 신청했어요.\n다른 시간을 골라 주세요.');
      if (r === 'not_approved') setPopup('센터 승인 후 신청할 수 있어요.');
    } catch {
      setPopup('신청하지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setBusySlot(null);
      load();
    }
  };

  const handleCancel = async (slot: Slot, teacher: Teacher) => {
    if (!confirm(`${teacher.name} 선생님 ${shortDay(slot.day)} ${slot.time}\n${slot.owner ?? ''} 님의 신청을 취소할까요?\n(시간이 다시 열리고, 댓글엔 "취소"로 남아요)`)) return;
    setBusySlot(slot.id);
    try { await cancelSlot(slot.id); }
    catch { alert('취소하지 못했어요. 다시 시도해 주세요.'); }
    finally { setBusySlot(null); load(); }
  };

  // 보호자 취소 신청 · 철회, 관리자 승인 — 끝나면 새로 불러온다
  const runSlot = async (slot: Slot, ask: string, fn: (id: string) => Promise<string>, fail: string) => {
    if (!confirm(ask)) return;
    setBusySlot(slot.id);
    try {
      const r = await fn(slot.id);
      if (r !== 'ok') setPopup(fail);
    } catch {
      setPopup('처리하지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setBusySlot(null);
      load();
    }
  };
  const label = (slot: Slot, teacher: Teacher) => `${teacher.name} 선생님 ${shortDay(slot.day)} ${slot.time}`;
  const handleRequestCancel = (slot: Slot, teacher: Teacher) =>
    runSlot(slot, `${label(slot, teacher)}\n취소를 신청할까요?\n(센터에서 승인하기 전까지는 다시 눌러 철회할 수 있어요)`, requestCancel, '취소 신청을 하지 못했어요.');
  const handleWithdrawCancel = (slot: Slot, teacher: Teacher) =>
    runSlot(slot, `${label(slot, teacher)}\n취소 신청을 철회할까요?`, withdrawCancel, '이미 센터에서 취소를 승인했어요.');
  const handleApproveCancel = (slot: Slot, teacher: Teacher) =>
    runSlot(slot, `${label(slot, teacher)}\n${slot.owner ?? ''} 님의 취소 신청을 승인할까요?\n(시간은 다시 열리지 않고, 다른 분에겐 계속 마감으로 보여요)`, approveCancel, '보호자가 이미 취소 신청을 철회했어요.');

  const handleDelete = async () => {
    if (!schedule) return;
    const booked = schedule.slots.filter(x => x.bookedBy).length;
    if (!confirm(`"${schedule.title}"을(를) 지울까요?${booked ? `\n신청된 ${booked}건과 댓글도 모두 지워져요.` : ''}`)) return;
    try { await deleteSchedule(schedule.id); router.push('/schedule'); }
    catch { alert('지우지 못했어요. 다시 시도해 주세요.'); }
  };

  return (
    <div className="max-w-[720px] mx-auto px-4 pt-8 pb-14 md:pt-14 fade-up">
      <Link href="/schedule" className="inline-block text-[12px] text-[#999] hover:text-[#333] mb-6">← 수업스케쥴 목록</Link>

      <ScheduleGate>
        {editing && schedule ? (
          <ScheduleEditor
            teachers={teachers}
            existing={schedule}
            onTeachersChanged={async () => setTeachers(await getTeachers())}
            onClose={savedId => { setEditing(false); if (savedId) load(); }}
          />
        ) : loaded && !schedule ? (
          <p className="text-center text-[14px] text-[#aaa] py-16">스케쥴을 찾을 수 없어요.</p>
        ) : schedule ? (
          <ScheduleBoard
            schedule={schedule}
            teachers={teachers}
            isAdmin={isAdmin}
            myId={userId}
            nickname={myName}
            busySlot={busySlot}
            onPick={handlePick}
            onCancel={handleCancel}
            onApproveCancel={handleApproveCancel}
            onRequestCancel={handleRequestCancel}
            onWithdrawCancel={handleWithdrawCancel}
            onEdit={() => { setEditing(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            onDelete={handleDelete}
          />
        ) : null}
      </ScheduleGate>

      {popup && createPortal(
        <div role="alertdialog" aria-modal="true" className="fixed inset-0 z-[400] flex items-center justify-center bg-black/30 px-6" onClick={() => setPopup(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-6 text-center" onClick={e => e.stopPropagation()}>
            <p className="text-[15px] leading-[2] text-[#333] whitespace-pre-line mb-5">{popup}</p>
            <button onClick={() => setPopup(null)} className="w-full bg-[var(--brand)] text-white text-[14px] py-2.5 rounded-full">확인</button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
