'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabaseClient';
import { useAdmin } from '@/components/AdminContext';
import { useMember } from '@/components/MemberContext';
import ScheduleBoard from '@/components/schedule/ScheduleBoard';
import ScheduleEditor from '@/components/schedule/ScheduleEditor';
import type { Schedule, Slot, Teacher } from '@/lib/schedule';
import { bookSlot, cancelSlot, deleteSchedule, getSchedules, getTeachers, shortDay } from '@/lib/schedule';

// 수업스케쥴 — 관리자가 올린 한 주 빈 수업 시간을 승인된 보호자가 선착순으로 신청한다.
// 누를 때마다 DB가 다시 확인하고(동시에 눌러도 한 명만 성공), 끝나면 새로 불러온다.
// 다른 분이 신청하면 실시간으로 화면이 바뀐다(Supabase Realtime).

export default function SchedulePage() {
  const { isAdmin } = useAdmin();
  const { userId, profile, loading: memberLoading, login } = useMember();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busySlot, setBusySlot] = useState<string | null>(null);
  const [editing, setEditing] = useState<Schedule | 'new' | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [popup, setPopup] = useState<string | null>(null);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const approved = isAdmin || !!profile?.approvedAt;
  const canView = isAdmin || (!!userId && approved);
  const myName = profile ? (profile.centerNickname || profile.nickname) : undefined;

  const load = useCallback(async () => {
    try {
      const [t, s] = await Promise.all([getTeachers(), getSchedules(isAdmin && showPast)]);
      setTeachers(t);
      setSchedules(s);
    } catch {
      // 권한이 없거나 표가 아직 없으면 빈 화면
    } finally {
      setLoaded(true);
    }
  }, [isAdmin, showPast]);

  useEffect(() => { if (canView) load(); }, [canView, load]);

  // 실시간: 칸·신청 기록이 바뀌면 잠깐 모았다가 다시 불러온다
  useEffect(() => {
    if (!canView) return;
    const ch = supabase
      .channel('schedule-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'slots' }, () => {
        if (reloadTimer.current) clearTimeout(reloadTimer.current);
        reloadTimer.current = setTimeout(load, 300);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => {
        if (reloadTimer.current) clearTimeout(reloadTimer.current);
        reloadTimer.current = setTimeout(load, 300);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [canView, load]);

  const handlePick = async (slot: Slot, teacher: Teacher) => {
    if (!confirm(`${teacher.name} 선생님 ${shortDay(slot.day)} ${slot.time}\n이 시간으로 신청할까요?\n(취소는 센터로 연락해 주세요)`)) return;
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

  const handleDelete = async (s: Schedule) => {
    const booked = s.slots.filter(x => x.bookedBy).length;
    if (!confirm(`"${s.title}"을(를) 지울까요?${booked ? `\n신청된 ${booked}건과 댓글도 모두 지워져요.` : ''}`)) return;
    try { await deleteSchedule(s.id); load(); }
    catch { alert('지우지 못했어요. 다시 시도해 주세요.'); }
  };

  const header = (
    <div className="text-center mb-8">
      <h1 className="display-heading">수업스케쥴</h1>
    </div>
  );

  // ── 로그인·승인 안내 ──
  if (!isAdmin && (memberLoading || !userId || !approved)) {
    return (
      <div className="max-w-[640px] mx-auto px-4 pt-8 pb-14 md:pt-14 fade-up">
        {header}
        <div className="bg-white rounded-[18px] shadow-[0_2px_6px_rgba(0,0,0,0.05),0_10px_24px_rgba(0,0,0,0.05)] px-6 py-12 text-center space-y-4">
          {memberLoading ? (
            <p className="text-[14px] text-[#aaa]">불러오는 중…</p>
          ) : !userId ? (
            <>
              <p className="text-[15px] leading-[1.9] text-[#555]">수업 신청은 카카오 로그인 후<br />센터 승인을 받은 보호자만 할 수 있어요.</p>
              <button onClick={login} className="inline-flex items-center gap-2 bg-[#FEE500] text-[#191919] text-[15px] px-6 py-3 rounded-full hover:opacity-90">
                카카오로 로그인
              </button>
            </>
          ) : !profile ? (
            <p className="text-[15px] text-[#555]">먼저 보호자 닉네임을 정해 주세요.</p>
          ) : (
            <p className="text-[15px] leading-[1.9] text-[#555]">
              <span className="text-[var(--brand)]">{profile.nickname}</span> 보호자님, 가입 신청이 접수됐어요.<br />
              센터에서 승인하면 수업을 신청할 수 있어요.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[720px] mx-auto px-4 pt-8 pb-14 md:pt-14 fade-up">
      {header}

      {isAdmin && !editing && (
        <div className="flex flex-wrap items-center justify-center gap-2 mb-6">
          <button onClick={() => setEditing('new')} className="text-[13px] bg-[var(--brand)] text-white px-5 py-2.5 tracking-widest hover:opacity-90">
            + 새 스케쥴 올리기
          </button>
          <button onClick={() => setShowPast(p => !p)} className="text-[13px] border border-[#e5e5e5] px-4 py-2.5 hover:bg-[#f8f8f8]">
            {showPast ? '지난 스케쥴 숨기기' : '지난 스케쥴도 보기'}
          </button>
        </div>
      )}

      {editing && (
        <div className="mb-10">
          <ScheduleEditor
            teachers={teachers}
            existing={editing === 'new' ? undefined : editing}
            onTeachersChanged={async () => setTeachers(await getTeachers())}
            onClose={saved => { setEditing(null); if (saved) load(); }}
          />
        </div>
      )}

      {loaded && schedules.length === 0 && !editing && (
        <p className="text-center text-[14px] text-[#aaa] py-16">아직 올라온 수업 스케쥴이 없어요.</p>
      )}

      <div className="space-y-12">
        {schedules.map(s => (
          <ScheduleBoard
            key={s.id}
            schedule={s}
            teachers={teachers}
            isAdmin={isAdmin}
            myId={userId}
            nickname={myName}
            busySlot={busySlot}
            onPick={handlePick}
            onCancel={handleCancel}
            onEdit={() => { setEditing(s); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            onDelete={() => handleDelete(s)}
          />
        ))}
      </div>

      {popup && createPortal(
        <div role="alertdialog" aria-modal="true" className="fixed inset-0 z-[400] flex items-center justify-center bg-black/30 px-6" onClick={() => setPopup(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-6 text-center" onClick={e => e.stopPropagation()}>
            <p className="text-[15px] leading-[1.8] text-[#333] whitespace-pre-line mb-5">{popup}</p>
            <button onClick={() => setPopup(null)} className="w-full bg-[var(--brand)] text-white text-[14px] py-2.5 rounded-full">확인</button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
