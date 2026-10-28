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
import { onScheduleChanged } from '@/lib/sync';
import {
  bookSlot, FREE_CANCEL_MIN, freeCancelSlot, freeCancelUntil, getSchedulePreview, notifyBooked, publishLabel, setScheduleHidden, getSchedule, scheduleDays,
  getScheduleTeachers, shortDay,
} from '@/lib/schedule';
import { getMyLessons, isRealLesson } from '@/lib/mypage';
import { askConfirm, showAlert } from '@/lib/dialog';
import { getSlotOwners, getTeacherLessons, teacherAddSlots, teacherRemoveSlots } from '@/lib/teacher';
import { rowsForDay } from '@/lib/timetable';

// 수업스케쥴 하나 — 공지 + 선생님별 시간. 승인된 보호자는 시간을 눌러 선착순으로 신청한다.
// 누를 때마다 DB가 다시 확인하고(동시에 눌러도 한 명만 성공), 끝나면 새로 불러온다.
// 다른 분이 신청하면 실시간으로 화면이 바뀐다(Supabase Realtime). 관리자는 고치기·지우기·신청 취소.
// 보호자 취소 — 기본은 없음(센터로 연락). 게시 후 10분 취소 가능 글만 그 10분 동안 신청완료를 눌러 바로 취소(supabase/schedule-reserve.sql).
// 예약 게시 글 — 게시 전에 알림톡 버튼으로 들어온 보호자에겐 "몇 시에 게시돼요"를 보여 주다가 그 시각에 저절로 연다.
// 선생님: 관리자처럼 칸마다 누가 신청했는지 보고, 내 시간은 여러 개 골라 [내리기], 그날 + 로 빈칸·x 시간을 골라 [저장](= 더하기). (supabase/teacher-schedule-post.sql)

export default function ScheduleDetail({ id }: { id: string }) {
  const router = useRouter();
  const { isAdmin } = useAdmin();
  const { userId, profile, teacher } = useMember();
  // 선생님은 두 지점 모두 보기만 (신청은 보호자만)
  const canView = isAdmin || !!teacher || (!!userId && !!profile?.approvedAt);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busySlot, setBusySlot] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState(false);
  const [popup, setPopup] = useState<string | null>(null);
  // 선생님 — 내릴 내 시간(칸 id), 더할 시간("날짜" → 시간들), 더할 시간 고르는 창
  const myTeacherId = !isAdmin ? teacher?.teacherId ?? null : null;
  const [removeSel, setRemoveSel] = useState<Set<string>>(new Set());
  const [adds, setAdds] = useState<Record<string, string[]>>({});
  const [addFor, setAddFor] = useState<{ day: string; options: string[]; picked: Set<string> } | null>(null);
  const [tWorking, setTWorking] = useState(false);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 게시 전 글(보호자) — 제목·게시 시각
  const [preview, setPreview] = useState<{ title: string; publishAt: string } | null>(null);
  // 10분 자유 취소 — 끝나는 시각이 되면 화면을 다시 그린다
  const [, setTick] = useState(0);

  // 보호자 화면엔 보호자가 정한 닉네임
  const myName = profile?.nickname;

  const load = useCallback(async () => {
    try {
      const [t, s] = await Promise.all([getScheduleTeachers(), getSchedule(id)]);
      setTeachers(t);
      // 선생님 — 관리자처럼 칸마다 누가 신청했는지 (보호자 이름은 표 권한이 없어 함수로)
      if (s && teacher && !isAdmin) {
        const owners = await getSlotOwners(s.id);
        s.slots = s.slots.map(x => (x.bookedBy || owners.has(x.id) ? { ...x, owner: owners.get(x.id) ?? x.owner } : x));
        // 그 사이 신청된 칸은 내릴 시간에서 뺀다
        setRemoveSel(sel => new Set([...sel].filter(sid => s.slots.some(x => x.id === sid && !x.bookedBy))));
      }
      setSchedule(s);
      if (!s && !isAdmin && !teacher) setPreview(await getSchedulePreview(id));
      else setPreview(null);
      // 보호자: 이 스케쥴 기간의 우리 아이 수업 — 겹치는 시간은 미리 "수업 있음"으로
      if (s && !isAdmin && !teacher && userId) {
        const days = scheduleDays(s);
        const mine = await getMyLessons(days[0], days[days.length - 1]).catch(() => []);
        const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
        const busy = mine.filter(l => isRealLesson(l));
        setConflicts(new Set(s.slots.filter(sl => !sl.bookedBy && busy.some(l => l.day === sl.day && Math.abs(toMin(l.time) - toMin(sl.time)) < 50)).map(sl => sl.id)));
      }
    } catch {
      setSchedule(null);
    } finally {
      setLoaded(true);
    }
  }, [id, isAdmin, teacher, userId]);

  useEffect(() => { if (canView) load(); }, [canView, load]);
  // 실시간 보강 — 다른 화면(선생님 시간표·시간표 관리)에서 바뀌면 신호로 바로, 놓친 것은 1분마다·화면으로 돌아올 때 다시 읽는다
  useEffect(() => {
    if (!canView) return;
    const off = onScheduleChanged(() => load());
    const t = setInterval(load, 60000);
    const onShow = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onShow);
    return () => { off(); clearInterval(t); document.removeEventListener('visibilitychange', onShow); };
  }, [canView, load]);

  // 게시 전 글 — 게시 시각에 다시 불러온다
  useEffect(() => {
    if (!preview) return;
    const ms = new Date(preview.publishAt).getTime() - Date.now();
    const t = setTimeout(load, Math.max(500, ms + 1000));
    return () => clearTimeout(t);
  }, [preview, load]);
  const freeUntil = schedule ? freeCancelUntil(schedule) : null;
  const canFreeCancel = freeUntil !== null && Date.now() < freeUntil;
  useEffect(() => {
    if (freeUntil === null || Date.now() >= freeUntil) return;
    const t = setTimeout(() => setTick(n => n + 1), freeUntil - Date.now() + 200);
    return () => clearTimeout(t);
  }, [freeUntil]);

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

  // 누르면 묻지 않고 바로 신청 (선착순이라 한 번에). 안 되면 그 까닭만 팝업
  const handlePick = async (slot: Slot) => {
    setBusySlot(slot.id);
    try {
      const r = await bookSlot(slot.id);
      if (r === 'ok') notifyBooked(slot.id);   // '수업 확정' 알림톡
      if (r === 'taken') setPopup('방금 다른 분이 먼저 신청했어요.\n다른 시간을 골라 주세요.');
      if (r === 'not_approved') setPopup('센터 승인 후 신청할 수 있어요.');
      if (r === 'conflict') setPopup('그 시간에는 이미 우리 아이 수업이 있어요.\n다른 시간을 골라 주세요.');
    } catch (e) {
      setPopup(/not_published/.test((e as Error).message ?? '') ? '아직 게시 전이에요. 게시되면 신청할 수 있어요.' : '신청하지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setBusySlot(null);
      load();
    }
  };


  const label = (slot: Slot, teacher: Teacher) => `${teacher.name} 선생님 ${shortDay(slot.day)} ${slot.time}`;
  // 게시 후 10분 안 — 승인 없이 바로 취소(시간이 다시 열린다)
  const handleFreeCancel = async (slot: Slot, teacher: Teacher) => {
    if (!(await askConfirm(`${label(slot, teacher)}\n신청을 취소할까요?\n취소하면 다른 분이 신청할 수 있어요.`, '신청 취소'))) return;
    setBusySlot(slot.id);
    try {
      const r = await freeCancelSlot(slot.id);
      setPopup(r === 'ok' ? '신청을 취소했어요.' : r === 'too_late' ? `게시 후 ${FREE_CANCEL_MIN}분이 지나 취소할 수 없어요.\n취소·변경은 센터로 연락해 주세요.` : '취소할 수 없는 시간이에요. 화면을 새로 볼게요.');
    } catch {
      setPopup('취소하지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setBusySlot(null);
      load();
    }
  };


  // ── 선생님 — 내 시간 내리기 · 더하기 ─────────────────────────────
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];
  const whenOf = (day: string, time: string) => { const d = new Date(`${day}T00:00:00`); return `${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]}) ${time.replace(/^0/, '')}`; };
  const startsAt = (day: string, time: string) => new Date(`${day}T${time.length === 4 ? `0${time}` : time}:00`).getTime();
  const toggleRemove = (slot: Slot) => {
    if (slot.bookedBy) return;
    setRemoveSel(sel => { const n = new Set(sel); if (n.has(slot.id)) n.delete(slot.id); else n.add(slot.id); return n; });
  };
  // + — 그날 내 빈타임이 비어 있거나 x인 시간(게시글에 없고, 수업 시작까지 1시간 넘게 남은 것)
  const openAdd = async (day: string) => {
    if (!schedule || !myTeacherId || removeSel.size) return;
    try {
      const lessons = (await getTeacherLessons(day, day)).filter(l => l.center === schedule.center && l.day === day);
      const mine = lessons.filter(l => l.teacherId === myTeacherId);
      const times = rowsForDay(day, lessons.map(l => `${l.teacherId}|${l.time}`), schedule.center);
      const have = new Set(schedule.slots.filter(x => x.teacherId === myTeacherId && x.day === day).map(x => x.time));
      const pending = new Set(adds[day] ?? []);
      // 20분짜리 쉬는 시간(다음 줄까지 40분이 안 되는 줄 — 평일 16:30, 토요일 13:10)은 게시 안 함
      const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
      const shortBreak = new Set(times.filter((t, i) => i + 1 < times.length && mins(times[i + 1]) - mins(t) < 40));
      const options = times.filter(time => {
        if (shortBreak.has(time)) return false;
        const o = mine.find(l => l.side === 'open' && l.time === time);
        const f = mine.find(l => l.side === 'fixed' && l.time === time);
        if (o && o.status !== 'off') return false;                                   // 빈칸이나 x 만
        if (f && f.status === 'child' && !f.moved && !f.absent) return false;          // 고정 수업이 있는 시간은 안 됨
        return !have.has(time) && !pending.has(time) && startsAt(day, time) >= Date.now() + 60 * 60 * 1000;
      });
      if (!options.length) { setPopup(`${whenOf(day, '').trim()}에는 더할 수 있는 시간이 없어요.\n(빈칸이나 x이고, 수업 시작까지 1시간 넘게 남은 시간만 더할 수 있어요)`); return; }
      setAddFor({ day, options, picked: new Set() });
    } catch (e) {
      setPopup(`시간을 불러오지 못했어요.\n${(e as Error).message}`);
    }
  };
  const addCount = Object.values(adds).reduce((n, v) => n + v.length, 0);
  const doRemove = async () => {
    if (!schedule || !removeSel.size) return;
    const list = schedule.slots.filter(x => removeSel.has(x.id));
    if (!(await askConfirm(`내 시간 ${list.length}개를 게시글에서 내릴까요?\n\n${list.map(x => `· ${whenOf(x.day, x.time)}`).join('\n')}\n\n시간표 그 칸은 x(수업 안 함)가 돼요.\n보호자에게는 알림이 가지 않고, 센터(관리자)에게 알림톡이 가요.`, '내리기'))) return;
    setTWorking(true);
    try {
      const r = await teacherRemoveSlots(schedule.id, [...removeSel]);
      if (r.result === 'booked') {
        const booked = r.booked ?? [];
        setRemoveSel(sel => new Set([...sel].filter(sid => !booked.some(b => b.slot_id === sid))));
        setPopup(`그 사이 예약된 시간이 있어서 내리지 않았어요.\n\n${booked.map(b => { const x = schedule.slots.find(y => y.id === b.slot_id); return `· ${x ? whenOf(x.day, x.time) : ''} ${b.name}`; }).join('\n')}\n\n예약된 시간은 선택에서 뺐어요.`);
      } else if (r.result === 'ok') {
        setRemoveSel(new Set());
        setPopup(`${r.count}개 시간을 내렸어요.`);
      } else setPopup(r.result === 'not_teacher' ? '선생님 인증된 계정만 내릴 수 있어요.' : '내릴 시간이 없어요. 화면을 새로 볼게요.');
    } catch (e) {
      setPopup(`내리지 못했어요. SQL(supabase/teacher-schedule-post.sql)을 실행했는지 확인해 주세요.\n${(e as Error).message}`);
    } finally { setTWorking(false); load(); }
  };
  const doSave = async () => {
    if (!schedule || !addCount) return;
    const list = Object.entries(adds).flatMap(([day, ts]) => ts.map(time => ({ day, time }))).sort((a, b) => (a.day + a.time).localeCompare(b.day + b.time));
    if (!(await askConfirm(`${list.length}개 시간을 게시글에 새로 열까요?\n\n${list.map(x => `· ${whenOf(x.day, x.time)}`).join('\n')}\n\nx 칸은 x가 풀려요.\n보호자에게 스케줄 업데이트 알림톡, 센터(관리자)에게도 알림톡이 가요.`, '저장'))) return;
    setTWorking(true);
    try {
      const r = await teacherAddSlots(schedule.id, list);
      if (r.result === 'ok') {
        setAdds({});
        const s = r.sent;
        setPopup(`${r.count}개 시간을 새로 열었어요.${(r.count ?? 0) < list.length ? '\n(그 사이 막혔거나 1시간 안으로 들어온 시간은 빠졌어요)' : ''}${s ? `\n알림톡 — 보냄 ${s.sent}건${s.waiting ? ` · 템플릿 심사 전이라 남겨만 둠 ${s.waiting}건` : ''}` : ''}`);
      } else setPopup(r.result === 'none' ? '열 수 있는 시간이 없어요. 그 사이 수업이 들어왔거나 1시간 안으로 들어왔어요.' : r.result === 'no_post' ? '이 게시글은 내려가서 더할 수 없어요.' : '선생님 인증된 계정만 열 수 있어요.');
    } catch (e) {
      setPopup(`저장하지 못했어요. SQL(supabase/teacher-schedule-post.sql)을 실행했는지 확인해 주세요.\n${(e as Error).message}`);
    } finally { setTWorking(false); load(); }
  };

  // 내리기 — 지우지 않고 숨긴다(보호자 목록에서만 안 보이고, 신청 수업·기록은 시간표·마이페이지에 그대로)
  const handleDelete = async () => {
    if (!schedule) return;
    if (!(await askConfirm(`"${schedule.title}"을(를) 내릴까요?\n보호자 목록에서만 안 보이고, 신청한 수업은 시간표·마이페이지에 그대로 남아요.`))) return;
    try {
      await setScheduleHidden(schedule.id, true);
      router.push(schedule.center === 'uijeongbu' ? '/schedule/uijeongbu' : '/schedule');
    } catch (e) { showAlert(`내리지 못했어요 — SQL(supabase/schedule-hide.sql)을 실행했는지 확인해 주세요.\n${(e as Error).message}`); }
  };

  return (
    <div className="max-w-[720px] mx-auto px-4 pt-8 pb-14 md:pt-14 fade-up">
      <Link href="/schedule" className="inline-block text-[12px] text-[#999] hover:text-[#333] mb-6">← 수업스케쥴 목록</Link>

      <ScheduleGate>
        {editing && schedule ? (
          <ScheduleEditor
            teachers={teachers}
            existing={schedule}
            onTeachersChanged={async () => setTeachers(await getScheduleTeachers())}
            onClose={() => { setEditing(false); load(); }}   // 수정 화면에서 취소 승인·신청 취소를 했을 수 있어 늘 새로
          />
        ) : loaded && !schedule && preview ? (
          <div className="bg-white rounded-[18px] shadow-[0_2px_6px_rgba(0,0,0,0.05),0_10px_24px_rgba(0,0,0,0.05)] px-6 py-10 text-center space-y-3">
            <span className="inline-block bg-[#fef3c7] text-[#b45309] text-[12px] px-3 py-0.5 rounded-full">게시 예정</span>
            <h2 className="text-[19px] md:text-[22px] leading-[1.4] text-[var(--brand)]">{preview.title}</h2>
            <p className="text-[15px] text-[#27272a]">{publishLabel(preview.publishAt)}에 올라와요</p>
            <p className="text-[12px] leading-[2] text-[#888]">이 화면을 열어 두면 게시 시각에 저절로 열려요.<br />먼저 신청한 순서로 정해져요.</p>
          </div>
        ) : loaded && (!schedule || (schedule.hiddenAt && !isAdmin)) ? (
          <p className="text-center text-[14px] text-[#aaa] py-16">스케쥴을 찾을 수 없어요.</p>
        ) : schedule ? (
          <ScheduleBoard
            schedule={schedule}
            teachers={teachers}
            isAdmin={isAdmin}
            myId={teacher ? null : userId}
            nickname={myName}
            busySlot={busySlot}
            conflicts={conflicts}
            onPick={handlePick}
            freeCancelUntil={canFreeCancel ? freeUntil : null}
            onFreeCancel={handleFreeCancel}
            onEdit={() => { setEditing(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            onDelete={handleDelete}
            staffView={isAdmin || !!teacher}
            teacherTools={myTeacherId ? {
              teacherId: myTeacherId, removeSel, adds, working: tWorking,
              onToggleRemove: toggleRemove, onOpenAdd: openAdd,
              onDropAdd: (day, time) => setAdds(a => ({ ...a, [day]: (a[day] ?? []).filter(t => t !== time) })),
              onRemove: doRemove, onSave: doSave,
            } : undefined}
          />
        ) : null}
      </ScheduleGate>

      {addFor && createPortal(
        <div role="dialog" aria-modal="true" aria-label="더할 시간 고르기" className="fixed inset-0 z-[400] flex items-center justify-center bg-black/30 px-6" onClick={() => setAddFor(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-6" onClick={e => e.stopPropagation()}>
            <p className="text-[15px] text-[#333] mb-1">{whenOf(addFor.day, '').trim()} 시간 더하기</p>
            <p className="text-[12px] text-[#888] mb-4">내 빈타임이 비어 있거나 x인 시간이에요. 여러 개 고를 수 있어요.</p>
            <div className="flex flex-wrap gap-1.5 mb-5">
              {addFor.options.map(time => {
                const on = addFor.picked.has(time);
                return (
                  <button key={time} type="button" aria-pressed={on}
                    onClick={() => setAddFor(a => a && { ...a, picked: (() => { const n = new Set(a.picked); if (n.has(time)) n.delete(time); else n.add(time); return n; })() })}
                    className={`text-[13px] px-3 min-h-[34px] rounded-full border-[1.5px] ${on ? 'border-[#16a34a] bg-[#16a34a] text-white' : 'border-[#d4d4d8] text-[#555]'}`}>
                    {on ? '✓ ' : ''}{time.replace(/^0/, '')}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setAddFor(null)} className="flex-1 border border-[#e5e5e5] text-[#555] text-[14px] py-2.5 rounded-full">취소</button>
              <button type="button" disabled={!addFor.picked.size}
                onClick={() => { setAdds(a => ({ ...a, [addFor.day]: [...new Set([...(a[addFor.day] ?? []), ...addFor.picked])].sort() })); setAddFor(null); }}
                className="flex-1 bg-[#16a34a] text-white text-[14px] py-2.5 rounded-full disabled:opacity-40">넣기</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
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
