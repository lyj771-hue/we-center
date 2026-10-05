'use client';

import type { Schedule, Slot, Teacher } from '@/lib/schedule';
import { dowLabel, scheduleDays, scheduleRange, shortDay } from '@/lib/schedule';

// 한 주 스케쥴 카드 — 공지(제목·기간·안내·휴무) + 선생님별 요일별 시간 버튼 + 신청 댓글.
// 보호자: 빈 시간 = 누르면 신청, 내 신청 = "✓ 신청완료"(누르면 취소 신청) → "취소중"(누르면 철회) → 회색 "취소완료",
//         다른 분 신청 = 언제나 "마감".
// 관리자: 신청된 칸 = "시간 + 닉네임 ✕"(누르면 시간 다시 열기), 취소 신청된 칸 = "취소요청"(누르면 승인),
//         취소 승인된 칸 = 회색 "취소완료 ✕"(누르면 시간 다시 열기). 빈 칸은 그냥 보인다.

interface Props {
  schedule: Schedule;
  teachers: Teacher[];
  isAdmin: boolean;
  myId: string | null;
  nickname?: string;
  busySlot: string | null;
  onPick: (slot: Slot, teacher: Teacher) => void;
  /** 관리자: 신청을 지우고 시간을 다시 연다 */
  onCancel: (slot: Slot, teacher: Teacher) => void;
  /** 관리자: 보호자의 취소 신청을 승인 */
  onApproveCancel: (slot: Slot, teacher: Teacher) => void;
  /** 보호자: 내 신청을 취소 신청 / 취소 신청 철회 */
  onRequestCancel: (slot: Slot, teacher: Teacher) => void;
  onWithdrawCancel: (slot: Slot, teacher: Teacher) => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

const TINTS = ['#e8f1fd', '#fdf1e3', '#e8f5ee', '#f3ecfb', '#fdecef', '#eef3f5'];

const fmtTime = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const pill = 'inline-flex items-center gap-1.5 text-[13px] px-3.5 min-h-[36px] rounded-full border-[1.5px] transition-colors';

export default function ScheduleBoard({
  schedule, teachers, isAdmin, myId, nickname, busySlot, onPick, onCancel, onApproveCancel, onRequestCancel, onWithdrawCancel, onEdit, onDelete,
}: Props) {
  const days = scheduleDays(schedule);
  const centerHolidays = schedule.holidays.filter(h => !h.teacherId);
  const holidayOf = new Map(centerHolidays.map(h => [h.date, h.label]));
  // 선생님별 휴무 — "선생님|날짜" → 사유
  const offOf = new Map(schedule.holidays.filter(h => h.teacherId).map(h => [`${h.teacherId}|${h.date}`, h.label]));
  const created = new Date(schedule.createdAt);

  // 시간이나 휴무가 있는 선생님만, 명단 순서대로
  const rows = teachers
    .map((t, i) => ({
      teacher: t,
      tint: TINTS[i % TINTS.length],
      days: days
        .map(day => ({ day, off: offOf.get(`${t.id}|${day}`), slots: schedule.slots.filter(s => s.teacherId === t.id && s.day === day) }))
        .filter(d => d.slots.length > 0 || d.off !== undefined),
    }))
    .filter(r => r.days.length > 0);

  const comments = schedule.bookings;

  return (
    <div className="space-y-4">
      <article className="bg-white rounded-[18px] shadow-[0_2px_6px_rgba(0,0,0,0.05),0_10px_24px_rgba(0,0,0,0.05)] overflow-hidden">
        {/* 공지 */}
        <div className="px-5 md:px-7 pt-6 pb-5 border-b border-dashed border-[#e4e4e7] space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="bg-[var(--brand)] text-white text-[12px] px-3 py-0.5 rounded-full">공지</span>
            <span className="text-[12px] text-[#a1a1aa]">{created.getFullYear()}.{created.getMonth() + 1}.{created.getDate()}</span>
            {isAdmin && (
              <span className="ml-auto flex gap-1.5">
                {onEdit && <button onClick={onEdit} className="text-[12px] border border-[#0a0a0a] px-3 py-1 hover:bg-[#0a0a0a] hover:text-white transition-colors">수정</button>}
                {onDelete && <button onClick={onDelete} className="text-[12px] border border-[#e5e5e5] text-red-400 px-3 py-1 hover:bg-red-50 transition-colors">삭제</button>}
              </span>
            )}
          </div>
          <h2 className="text-[24px] leading-[1.4] text-[var(--brand)]">{schedule.title}</h2>
          <p className="text-[12px] leading-[2] text-[#71717a] whitespace-pre-line">
            {scheduleRange(schedule)}
            {schedule.notice && <>{'\n'}{schedule.notice}</>}
          </p>
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {centerHolidays.map(h => (
              <span key={h.date} className="text-[12px] text-[#b45309] bg-[#fef3c7] px-3 py-0.5 rounded-full">
                {shortDay(h.date)} {h.label || '공휴일'}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5 text-[12px] text-[#166534] bg-[#e8f5ee] px-3 py-0.5 rounded-full">
              <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" />실시간 반영 중
            </span>
            {!isAdmin && nickname && (
              <span className="text-[12px] text-[var(--brand)] bg-[#e8f1fd] px-3 py-0.5 rounded-full">{nickname} 님으로 신청돼요</span>
            )}
          </div>
        </div>

        {/* 선생님별 시간 */}
        <div className="px-5 md:px-7 pb-2">
          {rows.length === 0 && <p className="text-[14px] text-[#bbb] py-10 text-center">올라온 시간이 없어요.</p>}
          {rows.map(({ teacher, tint, days: tDays }) => (
            <section key={teacher.id} className="py-4 border-b border-[#f1f1f3] last:border-b-0 space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-full text-[13px] text-[var(--brand)] flex items-center justify-center" style={{ background: tint }}>
                  {teacher.name.slice(0, 1)}
                </span>
                <h3 className="text-[17px] text-[#27272a]">{teacher.name} 선생님</h3>
              </div>
              {tDays.map(({ day, off, slots }) => (
                <div key={day} className="flex items-start gap-2.5">
                  <div className="w-[80px] shrink-0 pt-2 text-[13px] text-[#71717b] whitespace-nowrap">
                    {dowLabel(day)} <span className="text-[#b4b4bb]">{shortDay(day).split('(')[0]}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 flex-1">
                    {off !== undefined ? (
                      <span className="text-[13px] text-[#b45309] pt-2">휴무{off ? ` · ${off}` : ''}</span>
                    ) : holidayOf.has(day) && !isAdmin ? (
                      <span className="text-[13px] text-[#b45309] pt-2">공휴일</span>
                    ) : slots.map(s => {
                      const busy = busySlot === s.id;
                      if (isAdmin) {
                        if (s.bookedBy && s.cancelState === 'requested') {
                          return (
                            <button key={s.id} type="button" disabled={busy} onClick={() => onApproveCancel(s, teacher)}
                              aria-label={`${teacher.name} 선생님 ${shortDay(day)} ${s.time} ${s.owner ?? ''} 취소 요청 승인`}
                              className={`${pill} pr-2.5 border-[#f59e0b] bg-[#fef3c7] text-[#b45309] hover:bg-[#fde68a]`}>
                              {s.time}
                              <span className="text-[12px] bg-white/60 px-2 rounded-full">{s.owner ?? '신청됨'}</span>
                              취소요청
                            </button>
                          );
                        }
                        if (s.bookedBy && s.cancelState === 'approved') {
                          return (
                            <button key={s.id} type="button" disabled={busy} onClick={() => onCancel(s, teacher)}
                              aria-label={`${teacher.name} 선생님 ${shortDay(day)} ${s.time} 취소완료 — 시간 다시 열기`}
                              className={`${pill} pr-2.5 border-[#e4e4e7] bg-[#f4f4f5] text-[#a1a1aa] hover:bg-[#e4e4e7]`}>
                              {s.time}
                              <span className="text-[12px] bg-white px-2 rounded-full">{s.owner ?? ''}</span>
                              취소완료
                              <span aria-hidden="true" className="text-[11px]">✕</span>
                            </button>
                          );
                        }
                        return s.bookedBy ? (
                          <button key={s.id} type="button" disabled={busy} onClick={() => onCancel(s, teacher)}
                            aria-label={`${teacher.name} 선생님 ${shortDay(day)} ${s.time} ${s.owner ?? ''} 신청 취소`}
                            className={`${pill} pr-2.5 border-[var(--brand)] bg-[var(--brand)] text-white hover:opacity-90`}>
                            {s.time}
                            <span className="text-[12px] bg-white/20 px-2 rounded-full">{s.owner ?? '신청됨'}</span>
                            <span aria-hidden="true" className="text-[11px] opacity-80">✕</span>
                          </button>
                        ) : (
                          <span key={s.id} className={`${pill} border-[#d4d4d8] text-[#71717b]`}>{s.time}</span>
                        );
                      }
                      if (s.bookedBy && s.bookedBy === myId) {
                        if (s.cancelState === 'approved') {
                          return (
                            <span key={s.id} className={`${pill} border-[#e4e4e7] bg-[#f4f4f5] text-[#a1a1aa]`}>
                              <span className="line-through">{s.time}</span> 취소완료
                            </span>
                          );
                        }
                        if (s.cancelState === 'requested') {
                          return (
                            <button key={s.id} type="button" disabled={busy} onClick={() => onWithdrawCancel(s, teacher)}
                              title="누르면 취소 신청을 철회해요"
                              className={`${pill} border-[#f59e0b] bg-[#fef3c7] text-[#b45309] hover:bg-[#fde68a]`}>
                              {s.time} 취소중
                            </button>
                          );
                        }
                        return (
                          <button key={s.id} type="button" disabled={busy} onClick={() => onRequestCancel(s, teacher)}
                            title="누르면 취소를 신청해요"
                            className={`${pill} border-[var(--brand)] bg-[var(--brand)] text-white hover:opacity-90`}>
                            ✓ {s.time} 신청완료
                          </button>
                        );
                      }
                      if (s.bookedBy) {
                        return (
                          <span key={s.id} className={`${pill} border-[#e4e4e7] bg-[#f4f4f5] text-[#a1a1aa]`}>
                            <span className="line-through">{s.time}</span> 마감
                          </span>
                        );
                      }
                      return (
                        <button key={s.id} type="button" disabled={busy || !myId} onClick={() => onPick(s, teacher)}
                          className={`${pill} border-[var(--brand)] bg-white text-[var(--brand)] hover:bg-[#e8f1fd] disabled:opacity-50`}>
                          {busy ? '신청 중…' : s.time}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>
      </article>

      {/* 신청 댓글 — 오래된 것부터, 수정 불가 */}
      <section className="bg-white rounded-[18px] shadow-[0_2px_6px_rgba(0,0,0,0.05)] px-5 md:px-7 py-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[16px] text-[#27272a]">댓글 <span className="text-[var(--brand)]">{comments.length}</span></h3>
          <span className="text-[12px] text-[#a1a1aa]">댓글은 수정할 수 없어요</span>
        </div>
        {comments.length === 0 && <p className="text-[13px] text-[#bbb] py-3">아직 신청이 없어요.</p>}
        {comments.map(c => (
          <div key={c.id} className={`flex gap-2.5 p-2.5 rounded-xl ${c.userId && c.userId === myId ? 'bg-[#f0f6fe]' : 'bg-[#fafafa]'}`}>
            <span className="w-8 h-8 shrink-0 rounded-full bg-[var(--brand)] text-white text-[13px] flex items-center justify-center">
              {c.nickname.slice(0, 1)}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[14px] text-[var(--brand)]">{c.nickname}</span>
                <span className="text-[11px] text-[#a1a1aa]">{fmtTime(c.createdAt)}</span>
                {c.cancelledAt && <span className="text-[11px] text-white bg-[#a1a1aa] px-2 rounded-full">취소</span>}
                {c.kind === 'cancel_request' && <span className="text-[11px] text-[#b45309] bg-[#fef3c7] px-2 rounded-full">취소 신청</span>}
                {c.kind === 'cancel_withdraw' && <span className="text-[11px] text-[#166534] bg-[#e8f5ee] px-2 rounded-full">철회</span>}
                {c.kind === 'cancel_approved' && <span className="text-[11px] text-white bg-[#71717a] px-2 rounded-full">취소 승인</span>}
              </div>
              <p className={`text-[14px] text-[#3f3f46] ${c.cancelledAt ? 'line-through text-[#a1a1aa]' : ''}`}>{c.label}</p>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
