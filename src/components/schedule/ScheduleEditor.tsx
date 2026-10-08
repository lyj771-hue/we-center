'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Holiday, Schedule, ScheduleDraft, Teacher, Template, TemplateData } from '@/lib/schedule';
import { worksAt } from '@/lib/timetable';
import {
  addDays, addTeacher, deleteTeacher, deleteTemplate, dowLabel, getBusyTimes, getTemplates, parseDateList, parseYmd,
  saveSchedule, saveTemplate, scheduleRange, shortDay, slashDay, thisMonday, updateTeacher, weekDays,
} from '@/lib/schedule';

// 관리자: 스케쥴 올리기·고치기.
// 스케줄 선택(이번 주 / 다음 주 / 공휴일) → (형식 불러오기) → 선생님별·날짜별 시간 넣기 → 올리기.
// 이번 주·다음 주는 월~토이고 휴무일을 표시할 수 있다. 공휴일은 날짜를 직접 적는다("2026/10/9, 2026/12/25").
// 지금 상태를 형식으로 저장할 수 있다(요일 기준). 고칠 땐 이미 신청된 시간은 잠겨서 뺄 수 없다(먼저 신청 취소).

const DEFAULT_NOTICE = '원하시는 시간을 누르면 바로 신청돼요. 선착순이에요!\n취소가 필요하면 신청완료 버튼을 눌러 취소 신청해 주세요.';

type Mode = 'this' | 'next' | 'holiday';

/** "ALL"로 한 번에 넣는 센터 기본 수업 시간 (월~금 = 평일, 토요일·공휴일 = 휴일) */
const WEEKDAY_TIMES = ['09:00', '09:50', '10:40', '11:30', '12:20', '13:10', '14:00', '14:50', '15:40', '16:30', '17:40', '18:30', '19:20'];
const HOLIDAY_TIMES = ['09:00', '09:50', '10:40', '11:30', '12:20', '13:10', '13:30', '14:20', '15:10', '16:00', '16:50', '17:40', '18:30', '19:20'];

/** 선생님 id → 날짜(YYYY-MM-DD) → 시간들 */
type Times = Record<string, Record<string, string[]>>;

const sortTimes = (a: string[]) => [...new Set(a)].sort();

/** 직접 입력한 시간 "9:5", "910", "20:10" → "09:05"·"09:10"·"20:10" (24시간). 알아볼 수 없으면 null */
function normalizeTime(raw: string): string | null {
  const t = raw.trim();
  const m = t.match(/^(\d{1,2}):(\d{1,2})$/) ?? t.match(/^(\d{1,2})(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

interface Props {
  teachers: Teacher[];
  existing?: Schedule;
  onTeachersChanged: () => Promise<void> | void;
  /** 저장했으면 그 스케쥴 id, 그냥 닫으면 undefined */
  onClose: (savedId?: string) => void;
}

export default function ScheduleEditor({ teachers, existing, onTeachersChanged, onClose }: Props) {
  const monday = thisMonday();
  const nextMonday = addDays(monday, 7);
  const [mode, setMode] = useState<Mode>(() =>
    existing?.days?.length ? 'holiday' : existing?.weekStart === monday ? 'this' : existing && existing.weekStart !== nextMonday ? 'this' : 'next');
  // 이번 주·다음 주가 아닌 지난 주를 고칠 때를 위해 주 시작일은 따로 들고 있는다
  const [weekStart, setWeekStart] = useState(existing && !existing.days?.length ? existing.weekStart : nextMonday);
  const [holidayText, setHolidayText] = useState(existing?.days?.map(slashDay).join(', ') ?? '');
  const [holidayDates, setHolidayDates] = useState<string[]>(existing?.days ?? []);
  const [holidayError, setHolidayError] = useState('');
  const [title, setTitle] = useState(existing?.title ?? '');
  const [titleTouched, setTitleTouched] = useState(!!existing);
  const [notice, setNotice] = useState(existing?.notice ?? DEFAULT_NOTICE);
  const [closed, setClosed] = useState<Record<string, Holiday>>(() =>
    Object.fromEntries((existing?.holidays ?? []).filter(h => !h.teacherId).map(h => [h.date, h])));
  // 선생님별 휴무 — "선생님|날짜" → 적어 둔 글(사유)
  const [teacherOff, setTeacherOff] = useState<Record<string, string>>(() =>
    Object.fromEntries((existing?.holidays ?? []).filter(h => h.teacherId).map(h => [`${h.teacherId}|${h.date}`, h.label])));
  const [times, setTimes] = useState<Times>(() => {
    const t: Times = {};
    for (const s of existing?.slots ?? []) {
      t[s.teacherId] ??= {};
      t[s.teacherId][s.day] = sortTimes([...(t[s.teacherId][s.day] ?? []), s.time]);
    }
    return t;
  });
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState('');
  // 드롭박스의 "직접 입력"을 고른 칸 — 시간 입력 칸을 보여 준다
  const [custom, setCustom] = useState<Record<string, string | undefined>>({});
  const [saving, setSaving] = useState(false);
  const [showTeachers, setShowTeachers] = useState(false);

  useEffect(() => { getTemplates().then(setTemplates).catch(() => {}); }, []);

  const days = mode === 'holiday' ? holidayDates : weekDays(weekStart);
  // 수업스케쥴은 은평 — 그 요일에 은평에 출근하지 않는 선생님(예: 설영수 월·토 의정부)은 기본으로 빼 둔다.
  // 공휴일 스케쥴에선 빼지 않는다. "이 날 추가"로 언제든 넣을 수 있고, 이미 시간이 올라가 있는 날은 넣은 것으로 본다.
  const [addedAway, setAddedAway] = useState<Set<string>>(() => new Set((existing?.slots ?? []).map(sl => `${sl.teacherId}|${sl.day}`)));
  const away = (t: Teacher, d: string) =>
    mode !== 'holiday' && !worksAt(t, 'eunpyeong', parseYmd(d).getDay()) && !addedAway.has(`${t.id}|${d}`);

  // 선생님 줄 — 이번 주·다음 주는 은평 선생님, 공휴일은 두 센터 선생님 모두(✕로 이 스케쥴에서 뺄 수 있다)
  const [removed, setRemoved] = useState<Set<string>>(() => {
    if (!existing?.days?.length) return new Set();
    const has = new Set(existing.slots.map(sl => sl.teacherId));
    return new Set(teachers.filter(t => !has.has(t.id)).map(t => t.id));
  });
  const active = mode === 'holiday'
    ? teachers.filter(t => !removed.has(t.id))
    : teachers.filter(t => t.centers.includes('eunpyeong'));
  const removedList = mode === 'holiday' ? teachers.filter(t => removed.has(t.id)) : [];
  const removeTeacher = (t: Teacher) => {
    if ([...locked.keys()].some(k => k.startsWith(`${t.id}|`))) { alert('신청된 시간이 있는 선생님은 뺄 수 없어요. 먼저 신청을 취소해 주세요.'); return; }
    setRemoved(r => new Set(r).add(t.id));
  };

  // 신청된 시간 (잠금) — "선생님|날짜|시간" → 닉네임
  const locked = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of existing?.slots ?? []) if (s.bookedBy) m.set(`${s.teacherId}|${s.day}|${s.time}`, s.owner ?? '신청됨');
    return m;
  }, [existing]);
  const lockedDays = useMemo(() => new Set([...locked.keys()].map(k => k.split('|')[1])), [locked]);

  const autoTitle = mode === 'holiday' ? '공휴일 빈 수업 안내' : weekStart === monday ? '이번 주 빈 수업 안내' : weekStart === nextMonday ? '다음 주 빈 수업 안내' : '빈 수업 안내';
  const shownTitle = titleTouched ? title : autoTitle;

  // 주를 바꾸면 넣어 둔 시간을 같은 요일로 옮긴다
  const shiftWeek = (to: string) => {
    const diff = Math.round((parseYmd(to).getTime() - parseYmd(weekStart).getTime()) / 86400000);
    if (!diff) return;
    if (lockedDays.size) { alert('신청된 시간이 있어서 주를 바꿀 수 없어요.'); return; }
    setTimes(p => Object.fromEntries(Object.entries(p).map(([tid, byDay]) =>
      [tid, Object.fromEntries(Object.entries(byDay).map(([d, a]) => [addDays(d, diff), a]))])));
    setClosed(c => Object.fromEntries(Object.values(c).map(h => [addDays(h.date, diff), { ...h, date: addDays(h.date, diff) }])));
    setWeekStart(to);
  };

  const pickMode = (m: Mode) => {
    if (m === mode) return;
    if (lockedDays.size) { alert('신청된 시간이 있어서 바꿀 수 없어요.'); return; }
    if (m === 'this') shiftWeek(monday);
    if (m === 'next') shiftWeek(nextMonday);
    setMode(m);
  };

  // 공휴일 날짜 글 → 날짜들. 다 적고 나가면(Enter·칸 밖) "2026/10/09(금)" 꼴로 다시 써 준다
  const applyHolidayText = () => {
    const { dates, bad } = parseDateList(holidayText);
    const keep = [...lockedDays].filter(d => !dates.includes(d));
    const all = [...dates, ...keep].sort();
    setHolidayDates(all);
    setHolidayText(all.map(slashDay).join(', ') + (bad.length ? `, ${bad.join(', ')}` : ''));
    setHolidayError(
      (bad.length ? `날짜를 알아볼 수 없어요: ${bad.join(', ')} (예: 2026/10/9)` : '') +
      (keep.length ? `${bad.length ? ' · ' : ''}신청된 날짜는 뺄 수 없어요: ${keep.map(slashDay).join(', ')}` : ''),
    );
  };

  const addTime = (tid: string, day: string, raw: string) => {
    const time = raw.slice(0, 5);
    if (!/^\d{2}:\d{2}$/.test(time)) return;
    setTimes(p => ({ ...p, [tid]: { ...p[tid], [day]: sortTimes([...(p[tid]?.[day] ?? []), time]) } }));
  };
  // 그날 시간을 통째로 바꾼다(신청된 시간은 남긴다) — ALL · 비우기(휴지통)
  const setDayTimes = (tid: string, day: string, list: string[]) =>
    setTimes(p => ({
      ...p,
      [tid]: { ...p[tid], [day]: sortTimes([...(p[tid]?.[day] ?? []).filter(x => locked.has(`${tid}|${day}|${x}`)), ...list]) },
    }));
  const removeTime = (tid: string, day: string, time: string) =>
    setTimes(p => ({ ...p, [tid]: { ...p[tid], [day]: (p[tid]?.[day] ?? []).filter(x => x !== time) } }));
  // 캘린더 빈 시간 — 선생님 구글 캘린더에서 일정이 없는 기본 시간(50분 수업)만 골라 날마다 채운다. 이미 지난 시간은 뺀다.
  // 새 스케쥴을 만들 땐 캘린더가 연결된 선생님을 자동으로 채우고(ask=false), 버튼으로 다시 불러올 수도 있다.
  const [busyLoading, setBusyLoading] = useState<string | null>(null);
  const fillFromCalendar = async (t: Teacher, ask = true) => {
    const open = days.filter(d => !closed[d] && teacherOff[`${t.id}|${d}`] === undefined && !away(t, d));
    if (!open.length) return;
    if (ask && !confirm(`${t.name} 선생님 캘린더에서 빈 시간을 불러올까요?\n(지금 넣어 둔 시간은 바뀌어요. 신청된 시간은 남아요)`)) return;
    setBusyLoading(t.id);
    try {
      const busy = (await getBusyTimes(t.id, open[0], open[open.length - 1])).map(b => [new Date(b.start).getTime(), new Date(b.end).getTime()]);
      setTimes(p => {
        const next = { ...p, [t.id]: { ...p[t.id] } };
        for (const d of open) {
          const preset = mode !== 'holiday' && parseYmd(d).getDay() !== 6 ? WEEKDAY_TIMES : HOLIDAY_TIMES;
          const now = Date.now();
          const free = preset.filter(time => {
            const s0 = new Date(`${d}T${time}:00+09:00`).getTime();
            const e0 = s0 + 50 * 60000;
            return s0 > now && !busy.some(([bs, be]) => bs < e0 && be > s0);
          });
          const keep = (p[t.id]?.[d] ?? []).filter(x => locked.has(`${t.id}|${d}|${x}`));
          next[t.id][d] = sortTimes([...keep, ...free]);
        }
        return next;
      });
    } catch (e) {
      if (ask) alert(`캘린더를 불러오지 못했어요.\n${(e as Error).message}`);
    } finally {
      setBusyLoading(null);
    }
  };

  // 새 스케쥴: 날짜(주·공휴일)가 정해질 때마다 캘린더가 연결된 선생님의 빈 시간을 자동으로 채운다
  const daysKey = days.join(',');
  useEffect(() => {
    if (existing || !daysKey) return;
    for (const t of active) if (t.googleCalendarId) fillFromCalendar(t, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daysKey, existing]);

  // 평일 동일 적용 — 첫 평일 시간을 나머지 평일(월~금)에 똑같이. 토·일은 건드리지 않는다
  const copyFirstToAll = (tid: string) => {
    const tt = teachers.find(x => x.id === tid);
    const open = days.filter(d => !closed[d] && teacherOff[`${tid}|${d}`] === undefined && !(tt && away(tt, d)) && parseYmd(d).getDay() >= 1 && parseYmd(d).getDay() <= 5);
    if (open.length < 2) return;
    const first = times[tid]?.[open[0]] ?? [];
    setTimes(p => ({
      ...p,
      [tid]: {
        ...p[tid],
        ...Object.fromEntries(open.slice(1).map(d => [d, sortTimes([...(p[tid]?.[d] ?? []).filter(x => locked.has(`${tid}|${d}|${x}`)), ...first])])),
      },
    }));
  };

  // 형식은 요일(0=일 … 6=토) 기준으로 저장·불러오기
  const toTemplate = (): TemplateData =>
    Object.fromEntries(active.map(t => {
      const byDow: Record<string, string[]> = {};
      for (const d of days) {
        const a = times[t.id]?.[d] ?? [];
        if (a.length) byDow[String(parseYmd(d).getDay())] = sortTimes([...(byDow[String(parseYmd(d).getDay())] ?? []), ...a]);
      }
      return [t.id, byDow];
    }));

  const loadTemplate = (id: string) => {
    setTemplateId(id);
    const tpl = templates.find(t => t.id === id);
    if (!tpl) return;
    setTimes(prev => {
      const t: Times = {};
      for (const teacher of active) {
        t[teacher.id] = {};
        for (const d of days) {
          const fromTpl = tpl.data[teacher.id]?.[String(parseYmd(d).getDay())] ?? [];
          const keep = (prev[teacher.id]?.[d] ?? []).filter(x => locked.has(`${teacher.id}|${d}|${x}`));
          t[teacher.id][d] = sortTimes([...fromTpl, ...keep]);
        }
      }
      return t;
    });
  };

  const handleSaveTemplate = async () => {
    const current = templates.find(t => t.id === templateId);
    const name = prompt('형식 이름을 정해 주세요. (같은 이름이면 덮어써요)', current?.name ?? '기본 형식');
    if (!name?.trim()) return;
    const same = templates.find(t => t.name === name.trim());
    try {
      await saveTemplate(name.trim(), toTemplate(), same?.id);
      const list = await getTemplates();
      setTemplates(list);
      setTemplateId(list.find(t => t.name === name.trim())?.id ?? '');
      alert('형식을 저장했어요.');
    } catch { alert('형식을 저장하지 못했어요.'); }
  };

  const handleDeleteTemplate = async () => {
    const tpl = templates.find(t => t.id === templateId);
    if (!tpl || !confirm(`"${tpl.name}" 형식을 지울까요?`)) return;
    try {
      await deleteTemplate(tpl.id);
      setTemplates(ts => ts.filter(t => t.id !== tpl.id));
      setTemplateId('');
    } catch { alert('형식을 지우지 못했어요.'); }
  };

  const handleSave = async () => {
    if (mode === 'holiday' && !days.length) { alert('공휴일 날짜를 적어 주세요. (예: 2026/10/9, 2026/12/25)'); return; }
    const slots: ScheduleDraft['slots'] = [];
    for (const t of active) {
      for (const d of days) {
        for (const time of times[t.id]?.[d] ?? []) {
          if ((closed[d] || teacherOff[`${t.id}|${d}`] !== undefined || away(t, d)) && !locked.has(`${t.id}|${d}|${time}`)) continue;   // 공휴일·선생님 휴무·다른 센터 출근일은 올리지 않는다
          slots.push({ teacherId: t.id, day: d, time });
        }
      }
    }
    if (!slots.length && !confirm('넣은 시간이 하나도 없어요. 그래도 올릴까요?')) return;
    setSaving(true);
    try {
      const id = await saveSchedule({
        weekStart: mode === 'holiday' ? days[0] : weekStart,
        days: mode === 'holiday' ? days : undefined,
        title: shownTitle.trim() || autoTitle,
        notice,
        holidays: [
          ...(mode === 'holiday' ? [] : days.filter(d => closed[d]).map(d => closed[d])),
          ...Object.entries(teacherOff)
            .map(([k, label]) => { const [teacherId, date] = k.split('|'); return { teacherId, date, label: label.trim() }; })
            .filter(h => days.includes(h.date) && active.some(t => t.id === h.teacherId)),
        ],
        slots,
      }, existing);
      onClose(id);
    } catch {
      alert('저장하지 못했어요. 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  };

  const label = 'text-[12px] tracking-[0.15em] text-[#999] mb-2';
  const chip = 'inline-flex items-center gap-1 text-[13px] pl-3 pr-2 py-1 rounded-full border';
  const range = days.length ? scheduleRange({ weekStart: days[0], days: mode === 'holiday' ? days : undefined }) : '';

  return (
    <div className="bg-white rounded-[18px] shadow-[0_2px_6px_rgba(0,0,0,0.05),0_10px_24px_rgba(0,0,0,0.05)] p-5 md:p-7 space-y-7">
      <div className="flex items-center justify-between">
        <h2 className="text-[22px] text-[var(--brand)]">{existing ? '스케쥴 고치기' : '새 스케쥴 올리기'}</h2>
        <button onClick={() => onClose()} className="text-[13px] text-[#888] hover:text-[#333]">닫기 ✕</button>
      </div>

      {/* 스케줄 선택 */}
      <div>
        <p className={label}>스케줄 선택</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {([['this', '이번 주'], ['next', '다음 주'], ['holiday', '공휴일']] as const).map(([m, name]) => (
            <button key={m} type="button" onClick={() => pickMode(m)}
              className={`text-[13px] px-4 py-2 border transition-colors ${mode === m ? 'border-[var(--brand)] bg-[var(--brand)] text-white' : 'border-[#e5e5e5] hover:bg-[#f8f8f8]'}`}>
              {name}
            </button>
          ))}
          {mode !== 'holiday' && <span className="text-[14px] text-[#555] ml-2">{range}</span>}
        </div>
        {mode === 'holiday' && (
          <div className="mt-3 space-y-1.5">
            <input value={holidayText} onChange={e => setHolidayText(e.target.value)} onBlur={applyHolidayText}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyHolidayText(); } }}
              placeholder="년/월/일 — 여러 날은 쉼표로 (예: 2026/10/9, 2026/12/25)"
              className="w-full border-b border-[#ddd] py-2 text-[15px] outline-none focus:border-[var(--brand)] placeholder:text-[#ccc]" />
            {holidayError && <p className="text-[12px] text-red-400">{holidayError}</p>}
            {!!days.length && <p className="text-[13px] text-[#555]">{days.length}일 · {range}</p>}
          </div>
        )}
      </div>

      {/* 공지 */}
      <div className="space-y-4">
        <div>
          <p className={label}>제목</p>
          <input value={shownTitle} onChange={e => { setTitle(e.target.value); setTitleTouched(true); }}
            className="w-full border-b border-[#ddd] py-2 text-[15px] outline-none focus:border-[var(--brand)]" />
        </div>
        <div>
          <p className={label}>안내 문구 (기간은 자동으로 위에 붙어요)</p>
          <textarea value={notice} onChange={e => setNotice(e.target.value)} rows={3}
            className="w-full border border-[#e5e5e5] p-3 text-[14px] leading-relaxed outline-none focus:border-[var(--brand)] resize-y" />
        </div>
        {mode !== 'holiday' && (
          <div>
            <p className={label}>공휴일 (공휴일로 표시한 날은 시간을 올리지 않아요)</p>
            <div className="space-y-1.5">
              {days.map(d => (
                <div key={d} className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-[14px] w-[96px] cursor-pointer whitespace-nowrap">
                    <input type="checkbox" checked={!!closed[d]}
                      onChange={e => setClosed(c => {
                        const n = { ...c };
                        if (e.target.checked) n[d] = { date: d, label: '' }; else delete n[d];
                        return n;
                      })} />
                    {shortDay(d)}
                  </label>
                  {closed[d] && (
                    <input value={closed[d].label} placeholder="이유 (예: 한글날)"
                      onChange={e => setClosed(c => ({ ...c, [d]: { ...c[d], label: e.target.value } }))}
                      className="flex-1 max-w-[240px] border-b border-[#ddd] py-1 text-[14px] outline-none focus:border-[var(--brand)]" />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 형식 */}
      <div className="bg-[#f8f9fb] -mx-5 md:-mx-7 px-5 md:px-7 py-4 space-y-2">
        <p className={label}>형식 (자주 쓰는 시간표 — 요일 기준)</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <select value={templateId} onChange={e => loadTemplate(e.target.value)}
            className="text-[14px] border border-[#ddd] bg-white px-3 py-2 min-w-[160px]">
            <option value="">형식 불러오기…</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button type="button" onClick={handleSaveTemplate} className="text-[13px] border border-[#0a0a0a] bg-white px-3 py-2 hover:bg-[#0a0a0a] hover:text-white transition-colors">
            지금 시간표를 형식으로 저장
          </button>
          {templateId && (
            <button type="button" onClick={handleDeleteTemplate} className="text-[13px] border border-[#e5e5e5] bg-white text-red-400 px-3 py-2 hover:bg-red-50">형식 삭제</button>
          )}
        </div>
      </div>

      {/* 선생님별 시간 */}
      {mode === 'holiday' && !days.length ? (
        <p className="text-[14px] text-[#aaa] text-center py-6">위에 공휴일 날짜를 적으면 날짜별로 시간을 넣을 수 있어요.</p>
      ) : (
        <div className="space-y-5">
          {active.map(t => (
            <section key={t.id} className="border border-[#eee] rounded-xl p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[17px] text-[#27272a] flex items-center gap-2">
                  {t.name} 선생님
                  {mode === 'holiday' && (
                    <button type="button" onClick={() => removeTeacher(t)} title="이 공휴일 스케쥴에서 빼기"
                      className="text-[12px] text-[#999] border border-[#e5e5e5] px-2 py-0.5 hover:text-red-400 hover:border-red-200">✕ 빼기</button>
                  )}
                  {t.googleCalendarId && (
                    <button type="button" onClick={() => fillFromCalendar(t)} disabled={busyLoading === t.id}
                      className="text-[12px] border border-[var(--brand)] text-[var(--brand)] px-2.5 py-1 hover:bg-[#e8f1fd] disabled:opacity-50">
                      {busyLoading === t.id ? '불러오는 중…' : '캘린더 빈 시간'}
                    </button>
                  )}
                </h3>
                {days.filter(d => parseYmd(d).getDay() >= 1 && parseYmd(d).getDay() <= 5).length > 1 && (
                  <button type="button" onClick={() => copyFirstToAll(t.id)} title="첫 평일 시간을 나머지 평일(월~금)에 똑같이 넣어요. 토요일은 그대로예요."
                    className="text-[12px] text-[var(--brand)] underline underline-offset-2">
                    평일 동일 적용
                  </button>
                )}
              </div>
              {days.map(d => {
                const key = `${t.id}|${d}`;
                const tOff = teacherOff[key] !== undefined;
                const off = !!closed[d] || tOff;
                if (away(t, d) && !(times[t.id]?.[d] ?? []).some(x => locked.has(`${t.id}|${d}|${x}`))) {
                  return (
                    <div key={d} className="flex items-center gap-2">
                      <span className="w-[42px]" />
                      <span className="w-[80px] shrink-0 text-[13px] text-[#71717b] whitespace-nowrap">{dowLabel(d)} <span className="text-[#bbb]">{shortDay(d).split('(')[0]}</span></span>
                      <span className="text-[12px] text-[#999]">은평 출근 안 하는 날</span>
                      <button type="button" onClick={() => setAddedAway(a => new Set(a).add(key))}
                        className="text-[12px] border border-[#f59e0b] text-[#b45309] px-2 py-0.5 hover:bg-[#fef3c7]">+ 이 날 추가</button>
                    </div>
                  );
                }
                const hasLocked = (times[t.id]?.[d] ?? []).some(x => locked.has(`${t.id}|${d}|${x}`));
                return (
                  <div key={d} className={`flex items-start gap-2 ${closed[d] ? 'opacity-40' : ''}`}>
                    <label className="shrink-0 pt-1.5 flex items-center gap-1 text-[12px] text-[#999] cursor-pointer whitespace-nowrap" title="이 선생님만 그날 휴무">
                      <input type="checkbox" checked={tOff} disabled={!!closed[d]}
                        onChange={e => {
                          if (e.target.checked && hasLocked) { alert('신청된 시간이 있어요. 먼저 신청을 취소해 주세요.'); return; }
                          setTeacherOff(o => { const n = { ...o }; if (e.target.checked) n[key] = ''; else delete n[key]; return n; });
                        }} />
                      휴무
                    </label>
                    <span className="w-[80px] shrink-0 pt-1.5 text-[13px] text-[#71717b] whitespace-nowrap">{dowLabel(d)} <span className="text-[#bbb]">{shortDay(d).split('(')[0]}</span></span>
                    {tOff ? (
                      <input value={teacherOff[key]} placeholder="휴무 사유를 적어 주세요 (예: 연차, 교육)" autoFocus
                        onChange={e => setTeacherOff(o => ({ ...o, [key]: e.target.value }))}
                        className="flex-1 border-b border-[#ddd] py-1 text-[14px] outline-none focus:border-[var(--brand)] placeholder:text-[#ccc]" />
                    ) : (
                    <div className="flex flex-wrap items-center gap-1.5 flex-1">
                      {(times[t.id]?.[d] ?? []).map(time => {
                        const owner = locked.get(`${t.id}|${d}|${time}`);
                        return owner ? (
                          <span key={time} title="신청된 시간 — 먼저 신청을 취소해야 뺄 수 있어요"
                            className={`${chip} pr-3 border-[var(--brand)] bg-[var(--brand)] text-white`}>
                            {time} <span className="text-[11px] bg-white/20 px-1.5 rounded-full">{owner}</span>
                          </span>
                        ) : (
                          <span key={time} className={`${chip} border-[var(--brand)] text-[var(--brand)]`}>
                            {time}
                            <button type="button" onClick={() => removeTime(t.id, d, time)} aria-label={`${time} 빼기`} className="w-5 h-5 text-[11px] text-[#999] hover:text-red-400">✕</button>
                          </span>
                        );
                      })}
                      {!off && (() => {
                        // 한 주 스케쥴의 월~금은 평일 시간, 토요일과 공휴일 스케쥴은 휴일 시간
                        const weekday = mode !== 'holiday' && parseYmd(d).getDay() !== 6;
                        const preset = weekday ? WEEKDAY_TIMES : HOLIDAY_TIMES;
                        const btn = 'text-[12px] border border-[var(--brand)] text-[var(--brand)] px-2.5 py-1 hover:bg-[#e8f1fd]';
                        return (
                          <span className="order-first inline-flex flex-wrap items-center gap-1">
                            <button type="button" onClick={() => setDayTimes(t.id, d, preset)} className={btn}
                              title={`${weekday ? '평일' : '휴일'} 기본 시간을 모두 넣어요`}>ALL</button>
                            <select value="" aria-label={`${t.name} 선생님 ${shortDay(d)} 시간 추가`}
                              onChange={e => {
                                const v = e.target.value;
                                if (v === 'custom') setCustom(c => ({ ...c, [key]: '' }));
                                else if (v) addTime(t.id, d, v);
                              }}
                              title="시간 추가"
                              className="w-[52px] text-[13px] text-[var(--brand)] border border-[var(--brand)] bg-white px-2 py-1">
                              <option value="">+</option>
                              {preset.filter(x => !(times[t.id]?.[d] ?? []).includes(x)).map(x => <option key={x} value={x}>{x}</option>)}
                              <option value="custom">직접 입력…</option>
                            </select>
                            {!!(times[t.id]?.[d] ?? []).length && (
                              <button type="button" onClick={() => { setDayTimes(t.id, d, []); setCustom(c => ({ ...c, [key]: undefined })); }}
                                title="비우기 — 그날 시간을 모두 빼요 (신청된 시간은 남아요)" aria-label={`${t.name} 선생님 ${shortDay(d)} 비우기`}
                                className="p-1 text-[#999] hover:text-red-400">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
                                </svg>
                              </button>
                            )}
                          </span>
                        );
                      })()}
                      {!off && custom[key] !== undefined && (
                        <span className="order-first inline-flex items-center gap-1">
                          <input type="text" inputMode="numeric" value={custom[key]} autoFocus placeholder="20:10" maxLength={5}
                            aria-label={`${t.name} 선생님 ${shortDay(d)} 시간 직접 입력 (24시간, 예: 20:10)`}
                            onChange={e => setCustom(c => ({ ...c, [key]: e.target.value }))}
                            onKeyDown={e => {
                              if (e.key !== 'Enter') return;
                              const v = normalizeTime(custom[key] ?? '');
                              if (v) { addTime(t.id, d, v); setCustom(c => ({ ...c, [key]: undefined })); }
                            }}
                            className="text-[13px] border border-[#ddd] px-2 py-1 w-[80px] placeholder:text-[#ccc]" />
                          <button type="button" disabled={!normalizeTime(custom[key] ?? '')}
                            onClick={() => { addTime(t.id, d, normalizeTime(custom[key] ?? '') ?? ''); setCustom(c => ({ ...c, [key]: undefined })); }}
                            className="text-[13px] border border-[#ddd] px-2.5 py-1 hover:bg-[#f8f8f8] disabled:opacity-40">추가</button>
                          <button type="button" onClick={() => setCustom(c => ({ ...c, [key]: undefined }))} aria-label="직접 입력 닫기"
                            className="text-[12px] text-[#999] px-1 hover:text-[#333]">✕</button>
                        </span>
                      )}
                    </div>
                    )}
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      )}

      {removedList.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 -mt-3">
          <span className="text-[12px] text-[#999]">뺀 선생님:</span>
          {removedList.map(t => (
            <button key={t.id} type="button" onClick={() => setRemoved(r => { const n = new Set(r); n.delete(t.id); return n; })}
              className="text-[12px] border border-[#ddd] rounded-full px-2.5 py-0.5 hover:bg-[#f8f8f8]">+ {t.name}</button>
          ))}
        </div>
      )}

      {/* 선생님 명단 */}
      <div>
        <button type="button" onClick={() => setShowTeachers(s => !s)} className="text-[13px] text-[#666] underline underline-offset-2">
          {showTeachers ? '선생님 명단 닫기' : '선생님 명단 고치기'}
        </button>
        {showTeachers && <TeacherList teachers={teachers} onChanged={onTeachersChanged} />}
      </div>

      <div className="flex gap-2 pt-2">
        <button onClick={handleSave} disabled={saving}
          className="flex-1 bg-[var(--brand)] text-white text-[14px] py-3 tracking-widest hover:opacity-90 disabled:opacity-50">
          {saving ? '저장 중...' : existing ? '저장' : '올리기'}
        </button>
        <button onClick={() => onClose()} className="flex-1 border border-[#e5e5e5] text-[14px] py-3 tracking-widest hover:bg-[#f8f8f8]">취소</button>
      </div>
    </div>
  );
}

function TeacherList({ teachers, onChanged }: { teachers: Teacher[]; onChanged: () => Promise<void> | void }) {
  const [names, setNames] = useState<Record<string, string>>({});
  const [calIds, setCalIds] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState('');

  const run = async (fn: () => Promise<void>) => {
    try { await fn(); await onChanged(); } catch { alert('저장하지 못했어요. 다시 시도해 주세요.'); }
  };

  const move = (i: number, dir: -1 | 1) => run(async () => {
    const list = [...teachers];
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    await Promise.all(list.map((t, k) => updateTeacher(t.id, { order: k + 1 })));
  });

  return (
    <div className="mt-3 border border-[#eee] rounded-xl p-4 space-y-2">
      <p className="text-[12px] text-[#999]">선생님을 지우면 그 선생님의 시간(신청된 것 포함)이 모든 스케쥴에서 같이 지워져요.</p>
      {teachers.map((t, i) => (
        <div key={t.id} className="space-y-1 pb-2 border-b border-[#f5f5f5] last:border-b-0">
          <div className="flex items-center gap-1.5">
          <input value={names[t.id] ?? t.name} onChange={e => setNames(n => ({ ...n, [t.id]: e.target.value }))}
            className="flex-1 border-b border-[#ddd] py-1 text-[14px] outline-none focus:border-[var(--brand)]" />
          {names[t.id] !== undefined && names[t.id] !== t.name && names[t.id].trim() && (
            <button onClick={() => run(() => updateTeacher(t.id, { name: names[t.id] }))} className="text-[12px] border border-[var(--brand)] text-[var(--brand)] px-2 py-1">저장</button>
          )}
          <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="위로" className="text-[12px] border border-[#e5e5e5] w-7 h-7 disabled:opacity-30">↑</button>
          <button onClick={() => move(i, 1)} disabled={i === teachers.length - 1} aria-label="아래로" className="text-[12px] border border-[#e5e5e5] w-7 h-7 disabled:opacity-30">↓</button>
          <button onClick={() => confirm(`${t.name} 선생님을 지울까요?`) && run(() => deleteTeacher(t.id))}
            className="text-[12px] border border-[#e5e5e5] text-red-400 px-2 py-1 hover:bg-red-50">삭제</button>
          </div>
          <div className="flex items-center gap-1.5 pl-1">
            <span className="text-[11px] text-[#aaa] shrink-0">구글 캘린더 ID</span>
            <input value={calIds[t.id] ?? t.googleCalendarId ?? ''} placeholder="연결 안 함"
              onChange={e => setCalIds(c => ({ ...c, [t.id]: e.target.value }))}
              className="flex-1 min-w-0 border-b border-[#eee] py-0.5 text-[12px] text-[#666] outline-none focus:border-[var(--brand)] placeholder:text-[#ccc]" />
            {calIds[t.id] !== undefined && calIds[t.id] !== (t.googleCalendarId ?? '') && (
              <button onClick={() => run(async () => { await updateTeacher(t.id, { googleCalendarId: calIds[t.id] }); setCalIds(c => { const n = { ...c }; delete n[t.id]; return n; }); })}
                className="text-[12px] border border-[var(--brand)] text-[var(--brand)] px-2 py-0.5">저장</button>
            )}
          </div>
        </div>
      ))}
      <div className="flex items-center gap-1.5 pt-1">
        <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="새 선생님 이름"
          className="flex-1 border-b border-[#ddd] py-1 text-[14px] outline-none focus:border-[var(--brand)]" />
        <button disabled={!newName.trim()} onClick={() => run(async () => { await addTeacher(newName, teachers.length + 1); setNewName(''); })}
          className="text-[12px] border border-[#0a0a0a] px-3 py-1 hover:bg-[#0a0a0a] hover:text-white disabled:opacity-30">추가</button>
      </div>
    </div>
  );
}
