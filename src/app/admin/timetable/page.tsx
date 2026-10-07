'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdmin } from '@/components/AdminContext';
import { askConfirm, showAlert } from '@/lib/dialog';
import type { Teacher } from '@/lib/schedule';
import { addDays, getTeachers, parseYmd, toYmd } from '@/lib/schedule';
import type { CellInput, CellView, Center, Child, PayMethod } from '@/lib/timetable';
import {
  CENTERS, PAY_METHODS, ROW_LABEL, cellOf, deleteFixed, getDayPayments, setLessonPayment, getChildren, getDayBoard, getFixedBoard, paymentColor, resetDayCell,
  rowsForDay, rowsForWeekday, saveDayCell, saveFixed, syncTimetable,
} from '@/lib/timetable';

// 관리자 시간표 — 센터 스프레드시트 "스케줄표" 모양. 시간 줄 × 선생님마다 [고정 | 빈타임] 두 칸.
// 날짜별: 왼쪽은 요일 고정 수업이 깔리고 그날만 결석·옮김·변경. 오른쪽은 보호자 신청이 자동으로 보이고 직접 넣을 수도 있다.
// 고정 시간표: 요일을 골라 왼쪽 고정 수업 자체를 고친다.
// 칸 표시: 이름 앞 숫자(같은 이름 구분)·S(구강), 이름 뒤 결제 글자(b 바우처 …)·x(결석). 글자 색 = 결제(b 하늘색, 없음 빨강, 그 밖 검정).

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
type Mode = 'day' | 'fixed';
type Side = 'fixed' | 'open';

interface Editing {
  teacher: Teacher;
  time: string;
  side: Side;
  cell: CellView;
}

export default function TimetablePage() {
  const { isAdmin } = useAdmin();
  const [mode, setMode] = useState<Mode>('day');
  const [center, setCenter] = useState<Center>('eunpyeong');
  // 접어 둔 선생님(이름만 보이고 칸은 숨김) — 이원재 선생님은 병가라 처음부터 접어 둔다
  const [folded, setFolded] = useState<Set<string>>(() => new Set(['이원재']));
  const toggleFold = (name: string) => setFolded(f => { const n = new Set(f); if (n.has(name)) n.delete(name); else n.add(name); return n; });
  const [day, setDay] = useState(() => toYmd(new Date()));
  const [weekday, setWeekday] = useState(() => new Date().getDay() || 1);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  // 그날 결제 체크 — "아이|시간" → 결제
  const [payments, setPayments] = useState<Map<string, PayMethod>>(new Map());
  const [board, setBoard] = useState<{ fixed: Map<string, CellView>; open: Map<string, CellView> }>({ fixed: new Map(), open: new Map() });
  const [editing, setEditing] = useState<Editing | null>(null);
  const [failed, setFailed] = useState('');

  const load = useCallback(async () => {
    try {
      const [t, c] = await Promise.all([getTeachers(), getChildren()]);
      setTeachers(t);
      setChildren(c);
      if (mode === 'day') {
        setBoard(await getDayBoard(day, c, center));
        setPayments(await getDayPayments(day).catch(() => new Map()));
      }
      else setBoard({ fixed: await getFixedBoard(weekday, c, center), open: new Map() });
      setFailed('');
    } catch (e) {
      setFailed((e as Error).message);
    }
  }, [mode, day, weekday, center]);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  // 칸을 고칠 때마다 그 칸만 구글 캘린더에 맞춘다(뒤에서). 실패하면 위에 알려 준다
  const [syncMsg, setSyncMsg] = useState('');
  const [fullSyncing, setFullSyncing] = useState(false);
  const sync = (body: Parameters<typeof syncTimetable>[0]) => {
    syncTimetable(body).then(() => setSyncMsg('')).catch(e => setSyncMsg(`캘린더 반영 실패: ${(e as Error).message}`));
  };
  const fullSync = async () => {
    if (!(await askConfirm('시간표 전체를 선생님 구글 캘린더에 반영할까요?\n(고정 수업은 이번 주부터 매주 반복, 공휴일은 빼요. 1분쯤 걸릴 수 있어요)'))) return;
    setFullSyncing(true);
    try {
      const r = await syncTimetable({ action: 'full' });
      await showAlert(`캘린더에 반영했어요.\n고정 수업 ${r.fixed}개 · 그날 바꾼 칸 ${r.cells}개 · 지운 일정 ${r.removed}개${r.errorCount ? `\n실패 ${r.errorCount}건: ${(r.errors as string[]).join(' / ')}` : ''}`);
    } catch (e) {
      await showAlert(`반영하지 못했어요.\n${(e as Error).message}`);
    } finally {
      setFullSyncing(false);
    }
  };

  // 이 센터에서 일하는 선생님
  const shown = useMemo(() => teachers.filter(t => t.centers.includes(center)), [teachers, center]);

  const rows = useMemo(() => (mode === 'day' ? rowsForDay(day) : rowsForWeekday(weekday)), [mode, day, weekday]);
  const d = parseYmd(day);

  if (!isAdmin) return <p className="text-center text-[14px] text-[#aaa] py-32">관리자만 볼 수 있는 화면이에요.</p>;

  const th = 'border border-[#d4d4d8] px-2 py-1.5 font-normal';
  const td = 'border border-[#e4e4e7] h-9 px-1.5 text-center align-middle cursor-pointer hover:bg-[#f0f6fe] whitespace-nowrap';

  return (
    <div className="px-3 md:px-6 pt-6 pb-14 fade-up">
      <div className="max-w-[1400px] mx-auto">
        <h1 className="display-heading mb-5">시간표</h1>

        {/* 보기 고르기 */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {CENTERS.map(cn => (
            <button key={cn.key} onClick={() => setCenter(cn.key)}
              className={`text-[14px] px-4 py-2 border-b-2 ${center === cn.key ? 'border-[var(--brand)] text-[var(--brand)]' : 'border-transparent text-[#999] hover:text-[#333]'}`}>{cn.label}</button>
          ))}
          <span className="w-4" />
          {([['day', '날짜별'], ['fixed', '고정 시간표']] as const).map(([m, n]) => (
            <button key={m} onClick={() => setMode(m)}
              className={`text-[13px] px-4 py-2 border ${mode === m ? 'border-[var(--brand)] bg-[var(--brand)] text-white' : 'border-[#e5e5e5] hover:bg-[#f8f8f8]'}`}>{n}</button>
          ))}
          <span className="w-4" />
          {mode === 'day' ? (
            <>
              <button onClick={() => setDay(x => addDays(x, -1))} className="text-[13px] border border-[#e5e5e5] w-8 h-8 hover:bg-[#f8f8f8]" aria-label="전날">‹</button>
              <input type="date" value={day} onChange={e => e.target.value && setDay(e.target.value)} className="text-[13px] border border-[#ddd] px-2 h-8" />
              <button onClick={() => setDay(x => addDays(x, 1))} className="text-[13px] border border-[#e5e5e5] w-8 h-8 hover:bg-[#f8f8f8]" aria-label="다음날">›</button>
              <button onClick={() => setDay(toYmd(new Date()))} className="text-[12px] text-[#888] underline underline-offset-2 ml-1">오늘</button>
            </>
          ) : (
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5, 6].map(w => (
                <button key={w} onClick={() => setWeekday(w)}
                  className={`text-[13px] w-9 h-8 border ${weekday === w ? 'border-[#0a0a0a] bg-[#0a0a0a] text-white' : 'border-[#e5e5e5] hover:bg-[#f8f8f8]'}`}>{DOW[w]}</button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 mb-3">
          <button onClick={fullSync} disabled={fullSyncing}
            className="text-[12px] border border-[#0a0a0a] px-3 py-1.5 hover:bg-[#0a0a0a] hover:text-white disabled:opacity-50">
            {fullSyncing ? '캘린더에 반영 중…' : '구글 캘린더 전체 반영'}
          </button>
          <span className="text-[11px] text-[#999]">칸을 고치면 그 칸은 자동으로 반영돼요. 처음 한 번, 또는 어긋났을 때 전체 반영을 눌러 주세요.</span>
          {syncMsg && <span className="text-[12px] text-red-400">{syncMsg}</span>}
        </div>
        {failed && <p className="text-[13px] text-red-400 mb-3">불러오지 못했어요 — 시간표 SQL(supabase/timetable.sql)을 실행했는지 확인해 주세요. ({failed})</p>}

        {/* 표 — 이 센터 선생님만. 접은 선생님은 이름 칸만 좁게 */}
        <div className="overflow-x-auto bg-white">
          <table className="border-collapse text-[12px] min-w-full">
            <thead>
              <tr>
                <th className={`${th} sticky left-0 z-10 bg-white w-16`}>시간</th>
                <th className={`${th} text-[14px] text-[#c026d3]`} colSpan={shown.reduce((n, t) => n + (folded.has(t.name) ? 1 : mode === 'day' ? 2 : 1), 0) || 1}>
                  {mode === 'day' ? `${DOW[d.getDay()]} / ${d.getMonth() + 1}월 ${d.getDate()}일` : `${DOW[weekday]}요일 고정 시간표`}
                </th>
              </tr>
              <tr>
                <th className={`${th} sticky left-0 z-10 bg-white`} />
                {shown.map(t => (
                  <th key={t.id} colSpan={folded.has(t.name) ? 1 : mode === 'day' ? 2 : 1} className={`${th} text-[14px] text-[#16a34a] whitespace-nowrap`}>
                    <button type="button" onClick={() => toggleFold(t.name)} title={folded.has(t.name) ? '펼치기' : '접기'}
                      className="inline-flex items-center gap-1 hover:opacity-70">
                      {t.name}<span className="text-[10px] text-[#aaa]">{folded.has(t.name) ? '▸' : '◂'}</span>
                    </button>
                  </th>
                ))}
              </tr>
              {mode === 'day' && (
                <tr>
                  <th className={`${th} sticky left-0 z-10 bg-white`} />
                  {shown.map(t => folded.has(t.name) ? <th key={t.id} className={`${th} text-[10px] text-[#ccc] w-6`}>접음</th> : (
                    <FragmentPair key={t.id} left={<th className={`${th} text-[10px] text-[#999] min-w-[84px]`}>고정</th>} right={<th className={`${th} text-[10px] text-[#999] min-w-[84px]`}>빈타임</th>} />
                  ))}
                </tr>
              )}
            </thead>
            <tbody>
              {rows.map(time => (
                <tr key={time}>
                  <td className={`border border-[#d4d4d8] px-2 text-center sticky left-0 z-10 bg-white ${ROW_LABEL[time] ? 'text-[#c026d3]' : ''}`}>{time.replace(/^0/, '')}</td>
                  {shown.map(t => {
                    if (folded.has(t.name)) return <td key={t.id} className="border border-[#e4e4e7] bg-[#f4f4f5] w-6" />;
                    const left = cellOf(board.fixed, t.id, time);
                    const right = cellOf(board.open, t.id, time);
                    return (
                      <FragmentPair key={t.id}
                        left={
                          <td className={`${td} min-w-[84px]`} onClick={() => setEditing({ teacher: t, time, side: 'fixed', cell: left })}>
                            <CellText cell={left} label={ROW_LABEL[time]} paid={mode === 'day' && left.childId ? payments.get(`${left.childId}|${time}`) : undefined} />
                          </td>
                        }
                        right={mode === 'day' ? (
                          <td className={`${td} min-w-[84px] bg-[#fcfcfd]`} onClick={() => setEditing({ teacher: t, time, side: 'open', cell: right })}>
                            <CellText cell={right} label={ROW_LABEL[time]} paid={right.childId ? payments.get(`${right.childId}|${time}`) : undefined} />
                          </td>
                        ) : null}
                      />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-[11px] text-[#999] mt-3 leading-[2]">
          칸을 누르면 고칠 수 있어요. 글자 색: <span style={{ color: paymentColor('b') }}>바우처(b)</span> · <span style={{ color: paymentColor('') }}>결제 글자 없음</span> · <span style={{ color: paymentColor('e') }}>그 밖(e·c·v …)</span>
          {' '}· 앞 숫자 = 같은 이름 구분 · S = 구강 · 뒤 x = 결석 · 줄 = 다른 선생님에게 옮김 · ? = 미정 · x = 그 시간 수업 안 함
          {mode === 'day' && ' · 빈타임의 "신청" = 보호자가 수업스케쥴에서 신청'}
        </p>
      </div>

      {editing && (
        <CellEditor
          editing={editing}
          mode={mode}
          dayLabel={mode === 'day' ? `${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]})` : `${DOW[weekday]}요일 고정`}
          kids={children}
          paid={mode === 'day' && editing.cell.childId ? payments.get(`${editing.cell.childId}|${editing.time}`) : undefined}
          onPay={mode === 'day' && editing.cell.childId && editing.cell.status === 'child' ? async method => {
            try {
              await setLessonPayment(editing.cell.childId!, day, editing.time, editing.teacher.id, center, method);
              setPayments(p => { const n = new Map(p); const k = `${editing.cell.childId}|${editing.time}`; if (method) n.set(k, method); else n.delete(k); return n; });
            } catch (e) {
              showAlert(`결제 체크를 저장하지 못했어요.\n${(e as Error).message}`);
            }
          } : undefined}
          onClose={() => setEditing(null)}
          onSave={async (input, weekly) => {
            const { teacher, time, side } = editing;
            try {
              if (weekly && input !== 'reset' && input.status === 'child') {
                // 날짜별 화면에서 "매주 고정으로 저장" — 요일 고정 수업으로 넣고, 그날 따로 바꿔 둔 칸은 지운다
                await saveFixed(d.getDay(), teacher.id, time, input, center);
                await resetDayCell(day, teacher.id, time, 'fixed', center);
                sync({ action: 'fixed', teacherId: teacher.id, weekday: d.getDay(), time, center });
              } else if (mode === 'fixed') {
                if (input === 'reset' || input.status !== 'child') await deleteFixed(weekday, teacher.id, time, center);
                else await saveFixed(weekday, teacher.id, time, input, center);
                sync({ action: 'fixed', teacherId: teacher.id, weekday, time, center });
              } else if (input === 'reset') {
                await resetDayCell(day, teacher.id, time, side, center);
                sync({ action: 'cell', day, teacherId: teacher.id, time, side, center });
              } else {
                await saveDayCell(day, teacher.id, time, side, input, center);
                sync({ action: 'cell', day, teacherId: teacher.id, time, side, center });
              }
              setEditing(null);
              load();
            } catch (e) {
              showAlert(`저장하지 못했어요.\n${(e as Error).message}`);
            }
          }}
        />
      )}
    </div>
  );
}

function FragmentPair({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return <>{left}{right}</>;
}

/** 칸 글자 — 3S김채현bx 처럼 */
function CellText({ cell, label, paid }: { cell: CellView; label?: string; paid?: PayMethod }) {
  if (cell.status === 'empty' || cell.status === 'none') {
    return label ? <span className="text-[#c4c4cc]">{label}</span> : null;
  }
  if (cell.status === 'undecided') return <span className="text-[#71717a]">?</span>;
  if (cell.status === 'off') return <span className="text-[#a1a1aa]">x</span>;
  return (
    <span title={cell.note} style={{ color: paymentColor(cell.payment) }} className={`${cell.moved ? 'line-through' : ''} ${cell.absent ? 'opacity-60' : ''}`}>
      {cell.number ?? ''}{cell.oral ? 'S' : ''}{cell.name}
      <span className="text-[10px]">{cell.payment}{cell.absent && !/x/i.test(cell.payment) ? 'x' : ''}</span>
      {cell.source === 'booking' && <span className="ml-0.5 text-[9px] text-[#a1a1aa]">신청</span>}
      {cell.subName && <span className="block text-[9px] leading-[1.2] text-[#a1a1aa]">{cell.subName}</span>}
      {cell.note && <span className="ml-0.5 text-[9px] text-[#f59e0b]">●</span>}
      {paid && <span className="ml-0.5 text-[9px] text-white bg-[#16a34a] px-1 rounded" title="결제 체크됨">✓{PAY_METHODS.find(m => m.key === paid)?.label}</span>}
    </span>
  );
}

function CellEditor({ editing, mode, dayLabel, kids, paid, onPay, onClose, onSave }: {
  editing: Editing;
  mode: Mode;
  dayLabel: string;
  kids: Child[];
  /** 수업 후 결제 체크 (날짜별 화면, 아이가 명단에 있는 칸만) */
  paid?: PayMethod;
  onPay?: (method: PayMethod | null) => void;
  onClose: () => void;
  /** weekly = 날짜별 화면의 왼쪽 칸에서 "매주 고정으로 저장" */
  onSave: (input: CellInput | 'reset', weekly?: boolean) => void;
}) {
  const { teacher, time, side, cell } = editing;
  const [name, setName] = useState(cell.status === 'child' ? cell.name ?? '' : '');
  const [payment, setPayment] = useState(cell.payment);
  const [oral, setOral] = useState(cell.oral);
  const [absent, setAbsent] = useState(cell.absent);
  const [moved, setMoved] = useState(cell.moved);
  const [note, setNote] = useState(cell.note ?? '');
  const child = kids.find(c => c.name === name.trim());

  const pickName = (v: string) => {
    setName(v);
    const c = kids.find(x => x.name === v.trim());
    if (c && !payment) setPayment(c.payment);
  };

  const saveWeekly = () => {
    if (!name.trim()) return;
    onSave({ status: 'child', childId: child?.id ?? null, name: name.trim(), payment, oral, absent: false, moved: false }, true);
  };

  const save = () => {
    // 이름을 비우고 저장 — 고정 시간표: 고정 수업 지우기 / 날짜별 고정 칸: 그날만 비우기 / 빈타임 칸: 원래대로
    if (!name.trim()) { onSave(mode === 'fixed' || side === 'open' ? 'reset' : { status: 'none' }); return; }
    onSave({ status: 'child', childId: child?.id ?? null, name: name.trim(), payment, oral, absent, moved, note });
  };

  const isBooking = cell.source === 'booking';
  const chip = 'text-[13px] px-3 py-2 border rounded-full';

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <p className="text-[13px] text-[#888]">
          {dayLabel} · {time} · {teacher.name} 선생님 · {mode === 'fixed' ? '고정 수업' : side === 'fixed' ? '고정 칸' : '빈타임 칸'}
        </p>
        {isBooking && (
          <p className="text-[12px] leading-[1.8] text-[#b45309] bg-[#fef3c7] rounded-lg px-3 py-2">
            보호자가 수업스케쥴에서 신청한 칸이에요. 여기서 저장하면 이 표에서만 바뀌어요(신청 자체는 수업스케쥴에서 취소).
          </p>
        )}

        <div className="flex items-end gap-2">
          <label className="flex-1">
            <span className="block text-[11px] text-[#999] mb-1">아이 이름</span>
            <input list="tt-children" value={name} onChange={e => pickName(e.target.value)} autoFocus placeholder="이름 (비우면 빈 칸)"
              className="w-full border-b border-[#ddd] py-1.5 text-[15px] outline-none focus:border-[var(--brand)]" />
            <datalist id="tt-children">
              {kids.map(c => <option key={c.id} value={c.name}>{c.number ? `${c.number} ${c.name}` : c.name}</option>)}
            </datalist>
          </label>
          <label className="w-20">
            <span className="block text-[11px] text-[#999] mb-1">결제</span>
            <input value={payment} onChange={e => setPayment(e.target.value)} placeholder="b"
              className="w-full border-b border-[#ddd] py-1.5 text-[15px] text-center outline-none focus:border-[var(--brand)]"
              style={{ color: paymentColor(payment) }} />
          </label>
        </div>
        {child?.number !== undefined && <p className="text-[11px] text-[#999] -mt-2">아이 명단: {child.number}{child.name}</p>}

        <div className="flex flex-wrap gap-3 text-[13px]">
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={oral} onChange={e => setOral(e.target.checked)} />구강(S)</label>
          {mode === 'day' && <label className="flex items-center gap-1.5"><input type="checkbox" checked={absent} onChange={e => setAbsent(e.target.checked)} />결석(x)</label>}
          {mode === 'day' && <label className="flex items-center gap-1.5"><input type="checkbox" checked={moved} onChange={e => setMoved(e.target.checked)} />다른 선생님에게 옮김</label>}
        </div>
        {mode === 'day' && (
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="메모 (선택)"
            className="w-full border-b border-[#eee] py-1 text-[13px] outline-none focus:border-[var(--brand)]" />
        )}

        {onPay ? (
          <div className="rounded-xl bg-[#f6fbf7] px-3 py-2.5">
            <p className="text-[11px] text-[#16a34a] mb-1.5">수업 후 결제 체크 {paid ? `· ${PAY_METHODS.find(m => m.key === paid)?.label}` : ''}</p>
            <div className="flex flex-wrap gap-1">
              {PAY_METHODS.map(m => (
                <button key={m.key} type="button" onClick={() => onPay(paid === m.key ? null : m.key)}
                  className={`text-[12px] px-2.5 py-1 rounded-full border ${paid === m.key ? 'border-[#16a34a] bg-[#16a34a] text-white' : 'border-[#d4d4d8] hover:bg-white'}`}>
                  {paid === m.key ? '✓ ' : ''}{m.label}
                </button>
              ))}
            </div>
          </div>
        ) : mode === 'day' && cell.status === 'child' ? (
          <p className="text-[11px] text-[#aaa]">아이 명단에 없는 이름이라 결제 체크를 할 수 없어요. 명단에서 고르면 체크할 수 있어요.</p>
        ) : null}

        <div className="flex flex-wrap gap-1.5">
          <button onClick={save} className={`${chip} border-[var(--brand)] bg-[var(--brand)] text-white`}>
            {mode === 'day' && side === 'fixed' ? '이 날만 저장' : '저장'}
          </button>
          {mode === 'day' && side === 'fixed' && (
            <button onClick={saveWeekly} disabled={!name.trim()} className={`${chip} border-[#0a0a0a] bg-[#0a0a0a] text-white disabled:opacity-40`}>
              매주 고정으로 저장
            </button>
          )}
          {mode === 'day' && <button onClick={() => onSave({ status: 'undecided' })} className={`${chip} border-[#ddd]`}>? 미정</button>}
          {mode === 'day' && <button onClick={() => onSave({ status: 'off' })} className={`${chip} border-[#ddd]`}>x 수업 안 함</button>}
          {mode === 'day' && side === 'fixed' && cell.source !== 'none' && (
            <button onClick={async () => { if (await askConfirm('이 날만 이 칸을 비울까요?\n(요일 고정 수업은 그대로예요)')) onSave({ status: 'none' }); }} className={`${chip} border-[#ddd]`}>이 날만 비우기</button>
          )}
          {mode === 'day' && cell.source === 'override' && (
            <button onClick={() => onSave('reset')} className={`${chip} border-[#ddd]`}>
              {side === 'fixed' ? '고정 시간표대로' : '원래대로'}
            </button>
          )}
          {mode === 'fixed' && cell.source === 'fixed' && (
            <button onClick={async () => { if (await askConfirm('이 고정 수업을 지울까요?')) onSave('reset'); }} className={`${chip} border-[#ddd] text-red-400`}>고정 수업 지우기</button>
          )}
          <button onClick={onClose} className={`${chip} border-transparent text-[#888]`}>닫기</button>
        </div>
      </div>
    </div>
  );
}
