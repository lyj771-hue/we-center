'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAdmin } from '@/components/AdminContext';
import { useMember } from '@/components/MemberContext';
import type { Teacher } from '@/lib/schedule';
import { addDays, getHolidayNames, getTeachers, parseYmd, toYmd } from '@/lib/schedule';
import type { Center } from '@/lib/timetable';
import { ROW_LABEL, SUNDAY_TEACHERS, rowsForDay, worksAt } from '@/lib/timetable';
import type { TeacherLesson } from '@/lib/teacher';
import { getTeacherLessons } from '@/lib/teacher';

// 시간표 보기(선생님) — 카카오로 로그인해서 선생님 인증된 계정만. 고치기는 못 하고 보기만.
// 날짜마다 센터 선생님 × 시간, 선생님마다 고정 · 빈타임 두 칸. 공휴일엔 고정 수업을 빼고 보여 준다.

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

export default function TeacherTimetable({ center }: { center: Center }) {
  const { isAdmin } = useAdmin();
  const { userId, teacher, loading, login } = useMember();
  const [day, setDay] = useState(() => toYmd(new Date()));
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [lessons, setLessons] = useState<TeacherLesson[]>([]);
  const [holidays, setHolidays] = useState<Record<string, string>>({});
  const [onlyMine, setOnlyMine] = useState(true);
  const [failed, setFailed] = useState('');
  const can = isAdmin || !!teacher;

  const load = useCallback(async () => {
    try {
      const [t, l, h] = await Promise.all([getTeachers(), getTeacherLessons(day, day), getHolidayNames(day.slice(0, 4)).catch(() => ({}))]);
      setTeachers(t); setLessons(l); setHolidays(h); setFailed('');
    } catch (e) {
      setFailed((e as Error).message);
    }
  }, [day]);
  useEffect(() => { if (can) load(); }, [can, load]);

  const label = center === 'uijeongbu' ? '의정부' : '수색';
  if (!can) {
    return (
      <div className="max-w-md mx-auto px-5 py-24 text-center space-y-4 fade-up">
        <h1 className="display-heading">시간표({label})</h1>
        {loading ? <p className="text-[14px] text-[#aaa]">불러오는 중…</p> : userId ? (
          <p className="text-[14px] leading-[2] text-[#666]">선생님 인증을 한 계정만 볼 수 있어요.<br />센터에 등록된 이름·휴대전화 번호로 인증해 주세요.</p>
        ) : (<>
          <p className="text-[14px] leading-[2] text-[#666]">선생님은 카카오로 로그인한 뒤<br />[선생님]을 골라 인증하면 볼 수 있어요.</p>
          <button onClick={login} className="bg-[#e11d48] text-white text-[14px] px-6 py-2.5 rounded-full hover:opacity-90">카카오 로그인</button>
        </>)}
      </div>
    );
  }

  const d = parseYmd(day);
  const wd = d.getDay();
  const holiday = holidays[day];
  // 이 센터 그날 수업 — 공휴일엔 고정 수업 빼기
  const here = lessons.filter(l => l.center === center && l.day === day && !(holiday && l.source === 'fixed'));
  const cellOf = (teacherId: string, time: string, side: 'fixed' | 'open') => here.find(l => l.teacherId === teacherId && l.time === time && l.side === side);
  const hasLessons = (id: string) => here.some(l => l.teacherId === id && l.status === 'child');
  // 그날 이 센터에 나오는 선생님 — 출근 요일(일요일은 일요일 선생님) 또는 그날 수업이 있는 선생님
  let shown = teachers.filter(t => hasLessons(t.id) || (wd === 0 ? SUNDAY_TEACHERS[center].includes(t.name) && t.centers.includes(center) : worksAt(t, center, wd)));
  const mineHere = !!teacher && shown.some(t => t.id === teacher.teacherId);
  if (onlyMine && mineHere) shown = shown.filter(t => t.id === teacher!.teacherId);
  const rows = rowsForDay(day, here.map(l => `${l.teacherId}|${l.time}`), center);

  const text = (l?: TeacherLesson) => {
    if (!l) return null;
    if (l.status === 'undecided') return <span className="text-[#71717a]">?</span>;
    if (l.status === 'off') return <span className="text-[#a1a1aa]">수업 안 함</span>;
    if (l.status === 'cancelled') return <span className="text-[#c4c4cc] line-through">{l.name}</span>;
    if (l.status !== 'child' && l.status !== 'cancel_requested') return null;
    return (
      <span title={l.note} className={`${l.moved ? 'line-through text-[#a1a1aa]' : l.absent ? 'text-[#a1a1aa]' : 'text-[#27272a]'}`}>
        {l.name}{l.number ?? ''}
        {l.absent && <span className="ml-0.5 text-[9px]">결석</span>}
        {l.source === 'booking' && <span className="ml-0.5 text-[9px] text-[#a1a1aa]">신청</span>}
        {l.note && <span className="block text-[9px] leading-[1.2] text-[#a1a1aa] whitespace-normal">{l.note}</span>}
      </span>
    );
  };
  const th = 'border border-[#d4d4d8] px-1 py-1.5 font-normal whitespace-nowrap';
  const td = 'border border-[#e4e4e7] h-9 px-1 text-center align-middle text-[12px] whitespace-nowrap';
  const nav = 'text-[13px] border border-[#e5e5e5] w-8 h-8 hover:bg-[#f8f8f8]';

  return (
    <div className="px-3 md:px-6 pt-6 pb-14 fade-up">
      <h1 className="display-heading mb-4">시간표 <span className="text-[0.7em] text-[#888]">({label})</span></h1>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button onClick={() => setDay(x => addDays(x, -1))} className={nav} aria-label="전날">‹</button>
        <input type="date" value={day} onChange={e => e.target.value && setDay(e.target.value)} className="text-[13px] border border-[#ddd] px-2 h-8" />
        <button onClick={() => setDay(x => addDays(x, 1))} className={nav} aria-label="다음 날">›</button>
        {day !== toYmd(new Date()) && <button onClick={() => setDay(toYmd(new Date()))} className="text-[12px] text-[#888] underline underline-offset-2">오늘</button>}
        {mineHere && (
          <label className="ml-auto flex items-center gap-1 text-[12px] text-[#555]">
            <input type="checkbox" checked={onlyMine} onChange={e => setOnlyMine(e.target.checked)} />내 수업만
          </label>
        )}
      </div>
      {failed && <p className="text-[13px] text-red-400 mb-3">불러오지 못했어요. ({failed})</p>}
      <div className="overflow-x-auto bg-white">
        <table className="border-collapse text-[11px] min-w-full">
          <thead>
            <tr>
              <th className={`${th} sticky left-0 z-10 bg-white w-12`}>시간</th>
              <th className={`${th} text-[13px] ${holiday ? 'text-red-500' : 'text-[#c026d3]'}`} colSpan={Math.max(1, shown.length * 2)}>
                {DOW[wd]} / {d.getMonth() + 1}월 {d.getDate()}일{holiday && <span className="ml-2 text-[12px]">{holiday} — 고정 수업 없음</span>}
              </th>
            </tr>
            <tr>
              <th className={`${th} sticky left-0 z-10 bg-white`} />
              {shown.map(t => (
                <th key={t.id} colSpan={2} className={`${th} text-[13px] ${t.id === teacher?.teacherId ? 'text-[var(--brand)] bg-[#eef5fe]' : 'text-[#16a34a]'}`}>{t.name}</th>
              ))}
            </tr>
            <tr>
              <th className={`${th} sticky left-0 z-10 bg-white`} />
              {shown.map(t => (
                <FragmentCols key={t.id}>
                  <th className={`${th} text-[10px] text-[#999] min-w-[64px]`}>고정</th>
                  <th className={`${th} text-[10px] text-[#999] min-w-[64px]`}>빈타임</th>
                </FragmentCols>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(time => (
              <tr key={time}>
                <td className={`border border-[#d4d4d8] px-1 text-center sticky left-0 z-10 bg-white ${ROW_LABEL[time] ? 'text-[#c026d3]' : ''}`}>{time.replace(/^0/, '')}</td>
                {shown.map(t => {
                  const f = cellOf(t.id, time, 'fixed'), o = cellOf(t.id, time, 'open');
                  const openKid = o && (o.status === 'child' || o.status === 'cancel_requested');
                  return (
                    <FragmentCols key={t.id}>
                      {/* 빈타임에 아이가 있으면 그 시간은 빈타임 아이 수업 — 고정 칸은 흐리게 */}
                      <td className={`${td} ${openKid ? 'bg-[#f4f4f5] opacity-60' : ''}`}>{text(f) ?? (ROW_LABEL[time] && <span className="text-[#c4c4cc]">{ROW_LABEL[time]}</span>)}</td>
                      <td className={`${td} bg-[#fcfcfd]`}>{text(o)}</td>
                    </FragmentCols>
                  );
                })}
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={3} className="py-10 text-center text-[13px] text-[#bbb]">이 날은 수업이 없어요.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-[#999] mt-3 leading-[2]">보기만 할 수 있어요. 바꿀 일이 있으면 센터에 말씀해 주세요. · 줄 = 다른 선생님에게 옮김 · ? = 미정 · &quot;신청&quot; = 보호자가 수업스케쥴에서 신청</p>
    </div>
  );
}

function FragmentCols({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
