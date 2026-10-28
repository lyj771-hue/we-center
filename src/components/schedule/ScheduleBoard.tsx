'use client';

import type { Schedule, Slot, Teacher } from '@/lib/schedule';
import { dowLabel, FREE_CANCEL_MIN, isPublished, publishLabel, scheduleDays, scheduleRange, shortDay } from '@/lib/schedule';

// 한 주 스케쥴 카드 — 공지(제목·기간·안내·휴무) + 선생님별 요일별 시간 버튼.
// (신청·취소 기록은 DB bookings 표에 계속 남지만 화면에는 보이지 않는다)
// 보호자: 빈 시간 = 누르면 신청, 내 신청 = "✓ 신청완료"(게시 후 10분 취소 가능 글은 그 10분 동안만 눌러서 바로 취소, 그 밖엔 못 누름),
//         예전에 취소 승인된 신청 = 회색 "취소완료", 다른 분 신청 = 언제나 "마감".
// 선생님: 관리자처럼 신청자를 보고, 내 줄에서 시간 내리기(골라서 [내리기])·더하기(+ → [저장]).
// 관리자: 신청된 칸 = "시간 + 닉네임", 예전에 취소 승인된 칸 = 회색 "취소완료" — 보기만.
//         신청 취소(시간 다시 열기)는 [수정](ScheduleEditor)에서 한다. 빈 칸은 그냥 보인다.

interface Props {
  schedule: Schedule;
  teachers: Teacher[];
  isAdmin: boolean;
  myId: string | null;
  nickname?: string;
  busySlot: string | null;
  /** 보호자: 우리 아이 수업과 시간이 겹쳐 신청할 수 없는 칸 */
  conflicts?: Set<string>;
  onPick: (slot: Slot, teacher: Teacher) => void;
  /** 보호자: 게시 후 10분 자유 취소가 끝나는 시각(ms) — 지금 취소할 수 있을 때만, 아니면 null */
  freeCancelUntil?: number | null;
  /** 보호자: 내 신청 바로 취소(10분 안) */
  onFreeCancel: (slot: Slot, teacher: Teacher) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  /** 관리자·선생님 — 칸마다 누가 신청했는지 보인다 */
  staffView?: boolean;
  /** 선생님 — 내 시간 내리기·더하기 */
  teacherTools?: TeacherTools;
}

export interface TeacherTools {
  teacherId: string;
  /** 내릴 내 시간(칸 id) */
  removeSel: Set<string>;
  /** 더할 시간 — 날짜 → 시간들 (저장 전) */
  adds: Record<string, string[]>;
  working: boolean;
  onToggleRemove: (slot: Slot) => void;
  onOpenAdd: (day: string) => void;
  onDropAdd: (day: string, time: string) => void;
  onRemove: () => void;
  onSave: () => void;
}

const TINTS = ['#e8f1fd', '#fdf1e3', '#e8f5ee', '#f3ecfb', '#fdecef', '#eef3f5'];

const pill = 'inline-flex items-center gap-1.5 text-[11px] md:text-[12px] px-3 min-h-[32px] rounded-full border-[1.5px] transition-colors';

export default function ScheduleBoard({
  schedule, teachers, isAdmin, myId, nickname, busySlot, conflicts, onPick, freeCancelUntil, onFreeCancel, onEdit, onDelete,
  staffView = isAdmin, teacherTools: tt,
}: Props) {
  const days = scheduleDays(schedule);
  const centerHolidays = schedule.holidays.filter(h => !h.teacherId);
  const holidayOf = new Map(centerHolidays.map(h => [h.date, h.label]));
  // 선생님별 휴무 — "선생님|날짜" → 사유
  const offOf = new Map(schedule.holidays.filter(h => h.teacherId).map(h => [`${h.teacherId}|${h.date}`, h.label]));
  const created = new Date(schedule.publishAt ?? schedule.createdAt);
  const live = isPublished(schedule);
  const untilText = freeCancelUntil ? (() => { const d = new Date(freeCancelUntil); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; })() : '';

  // 시간이나 휴무가 있는 선생님만, 명단 순서대로
  const rows = teachers
    .map((t, i) => ({
      teacher: t,
      tint: TINTS[i % TINTS.length],
      days: days
        .map(day => ({ day, off: offOf.get(`${t.id}|${day}`), slots: schedule.slots.filter(s => s.teacherId === t.id && s.day === day) }))
        // 선생님 내 줄 — 공휴일이 아니면 게시글의 모든 날(시간을 더할 수 있게)
        .filter(d => d.slots.length > 0 || d.off !== undefined || (tt?.teacherId === t.id && !holidayOf.has(d.day))),
    }))
    .filter(r => r.days.length > 0);


  return (
    <div className="space-y-4">
      <article className="bg-white rounded-[18px] shadow-[0_2px_6px_rgba(0,0,0,0.05),0_10px_24px_rgba(0,0,0,0.05)] overflow-hidden">
        {/* 공지 */}
        <div className="px-5 md:px-7 pt-6 pb-6 border-b border-dashed border-[#e4e4e7] space-y-4">
          <div className="flex items-center gap-2">
            <span className="bg-[var(--brand)] text-white text-[12px] px-3 py-0.5 rounded-full">공지</span>
            <span className="text-[12px] text-[#a1a1aa]">{created.getFullYear()}.{created.getMonth() + 1}.{created.getDate()}</span>
            {isAdmin && (
              <span className="ml-auto flex gap-1.5">
                {onEdit && <button onClick={onEdit} className="text-[12px] border border-[#0a0a0a] px-3 py-1 hover:bg-[#0a0a0a] hover:text-white transition-colors">수정</button>}
                {onDelete && <button onClick={onDelete} className="text-[12px] border border-[#e5e5e5] text-red-400 px-3 py-1 hover:bg-red-50 transition-colors">내리기</button>}
              </span>
            )}
          </div>
          <h2 className="text-[19px] md:text-[24px] leading-[1.4] text-[var(--brand)]">{schedule.title}</h2>
          <p className="text-[12px] leading-[2] text-[#71717a] whitespace-pre-line">
            {scheduleRange(schedule)}
            {schedule.notice && <>{'\n'}{schedule.notice}</>}
          </p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {centerHolidays.map(h => (
              <span key={h.date} className="text-[12px] text-[#b45309] bg-[#fef3c7] px-3 py-0.5 rounded-full">
                {shortDay(h.date)} {h.label || '공휴일'}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5 text-[12px] text-[#166534] bg-[#e8f5ee] px-3 py-0.5 rounded-full">
              <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" />실시간 반영 중
            </span>
            {/* 관리자·선생님 — 예약 게시 · 10분 취소 */}
            {staffView && schedule.publishAt && !live && (
              <span className="text-[12px] text-[#b45309] bg-[#fef3c7] px-3 py-0.5 rounded-full">{publishLabel(schedule.publishAt)} 게시 예정 · 보호자에게 아직 안 보여요</span>
            )}
            {staffView && schedule.freeCancel && (
              <span className="text-[12px] text-[#555] bg-[#f4f4f5] px-3 py-0.5 rounded-full">게시 후 {FREE_CANCEL_MIN}분 취소 가능</span>
            )}
            {!staffView && freeCancelUntil && (
              <span className="text-[12px] text-[#b45309] bg-[#fef3c7] px-3 py-0.5 rounded-full">{untilText}까지는 신청완료를 눌러 바로 취소할 수 있어요</span>
            )}
            {!staffView && nickname && (
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
                <span className="w-6 h-6 rounded-full text-[12px] text-[var(--brand)] flex items-center justify-center" style={{ background: tint }}>
                  {teacher.name.slice(0, 1)}
                </span>
                <h3 className="text-[14px] md:text-[16px] text-[#27272a]">{teacher.name} 선생님</h3>
                {/* 선생님 내 줄 — 고른 게 있을 때만 [내리기], 더할 시간이 있을 때만 [저장] */}
                {tt?.teacherId === teacher.id && (tt.removeSel.size > 0 || Object.values(tt.adds).some(v => v.length)) && (
                  <span className="ml-auto flex gap-1.5">
                    {tt.removeSel.size > 0 && (
                      <button type="button" onClick={tt.onRemove} disabled={tt.working}
                        className="text-[12px] px-3 h-8 rounded-full bg-[#e11d48] text-white disabled:opacity-40">내리기 {tt.removeSel.size}</button>
                    )}
                    {Object.values(tt.adds).some(v => v.length) && (
                      <button type="button" onClick={tt.onSave} disabled={tt.working}
                        className="text-[12px] px-3 h-8 rounded-full bg-[#16a34a] text-white disabled:opacity-40">저장 {Object.values(tt.adds).reduce((n, v) => n + v.length, 0)}</button>
                    )}
                  </span>
                )}
              </div>
              {tDays.map(({ day, off, slots }) => (
                <div key={day} className="flex items-start gap-2.5">
                  <div className="w-[68px] md:w-[76px] shrink-0 pt-2 text-[11px] md:text-[12px] text-[#71717b] whitespace-nowrap">
                    {dowLabel(day)} <span className="text-[#b4b4bb]">{shortDay(day).split('(')[0]}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 flex-1">
                    {off !== undefined ? (
                      <span className="text-[11px] md:text-[12px] text-[#b45309] pt-2">휴무{off ? ` · ${off}` : ''}</span>
                    ) : holidayOf.has(day) && !staffView ? (
                      <span className="text-[11px] md:text-[12px] text-[#b45309] pt-2">공휴일</span>
                    ) : <>{slots.map(s => {
                      const busy = busySlot === s.id;
                      // 선생님 내 시간 — 신청 안 된 시간은 눌러서 내릴 시간으로 고르기, 신청된 시간은 누가 했는지 보이고 못 고른다
                      if (tt?.teacherId === teacher.id && !s.bookedBy) {
                        const on = tt.removeSel.has(s.id);
                        return (
                          <button key={s.id} type="button" aria-pressed={on} onClick={() => tt.onToggleRemove(s)} disabled={tt.working}
                            title={on ? '누르면 내릴 시간에서 빼요' : '누르면 내릴 시간으로 골라요'}
                            className={`${pill} ${on ? 'border-[#e11d48] bg-[#e11d48] text-white' : 'border-[#d4d4d8] text-[#71717b] hover:border-[#e11d48] hover:text-[#e11d48]'}`}>
                            {on ? `✓ ${s.time} 내리기` : s.time}
                          </button>
                        );
                      }
                      if (staffView) {
                        // 관리자 — 보기만. 취소 승인·신청 취소(시간 다시 열기)는 [수정]에서
                        const hint = '신청 취소는 [수정]에서 해요';
                        if (s.bookedBy && s.cancelState === 'approved') {
                          return (
                            <span key={s.id} title={hint} className={`${pill} pr-2.5 border-[#e4e4e7] bg-[#f4f4f5] text-[#a1a1aa]`}>
                              {s.time}
                              <OwnerTag slot={s} className="bg-white" />
                              취소완료
                            </span>
                          );
                        }
                        return s.bookedBy ? (
                          <span key={s.id} title={hint} className={`${pill} pr-2.5 border-[var(--brand)] bg-[var(--brand)] text-white`}>
                            {s.time}
                            <OwnerTag slot={s} className="bg-white/20" />
                          </span>
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
                        // 게시 후 10분 안 — 눌러서 바로 취소. 그 밖엔 누를 수 없다(취소는 센터로)
                        return freeCancelUntil ? (
                          <button key={s.id} type="button" disabled={busy} onClick={() => onFreeCancel(s, teacher)}
                            title={`${untilText}까지 누르면 바로 취소해요`}
                            className={`${pill} border-[#0a0a0a] bg-[#0a0a0a] text-white hover:opacity-90`}>
                            ✓ {s.time} 신청완료 <span className="text-[10px] opacity-70">취소</span>
                          </button>
                        ) : (
                          <span key={s.id} title="취소·변경은 센터로 연락해 주세요" className={`${pill} border-[#0a0a0a] bg-[#0a0a0a] text-white`}>
                            ✓ {s.time} 신청완료
                          </span>
                        );
                      }
                      if (s.bookedBy) {
                        return (
                          <span key={s.id} className={`${pill} border-[#e4e4e7] bg-[#f4f4f5] text-[#a1a1aa]`}>
                            <span className="line-through">{s.time}</span> 마감
                          </span>
                        );
                      }
                      if (conflicts?.has(s.id)) {
                        return (
                          <span key={s.id} title="이 시간엔 이미 우리 아이 수업이 있어요" className={`${pill} border-[#e4e4e7] bg-[#fafafa] text-[#a1a1aa]`}>
                            {s.time} 수업 있음
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
                    {/* 선생님 내 줄 — 저장 전 더할 시간(눌러서 빼기) + 그날 시간 더하기(내릴 시간을 고르는 중엔 못 누름) */}
                    {tt?.teacherId === teacher.id && <>
                      {(tt.adds[day] ?? []).map(time => (
                        <button key={`add-${time}`} type="button" onClick={() => tt.onDropAdd(day, time)} title="누르면 빼요"
                          className={`${pill} border-dashed border-[#16a34a] bg-[#f0fdf4] text-[#15803d]`}>
                          + {time.replace(/^0/, '')} <span aria-hidden="true">×</span>
                        </button>
                      ))}
                      <button type="button" onClick={() => tt.onOpenAdd(day)} disabled={tt.working || tt.removeSel.size > 0}
                        aria-label={`${shortDay(day)} 시간 더하기`} title={tt.removeSel.size > 0 ? '내릴 시간을 고르는 중엔 더할 수 없어요' : '그날 빈칸·x 시간 더하기'}
                        className={`${pill} justify-center w-8 px-0 border-[#16a34a] text-[#16a34a] hover:bg-[#f0fdf4] disabled:opacity-30 disabled:hover:bg-transparent`}>+</button>
                    </>}
                    </>}
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>
      </article>

    </div>
  );
}

/** 관리자 화면의 신청자 표시 — 보호자 닉네임, 관리자 닉네임이 다르면 그 아래 작게 */
function OwnerTag({ slot, className }: { slot: Slot; className: string }) {
  return (
    <span className={`inline-flex flex-col items-center leading-[1.25] px-2 py-0.5 rounded-xl ${className}`}>
      <span className="text-[11px] md:text-[12px]">{slot.owner ?? '신청됨'}</span>
      {slot.ownerCenter && <span className="text-[9px] opacity-75">{slot.ownerCenter}</span>}
    </span>
  );
}
