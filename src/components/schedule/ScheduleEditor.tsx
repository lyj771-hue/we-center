'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Holiday, Schedule, ScheduleDraft, Teacher, Template, TemplateData } from '@/lib/schedule';
import {
  addDays, addTeacher, deleteTeacher, deleteTemplate, getTemplates, saveSchedule, saveTemplate,
  shortDay, thisMonday, updateTeacher, weekDays, weekRange,
} from '@/lib/schedule';

// 관리자: 한 주 스케쥴 올리기·고치기.
// 주 고르기 → (형식 불러오기) → 선생님별·요일별 시간 넣기, 휴무일 표시 → 올리기. 지금 상태를 새 형식으로 저장할 수도 있다.
// 고칠 땐 이미 신청된 시간은 잠겨서 뺄 수 없다(먼저 신청 취소).

const DEFAULT_NOTICE = '원하시는 시간을 누르면 바로 신청돼요. 선착순이에요!\n취소가 필요하면 센터로 연락해 주세요.';
const DAY_NAMES = ['월', '화', '수', '목', '금'];

/** 선생님 id → 요일 순번(0=월 … 4=금) → 시간들 */
type Times = Record<string, string[][]>;

const emptyTimes = (teachers: Teacher[]): Times =>
  Object.fromEntries(teachers.map(t => [t.id, [[], [], [], [], []]]));

const sortTimes = (a: string[]) => [...new Set(a)].sort();

interface Props {
  teachers: Teacher[];
  existing?: Schedule;
  onTeachersChanged: () => Promise<void> | void;
  onClose: (saved: boolean) => void;
}

export default function ScheduleEditor({ teachers, existing, onTeachersChanged, onClose }: Props) {
  const nextMonday = addDays(thisMonday(), 7);
  const [weekStart, setWeekStart] = useState(existing?.weekStart ?? nextMonday);
  const [title, setTitle] = useState(existing?.title ?? '');
  const [titleTouched, setTitleTouched] = useState(!!existing);
  const [notice, setNotice] = useState(existing?.notice ?? DEFAULT_NOTICE);
  const [holidays, setHolidays] = useState<(Holiday | null)[]>(() => {
    const days = weekDays(existing?.weekStart ?? nextMonday);
    return days.map(d => existing?.holidays.find(h => h.date === d) ?? null);
  });
  const [times, setTimes] = useState<Times>(() => {
    const t = emptyTimes(teachers);
    if (existing) {
      const days = weekDays(existing.weekStart);
      for (const s of existing.slots) {
        const i = days.indexOf(s.day);
        if (i >= 0 && t[s.teacherId]) t[s.teacherId][i].push(s.time);
      }
    }
    return t;
  });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [saving, setSaving] = useState(false);
  const [showTeachers, setShowTeachers] = useState(false);

  useEffect(() => { getTemplates().then(setTemplates).catch(() => {}); }, []);

  // 선생님이 추가되면 빈 칸을 만들어 둔다
  useEffect(() => {
    setTimes(prev => {
      const next = { ...prev };
      for (const t of teachers) if (!next[t.id]) next[t.id] = [[], [], [], [], []];
      return next;
    });
  }, [teachers]);

  // 신청된 시간 (잠금) — "선생님|요일순번|시간" → 닉네임
  const locked = useMemo(() => {
    const m = new Map<string, string>();
    if (!existing) return m;
    const days = weekDays(existing.weekStart);
    for (const s of existing.slots) if (s.bookedBy) m.set(`${s.teacherId}|${days.indexOf(s.day)}|${s.time}`, s.owner ?? '신청됨');
    return m;
  }, [existing]);

  const autoTitle = weekStart === thisMonday() ? '이번 주 빈 수업 안내' : weekStart === nextMonday ? '다음 주 빈 수업 안내' : '빈 수업 안내';
  const shownTitle = titleTouched ? title : autoTitle;
  const days = weekDays(weekStart);

  const changeWeek = (ws: string) => {
    setWeekStart(ws);
    const nd = weekDays(ws);
    setHolidays(h => h.map((x, i) => (x ? { ...x, date: nd[i] } : null)));
  };

  const addTime = (tid: string, di: number, raw: string) => {
    const time = raw.slice(0, 5);
    if (!/^\d{2}:\d{2}$/.test(time)) return;
    setTimes(p => ({ ...p, [tid]: p[tid].map((a, i) => (i === di ? sortTimes([...a, time]) : a)) }));
  };
  const removeTime = (tid: string, di: number, time: string) =>
    setTimes(p => ({ ...p, [tid]: p[tid].map((a, i) => (i === di ? a.filter(x => x !== time) : a)) }));
  const copyMondayToAll = (tid: string) =>
    setTimes(p => ({
      ...p,
      [tid]: p[tid].map((a, i) => {
        if (i === 0) return a;
        const keep = a.filter(x => locked.has(`${tid}|${i}|${x}`));
        return sortTimes([...keep, ...p[tid][0]]);
      }),
    }));

  const toTemplate = (): TemplateData =>
    Object.fromEntries(Object.entries(times).map(([tid, arr]) => [tid, Object.fromEntries(arr.map((a, i) => [String(i + 1), a]))]));

  const loadTemplate = (id: string) => {
    setTemplateId(id);
    const tpl = templates.find(t => t.id === id);
    if (!tpl) return;
    if (existing && locked.size && !confirm('형식을 불러오면 지금 넣은 시간이 바뀌어요. (신청된 시간은 그대로 남아요)')) return;
    setTimes(() => {
      const t = emptyTimes(teachers);
      for (const [tid, byDow] of Object.entries(tpl.data)) {
        if (!t[tid]) continue;
        for (let i = 0; i < 5; i++) t[tid][i] = sortTimes(byDow[String(i + 1)] ?? []);
      }
      // 신청된 시간은 형식과 상관없이 남긴다
      for (const key of locked.keys()) {
        const [tid, di, time] = key.split('|');
        if (t[tid]) t[tid][Number(di)] = sortTimes([...t[tid][Number(di)], time]);
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
    const slots: ScheduleDraft['slots'] = [];
    for (const t of teachers) {
      times[t.id]?.forEach((arr, i) => {
        if (holidays[i] && !arr.some(x => locked.has(`${t.id}|${i}|${x}`))) return;   // 휴무일은 올리지 않는다
        for (const time of arr) {
          if (holidays[i] && !locked.has(`${t.id}|${i}|${time}`)) continue;
          slots.push({ teacherId: t.id, day: days[i], time });
        }
      });
    }
    if (!slots.length && !confirm('넣은 시간이 하나도 없어요. 그래도 올릴까요?')) return;
    setSaving(true);
    try {
      await saveSchedule({
        weekStart,
        title: shownTitle.trim() || autoTitle,
        notice,
        holidays: holidays.filter((h): h is Holiday => !!h),
        slots,
      }, existing);
      onClose(true);
    } catch {
      alert('저장하지 못했어요. 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  };

  const label = 'text-[12px] tracking-[0.15em] text-[#999] mb-2';
  const chip = 'inline-flex items-center gap-1 text-[13px] pl-3 pr-2 py-1 rounded-full border';

  return (
    <div className="bg-white rounded-[18px] shadow-[0_2px_6px_rgba(0,0,0,0.05),0_10px_24px_rgba(0,0,0,0.05)] p-5 md:p-7 space-y-7">
      <div className="flex items-center justify-between">
        <h2 className="text-[22px] text-[var(--brand)]">{existing ? '스케쥴 고치기' : '새 스케쥴 올리기'}</h2>
        <button onClick={() => onClose(false)} className="text-[13px] text-[#888] hover:text-[#333]">닫기 ✕</button>
      </div>

      {/* 주 */}
      <div>
        <p className={label}>주 고르기</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {[{ ws: thisMonday(), name: '이번 주' }, { ws: nextMonday, name: '다음 주' }].map(o => (
            <button key={o.ws} type="button" onClick={() => changeWeek(o.ws)}
              className={`text-[13px] px-4 py-2 border transition-colors ${weekStart === o.ws ? 'border-[var(--brand)] bg-[var(--brand)] text-white' : 'border-[#e5e5e5] hover:bg-[#f8f8f8]'}`}>
              {o.name}
            </button>
          ))}
          <span className="text-[14px] text-[#555] ml-2">{weekRange(weekStart)}</span>
        </div>
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
        <div>
          <p className={label}>휴무일 (휴무로 표시한 날은 시간을 올리지 않아요)</p>
          <div className="space-y-1.5">
            {days.map((d, i) => (
              <div key={d} className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-[14px] w-[96px] cursor-pointer">
                  <input type="checkbox" checked={!!holidays[i]}
                    onChange={e => setHolidays(h => h.map((x, j) => (j === i ? (e.target.checked ? { date: d, label: '' } : null) : x)))} />
                  {shortDay(d)}
                </label>
                {holidays[i] && (
                  <input value={holidays[i]!.label} placeholder="이유 (예: 한글날)"
                    onChange={e => setHolidays(h => h.map((x, j) => (j === i && x ? { ...x, label: e.target.value } : x)))}
                    className="flex-1 max-w-[240px] border-b border-[#ddd] py-1 text-[14px] outline-none focus:border-[var(--brand)]" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 형식 */}
      <div className="bg-[#f8f9fb] -mx-5 md:-mx-7 px-5 md:px-7 py-4 space-y-2">
        <p className={label}>형식 (자주 쓰는 시간표)</p>
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
      <div className="space-y-5">
        {teachers.map(t => (
          <section key={t.id} className="border border-[#eee] rounded-xl p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[17px] text-[#27272a]">{t.name} 선생님</h3>
              <button type="button" onClick={() => copyMondayToAll(t.id)} className="text-[12px] text-[var(--brand)] underline underline-offset-2">
                월요일 시간을 화~금에 똑같이
              </button>
            </div>
            {DAY_NAMES.map((dn, i) => {
              const off = !!holidays[i];
              const key = `${t.id}|${i}`;
              return (
                <div key={dn} className={`flex items-start gap-2 ${off ? 'opacity-40' : ''}`}>
                  <span className="w-[80px] shrink-0 pt-1.5 text-[13px] text-[#71717b] whitespace-nowrap">{dn} <span className="text-[#bbb]">{shortDay(days[i]).split('(')[0]}</span></span>
                  <div className="flex flex-wrap items-center gap-1.5 flex-1">
                    {(times[t.id]?.[i] ?? []).map(time => {
                      const owner = locked.get(`${t.id}|${i}|${time}`);
                      return owner ? (
                        <span key={time} title="신청된 시간 — 먼저 신청을 취소해야 뺄 수 있어요"
                          className={`${chip} pr-3 border-[var(--brand)] bg-[var(--brand)] text-white`}>
                          {time} <span className="text-[11px] bg-white/20 px-1.5 rounded-full">{owner}</span>
                        </span>
                      ) : (
                        <span key={time} className={`${chip} border-[var(--brand)] text-[var(--brand)]`}>
                          {time}
                          <button type="button" onClick={() => removeTime(t.id, i, time)} aria-label={`${time} 빼기`} className="w-5 h-5 text-[11px] text-[#999] hover:text-red-400">✕</button>
                        </span>
                      );
                    })}
                    {!off && (
                      <span className="inline-flex items-center gap-1">
                        <input type="time" step={600} value={drafts[key] ?? ''} aria-label={`${t.name} 선생님 ${dn}요일 시간`}
                          onChange={e => setDrafts(d => ({ ...d, [key]: e.target.value }))}
                          className="text-[13px] border border-[#ddd] px-2 py-1 w-[110px]" />
                        <button type="button" disabled={!drafts[key]}
                          onClick={() => { addTime(t.id, i, drafts[key] ?? ''); setDrafts(d => ({ ...d, [key]: '' })); }}
                          className="text-[13px] border border-[#ddd] px-2.5 py-1 hover:bg-[#f8f8f8] disabled:opacity-40">추가</button>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        ))}
      </div>

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
        <button onClick={() => onClose(false)} className="flex-1 border border-[#e5e5e5] text-[14px] py-3 tracking-widest hover:bg-[#f8f8f8]">취소</button>
      </div>
    </div>
  );
}

function TeacherList({ teachers, onChanged }: { teachers: Teacher[]; onChanged: () => Promise<void> | void }) {
  const [names, setNames] = useState<Record<string, string>>({});
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
        <div key={t.id} className="flex items-center gap-1.5">
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
