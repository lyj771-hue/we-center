'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdmin } from '@/components/AdminContext';
import { askConfirm, askPrompt, showAlert } from '@/lib/dialog';
import type { Teacher } from '@/lib/schedule';
import { addDays, getKoreanHolidays, getTeachers, parseYmd, toYmd } from '@/lib/schedule';
import type { CellInput, CellView, Center, Child, PayCount, PayEntry, PayMethod } from '@/lib/timetable';
import {
  CENTERS, PAY_METHODS, ROW_LABEL, cellOf, deleteFixed, getDayAssigns, getDayPayments, getPaymentCounts, setDayAssign, setLessonPayment, worksAt, getChildren, getDayBoard, getFixedBoard, resetDayCell,
  rowsForDay, rowsForWeekday, saveDayCell, saveFixed, syncTimetable,
} from '@/lib/timetable';

// 관리자 시간표 — 센터 스프레드시트 "스케줄표" 모양. 시간 줄 × 선생님마다 [고정 | 빈타임 | 결제방식] 세 칸.
// 날짜별: 왼쪽은 요일 고정 수업이 깔리고 그날만 결석·옮김·변경. 오른쪽은 보호자 신청이 자동으로 보이고 직접 넣을 수도 있다.
// 결제방식: 아이의 기본 결제(b 바우처 …)를 흐리게 보여 주고, 눌러서 수업 후 결제를 고르면 체크된다.
// 빈타임 칸을 누르면 칸 아래로 아이 명단이 열리고, 맨 위에 적으면 검색된다(명단에 있는 아이만 — 오타 없게).
// 고정 시간표: 요일을 골라 왼쪽 고정 수업 자체를 고친다.
// 칸 표시: 이름 앞 숫자(같은 이름 구분) + 이름만. 결제 글자(b·e …)·구강(S) 같은 영어는 표에 보이지 않는다. 글자 색은 모두 기본.
// 결제방식 칸 단계: 기본 결제(그대로) → 직접 고르면 파랑 → [결제 완료]로 확정하면 빨강.

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
type Mode = 'day' | 'fixed';
type Side = 'fixed' | 'open';

interface Editing {
  teacher: Teacher;
  time: string;
  side: Side;
  cell: CellView;
}

/** 아직 저장 안 한 시간표 변경 — [스케줄 변경 완료]에서 차례로 디비·캘린더에 반영한다.
 *  day = 날짜별 칸, weekly = 날짜별 화면에서 "매주 고정으로 저장", fixed = 고정 시간표 칸.
 *  auto = 선생님 빼기로 생긴 변경(다시 넣으면 같이 취소) */
type Op =
  | { kind: 'day'; teacherId: string; time: string; side: Side; input: CellInput | 'reset'; auto?: boolean }
  | { kind: 'weekly'; teacherId: string; time: string; input: CellInput }
  | { kind: 'fixed'; teacherId: string; time: string; input: CellInput | 'reset' };
type AssignState = 'add' | 'off' | null;

/** 빈타임 칸 아래로 여는 아이 고르기 — 칸 위치(rect)에 붙여 띄운다 */
interface Picking extends Editing {
  rect: { left: number; top: number; bottom: number };
}

/** 결제 글자(b·e·c …) → 기본 결제. 모르는 글자면 없음 */
function defaultMethod(payment: string | undefined): PayMethod | undefined {
  const p = (payment ?? '').toLowerCase().replace(/x/g, '');
  for (const ch of p) {
    const m = PAY_METHODS.find(x => x.short === ch);
    if (m) return m.key;
  }
  return undefined;
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
  // 그날 결제 체크(디비) — "아이|시간" → 결제
  const [payments, setPayments] = useState<Map<string, PayEntry>>(new Map());
  // 아직 저장 안 한 결제 체크 — 다 고르고 [결제 완료]를 누르면 디비에 반영된다 (null = 체크 풀기)
  const [draft, setDraft] = useState<Map<string, { entry: PayEntry | null; childId: string; teacherId: string; time: string }>>(new Map());
  // 아이마다 이번 달 바우처·굳센·꿈이든, 지금까지 선결제 사용 횟수(디비)
  const [counts, setCounts] = useState<Map<string, PayCount>>(new Map());
  const [savingPay, setSavingPay] = useState(false);
  // 그날만 이 센터에 더한 선생님(공휴일 등)·뺀 선생님
  const [assigns, setAssigns] = useState<{ added: string[]; removed: string[] }>({ added: [], removed: [] });
  const [board, setBoard] = useState<{ fixed: Map<string, CellView>; open: Map<string, CellView> }>({ fixed: new Map(), open: new Map() });
  // 날짜별 화면: 그 요일 고정 수업 (칸을 "고정 시간표대로" 되돌릴 때 미리 보여 주려고)
  const [base, setBase] = useState<Map<string, CellView>>(new Map());
  // 저장 안 한 시간표 변경 · 선생님 빼기/더하기
  const [ops, setOps] = useState<Map<string, Op>>(new Map());
  const [assignDraft, setAssignDraft] = useState<Map<string, AssignState>>(new Map());
  const [savingSched, setSavingSched] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  // 그날이 공휴일인지 — 공휴일엔 요일 고정 수업을 비운다(그날 따로 넣은 칸·보호자 신청은 그대로)
  const [holiday, setHoliday] = useState(false);
  const [picking, setPicking] = useState<Picking | null>(null);
  const [failed, setFailed] = useState('');

  const load = useCallback(async () => {
    try {
      const [t, c] = await Promise.all([getTeachers(), getChildren()]);
      setTeachers(t);
      setChildren(c);
      if (mode === 'day') {
        const [b, hols] = await Promise.all([getDayBoard(day, c, center), getKoreanHolidays(day.slice(0, 4)).catch(() => [] as string[])]);
        const isHoliday = hols.includes(day);
        if (isHoliday) for (const [k, v] of b.fixed) if (v.source === 'fixed') b.fixed.delete(k);
        setHoliday(isHoliday);
        setBoard(b);
        setBase(isHoliday ? new Map() : await getFixedBoard(parseYmd(day).getDay(), c, center).catch(() => new Map()));
        setPayments(await getDayPayments(day).catch(() => new Map()));
        const ym = day.slice(0, 7);
        setCounts(await getPaymentCounts(`${ym}-01`, `${ym}-31`).catch(() => new Map()));
        setAssigns(await getDayAssigns(day, center).catch(() => ({ added: [], removed: [] })));
      }
      else setBoard({ fixed: await getFixedBoard(weekday, c, center), open: new Map() });
      setFailed('');
    } catch (e) {
      setFailed((e as Error).message);
    }
  }, [mode, day, weekday, center]);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  // 저장 안 한 시간표 변경·결제 체크가 있으면 다른 날·센터로 가기 전에 묻는다
  const unsaved = ops.size + assignDraft.size + draft.size;
  const guard = async (go: () => void) => {
    if (unsaved && !(await askConfirm(`저장 안 한 변경이 ${unsaved}건 있어요.\n저장하지 않고 넘어갈까요?`))) return;
    setDraft(new Map());
    setOps(new Map());
    setAssignDraft(new Map());
    go();
  };
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);

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

  // 표에 보이는 칸 = 디비 칸 + 저장 안 한 변경. pend = 바뀐 칸("fixed|선생님|시간" / "open|…")
  const preview = useCallback((i: CellInput): CellView => i.status === 'child'
    ? { status: 'child', name: i.name, number: children.find(c => c.id === i.childId)?.number, payment: i.payment ?? '', oral: !!i.oral, absent: !!i.absent, moved: !!i.moved, note: i.note || undefined, childId: i.childId ?? undefined, source: 'override' }
    : { status: i.status, payment: '', oral: false, absent: false, moved: false, source: 'override' }, [children]);
  const view = useMemo(() => {
    const fixed = new Map(board.fixed), open = new Map(board.open);
    const pend = new Set<string>();
    for (const o of ops.values()) {
      const k = `${o.teacherId}|${o.time}`;
      const side: Side = o.kind === 'day' ? o.side : 'fixed';
      const target = side === 'open' ? open : fixed;
      const v = o.input === 'reset' ? (o.kind === 'day' && side === 'fixed' ? base.get(k) : undefined) : preview(o.input);
      if (v) target.set(k, v); else target.delete(k);
      pend.add(`${side}|${k}`);
    }
    return { fixed, open, pend };
  }, [board, ops, base, preview]);

  // 그날 더한·뺀 선생님 = 디비 + 저장 안 한 변경
  const dbAssign = (id: string): AssignState => assigns.removed.includes(id) ? 'off' : assigns.added.includes(id) ? 'add' : null;
  const assignOf = (id: string): AssignState => assignDraft.has(id) ? assignDraft.get(id)! : dbAssign(id);

  // 이 센터·요일에 일하는 선생님 + 그날만 더한 선생님 + (혹시) 칸이 채워져 있는 선생님 − 그날만 뺀 선생님
  const wd = mode === 'day' ? parseYmd(day).getDay() : weekday;
  const hasCellsOf = (id: string) => [...board.fixed.keys(), ...board.open.keys()].some(k => k.startsWith(`${id}|`));
  const shown = teachers.filter(t => {
    const st = mode === 'day' ? assignOf(t.id) : null;
    if (st === 'off') return false;
    return worksAt(t, center, wd) || st === 'add' || hasCellsOf(t.id);
  });
  const addable = teachers.filter(t => !shown.some(x => x.id === t.id));
  const setAssign = (id: string, st: AssignState) => setAssignDraft(m => {
    const n = new Map(m);
    if (st === dbAssign(id)) n.delete(id); else n.set(id, st);
    return n;
  });
  const rows = useMemo(() => (mode === 'day' ? rowsForDay(day) : rowsForWeekday(weekday)), [mode, day, weekday]);
  const d = parseYmd(day);

  // 칸 변경은 바로 저장하지 않고 쌓아 둔다
  const opKey = (o: Op) => o.kind === 'fixed' ? `fixed|${o.teacherId}|${o.time}` : `day|${o.teacherId}|${o.time}|${o.kind === 'weekly' ? 'fixed' : o.side}`;
  const putOps = (list: Op[]) => setOps(m => { const n = new Map(m); for (const o of list) n.set(opKey(o), o); return n; });
  const stage = ({ teacher, time, side }: Editing, input: CellInput | 'reset', weekly?: boolean) => {
    const o: Op = weekly && input !== 'reset' && input.status === 'child'
      ? { kind: 'weekly', teacherId: teacher.id, time, input }
      : mode === 'fixed' ? { kind: 'fixed', teacherId: teacher.id, time, input }
      : { kind: 'day', teacherId: teacher.id, time, side, input };
    putOps([o]);
    setEditing(null);
    setPicking(null);
  };

  // 그날 이 선생님 칸을 모두 비우는 변경들 — 고정 칸은 "이 날만 비우기", 그날 넣은 빈타임 칸은 지운다(보호자 신청은 그대로)
  const clearDayOps = (tid: string, auto: boolean): Op[] => {
    const out: Op[] = [];
    for (const time of rows) {
      const l = cellOf(view.fixed, tid, time);
      if (l.status !== 'empty' && l.status !== 'none') out.push({ kind: 'day', teacherId: tid, time, side: 'fixed', input: { status: 'none' }, auto });
      if (board.open.get(`${tid}|${time}`)?.source === 'override' || ops.has(`day|${tid}|${time}|open`))
        out.push({ kind: 'day', teacherId: tid, time, side: 'open', input: 'reset', auto });
    }
    return out;
  };
  // 선생님 시간표 비우기 — 날짜별: 그날 칸 모두 / 고정 시간표: 그 요일 고정 수업 모두
  const clearTeacher = async (t: Teacher) => {
    if (mode === 'fixed') {
      if (!(await askConfirm(`${t.name} 선생님의 ${DOW[weekday]}요일 고정 수업을 모두 비울까요?\n[스케줄 변경 완료]를 눌러야 반영돼요.`))) return;
      const list: Op[] = rows.filter(time => cellOf(view.fixed, t.id, time).status !== 'empty').map(time => ({ kind: 'fixed', teacherId: t.id, time, input: 'reset' }));
      putOps(list);
      return;
    }
    if (!(await askConfirm(`${t.name} 선생님의 이 날 시간표를 모두 비울까요?\n(보호자가 수업스케쥴로 신청한 칸은 그대로예요)\n[스케줄 변경 완료]를 눌러야 반영돼요.`))) return;
    putOps(clearDayOps(t.id, false));
    setDraft(dr => new Map([...dr].filter(([, v]) => v.teacherId !== t.id)));
  };
  // 그날만 빼기 — 표에서 숨기고 그날 칸도 모두 비운다. 결제 체크도 버린다
  const hideTeacher = async (t: Teacher) => {
    if (!(await askConfirm(`${t.name} 선생님을 이 날 시간표에서 뺄까요?\n그날 칸도 모두 비워져요(보호자 신청 칸은 그대로).\n[스케줄 변경 완료]를 누르기 전에는 [되돌리기]로 취소할 수 있어요.`))) return;
    const st: AssignState = worksAt(t, center, wd) || hasCellsOf(t.id) ? 'off' : null;
    setAssign(t.id, st);
    putOps(clearDayOps(t.id, true));
    setDraft(dr => new Map([...dr].filter(([, v]) => v.teacherId !== t.id)));
  };
  // 다시 넣기 — 저장 전에 뺐던 거면 빼기를 취소, 이미 빠진 선생님이면 그날 비운 칸을 고정 시간표대로 되돌린다
  const showTeacher = (t: Teacher) => {
    setAssign(t.id, worksAt(t, center, wd) ? null : 'add');
    const autoKeys = [...ops].filter(([, o]) => o.teacherId === t.id && o.kind === 'day' && o.auto).map(([k]) => k);
    if (autoKeys.length) { setOps(m => { const n = new Map(m); for (const k of autoKeys) n.delete(k); return n; }); return; }
    if (dbAssign(t.id) === 'off') {
      const list: Op[] = [];
      for (const [k, v] of board.fixed) if (k.startsWith(`${t.id}|`) && v.source === 'override') list.push({ kind: 'day', teacherId: t.id, time: k.split('|')[1], side: 'fixed', input: 'reset', auto: true });
      putOps(list);
    }
  };

  const applyOp = async (o: Op) => {
    if (o.kind === 'weekly') {
      // 날짜별 화면에서 "매주 고정으로 저장" — 요일 고정 수업으로 넣고, 그날 따로 바꿔 둔 칸은 지운다
      await saveFixed(d.getDay(), o.teacherId, o.time, o.input, center);
      await resetDayCell(day, o.teacherId, o.time, 'fixed', center);
      sync({ action: 'fixed', teacherId: o.teacherId, weekday: d.getDay(), time: o.time, center });
    } else if (o.kind === 'fixed') {
      if (o.input === 'reset' || o.input.status !== 'child') await deleteFixed(weekday, o.teacherId, o.time, center);
      else await saveFixed(weekday, o.teacherId, o.time, o.input, center);
      sync({ action: 'fixed', teacherId: o.teacherId, weekday, time: o.time, center });
    } else {
      if (o.input === 'reset') await resetDayCell(day, o.teacherId, o.time, o.side, center);
      else await saveDayCell(day, o.teacherId, o.time, o.side, o.input, center);
      sync({ action: 'cell', day, teacherId: o.teacherId, time: o.time, side: o.side, center });
    }
  };
  const saveSchedule = async () => {
    setSavingSched(true);
    const failedOps: string[] = [];
    const failedAssign: string[] = [];
    for (const [k, o] of ops) {
      try { await applyOp(o); } catch { failedOps.push(k); }
    }
    for (const [id, st] of assignDraft) {
      try { await setDayAssign(day, id, center, st); } catch { failedAssign.push(id); }
    }
    setOps(m => new Map([...m].filter(([k]) => failedOps.includes(k))));
    setAssignDraft(m => new Map([...m].filter(([id]) => failedAssign.includes(id))));
    setSavingSched(false);
    await load();
    if (failedOps.length + failedAssign.length) showAlert(`${failedOps.length + failedAssign.length}건을 저장하지 못했어요. 다시 [스케줄 변경 완료]를 눌러 주세요.`);
  };

  // 수업 후 결제 체크 — 먼저 표에만 표시하고, [결제 완료]에서 한꺼번에 저장한다
  const keyOf = (childId: string, time: string) => `${childId}|${time}`;
  const sameEntry = (a?: PayEntry | null, b?: PayEntry | null) => (a?.method ?? null) === (b?.method ?? null) && (a?.note ?? '') === (b?.note ?? '');
  const paidOf = (childId: string, time: string): PayEntry | undefined => {
    const k = keyOf(childId, time);
    return draft.has(k) ? draft.get(k)!.entry ?? undefined : payments.get(k);
  };
  const pay = (childId: string, teacherId: string, time: string, entry: PayEntry | null) => {
    const k = keyOf(childId, time);
    setDraft(dr => {
      const n = new Map(dr);
      if (sameEntry(payments.get(k), entry)) n.delete(k);   // 디비와 같아지면 바꿀 것 없음
      else n.set(k, { entry, childId, teacherId, time });
      return n;
    });
  };
  const savePayments = async () => {
    setSavingPay(true);
    const failedKeys: string[] = [];
    const shownIds = new Set(shown.map(t => t.id));
    for (const [k, v] of draft) {
      if (!shownIds.has(v.teacherId)) continue;   // 숨긴 선생님 수업 결제는 반영하지 않는다
      try { await setLessonPayment(v.childId, day, v.time, v.teacherId, center, v.entry); }
      catch { failedKeys.push(k); }
    }
    setDraft(dr => new Map([...dr].filter(([k, v]) => failedKeys.includes(k) && shownIds.has(v.teacherId))));
    setSavingPay(false);
    await load();
    if (failedKeys.length) showAlert(`${failedKeys.length}건을 저장하지 못했어요. 다시 [결제 완료]를 눌러 주세요.`);
  };

  // 남은 횟수 — 바우처·굳센·꿈이든은 이번 달 제공 횟수에서, 선결제는 지금까지 충전한 횟수에서 사용한 만큼 뺀다(저장 전 체크도 셈)
  const remaining = (childId: string, method: PayMethod): string | undefined => {
    const c = children.find(x => x.id === childId);
    // 횟수가 있는 결제만 (신용카드·현금·직접 작성은 횟수 없음)
    if (!c || (method !== 'voucher' && method !== 'gusen' && method !== 'kkumideun' && method !== 'prepaid')) return undefined;
    const limit = { voucher: c.voucherLimit, gusen: c.gusenLimit, kkumideun: c.kkumideunLimit, prepaid: c.prepaidTotal }[method] ?? 0;
    if (!limit) return undefined;
    let used = counts.get(childId)?.[method] ?? 0;
    for (const v of draft.values()) {
      if (v.childId !== childId) continue;
      if (payments.get(keyOf(v.childId, v.time))?.method === method) used--;
      if (v.entry?.method === method) used++;
    }
    return method === 'prepaid' ? `${limit - used}` : `${limit - used}/${limit}`;
  };

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
            <button key={cn.key} onClick={() => guard(() => setCenter(cn.key))}
              className={`text-[14px] px-4 py-2 border-b-2 ${center === cn.key ? 'border-[var(--brand)] text-[var(--brand)]' : 'border-transparent text-[#999] hover:text-[#333]'}`}>{cn.label}</button>
          ))}
          <span className="w-4" />
          {([['day', '날짜별'], ['fixed', '고정 시간표']] as const).map(([m, n]) => (
            <button key={m} onClick={() => guard(() => setMode(m))}
              className={`text-[13px] px-4 py-2 border ${mode === m ? 'border-[var(--brand)] bg-[var(--brand)] text-white' : 'border-[#e5e5e5] hover:bg-[#f8f8f8]'}`}>{n}</button>
          ))}
          <span className="w-4" />
          {mode === 'day' ? (
            <>
              <button onClick={() => guard(() => setDay(x => addDays(x, -1)))} className="text-[13px] border border-[#e5e5e5] w-8 h-8 hover:bg-[#f8f8f8]" aria-label="전날">‹</button>
              <input type="date" value={day} onChange={e => { const v = e.target.value; if (v) guard(() => setDay(v)); }} className="text-[13px] border border-[#ddd] px-2 h-8" />
              <button onClick={() => guard(() => setDay(x => addDays(x, 1)))} className="text-[13px] border border-[#e5e5e5] w-8 h-8 hover:bg-[#f8f8f8]" aria-label="다음날">›</button>
              <button onClick={() => guard(() => setDay(toYmd(new Date())))} className="text-[12px] text-[#888] underline underline-offset-2 ml-1">오늘</button>
              {addable.length > 0 && (
                <select value="" onChange={e => { const t = teachers.find(x => x.id === e.target.value); if (t) showTeacher(t); }}
                  className="ml-2 text-[12px] border border-[#f59e0b] text-[#b45309] bg-white px-2 h-8" title="공휴일 등 그날만 이 센터에서 일하는 선생님">
                  <option value="">+ 이 날 선생님 추가</option>
                  {addable.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              )}
            </>
          ) : (
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5, 6].map(w => (
                <button key={w} onClick={() => guard(() => setWeekday(w))}
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
          <span className="text-[11px] text-[#999]">칸을 고친 뒤 아래 [스케줄 변경 완료]를 누르면 디비와 캘린더에 반영돼요. 어긋났을 때만 전체 반영을 눌러 주세요.</span>
          {syncMsg && <span className="text-[12px] text-red-400">{syncMsg}</span>}
        </div>
        {failed && <p className="text-[13px] text-red-400 mb-3">불러오지 못했어요 — 시간표 SQL(supabase/timetable.sql)을 실행했는지 확인해 주세요. ({failed})</p>}

        {/* 표 — 이 센터 선생님만. 접은 선생님은 이름 칸만 좁게 */}
        <div className="overflow-x-auto bg-white">
          <table className="border-collapse text-[12px] min-w-full">
            <thead>
              <tr>
                <th className={`${th} sticky left-0 z-10 bg-white w-16`}>시간</th>
                <th className={`${th} text-[14px] text-[#c026d3]`} colSpan={shown.reduce((n, t) => n + (folded.has(t.name) ? 1 : mode === 'day' ? 3 : 1), 0) || 1}>
                  {mode === 'day' ? `${DOW[d.getDay()]} / ${d.getMonth() + 1}월 ${d.getDate()}일` : `${DOW[weekday]}요일 고정 시간표`}
                  {mode === 'day' && holiday && <span className="ml-2 text-[12px] text-red-400">공휴일 — 고정 수업 없음</span>}
                </th>
              </tr>
              <tr>
                <th className={`${th} sticky left-0 z-10 bg-white`} />
                {shown.map(t => (
                  <th key={t.id} colSpan={folded.has(t.name) ? 1 : mode === 'day' ? 3 : 1} className={`${th} text-[14px] text-[#16a34a] whitespace-nowrap`}>
                    <button type="button" onClick={() => toggleFold(t.name)} title={folded.has(t.name) ? '펼치기' : '접기'}
                      className="inline-flex items-center gap-1 hover:opacity-70">
                      {t.name}<span className="text-[10px] text-[#aaa]">{folded.has(t.name) ? '▸' : '◂'}</span>
                    </button>
                    {!folded.has(t.name) && (
                      <button type="button" onClick={() => clearTeacher(t)}
                        className="ml-1 text-[10px] rounded px-1 border text-[#a1a1aa] border-[#e4e4e7] hover:text-red-400"
                        title={mode === 'day' ? '이 날 이 선생님 칸 모두 비우기' : '이 요일 고정 수업 모두 비우기'}>비우기</button>
                    )}
                    {mode === 'day' && (
                      <button type="button" onClick={() => hideTeacher(t)}
                        className={`ml-1 text-[10px] rounded px-1 border ${assignOf(t.id) === 'add' ? 'text-[#f59e0b] border-[#fcd34d]' : 'text-[#a1a1aa] border-[#e4e4e7] hover:text-red-400'}`}
                        title="이 날만 시간표에서 빼기 (칸도 비워져요)">✕ 빼기</button>
                    )}
                  </th>
                ))}
              </tr>
              {mode === 'day' && (
                <tr>
                  <th className={`${th} sticky left-0 z-10 bg-white`} />
                  {shown.map(t => folded.has(t.name) ? <th key={t.id} className={`${th} text-[10px] text-[#ccc] w-6`}>접음</th> : (
                    <FragmentPair key={t.id} left={<th className={`${th} text-[10px] text-[#999] min-w-[84px]`}>고정</th>} right={<>
                      <th className={`${th} text-[10px] text-[#999] min-w-[84px]`}>빈타임</th>
                      <th className={`${th} text-[10px] text-[#16a34a] min-w-[64px]`}>결제방식</th>
                    </>} />
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
                    const left = cellOf(view.fixed, t.id, time);
                    const right = cellOf(view.open, t.id, time);
                    const pendL = view.pend.has(`fixed|${t.id}|${time}`);
                    const pendR = view.pend.has(`open|${t.id}|${time}`);
                    return (
                      <FragmentPair key={t.id}
                        left={
                          <td className={`${td} min-w-[84px] ${pendL ? 'bg-[#fff6d5]' : mode === 'day' && right.status === 'child' ? 'bg-[#f4f4f5]' : ''}`} onClick={() => setEditing({ teacher: t, time, side: 'fixed', cell: left })}>
                            {/* 빈타임에 아이가 채워지면 옆 고정 칸은 회색으로 흐리게 */}
                            <CellText cell={left} label={ROW_LABEL[time]} muted={mode === 'day' && right.status === 'child'} />
                          </td>
                        }
                        right={mode === 'day' ? (<>
                          <td className={`${td} min-w-[84px] ${pendR ? 'bg-[#fff6d5]' : 'bg-[#fcfcfd]'}`} onClick={e => {
                            // 보호자 신청 칸은 안내가 있는 창으로, 그 밖은 칸 아래로 아이 명단을 연다
                            if (right.source === 'booking') { setEditing({ teacher: t, time, side: 'open', cell: right }); return; }
                            const b = e.currentTarget.getBoundingClientRect();
                            setPicking({ teacher: t, time, side: 'open', cell: right, rect: { left: b.left, top: b.top, bottom: b.bottom } });
                          }}>
                            <CellText cell={right} label={ROW_LABEL[time]} />
                          </td>
                          <td className="border border-[#e4e4e7] h-9 px-1 text-center align-middle whitespace-nowrap bg-[#f9fdfa]">
                            {/* 빈타임에 아이가 채워지면 그 아이 결제만 (옆 고정 칸은 흐리게 = 그 시간엔 빈타임 아이 수업) */}
                            {(right.status === 'child' ? [right] : [left]).filter(c => c.status === 'child' && !c.moved).map((c, i) => (
                              <PayCell key={i} cell={c} paid={c.childId ? paidOf(c.childId, time) : undefined}
                                pending={!!c.childId && draft.has(keyOf(c.childId, time))}
                                left={c.childId ? (m => remaining(c.childId!, m)) : undefined}
                                onPay={c.childId ? e => pay(c.childId!, t.id, time, e) : undefined} />
                            ))}
                          </td>
                        </>) : null}
                      />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 저장 버튼 — 시간표 변경과 결제 체크는 따로 확정한다 */}
        <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-end gap-x-3 gap-y-2 bg-white/95 border-t border-[#eee] py-3 mt-2">
          <span className="text-[12px] text-[#888]">
            {ops.size + assignDraft.size ? `저장 안 한 시간표 변경 ${ops.size + assignDraft.size}건 — 노란 칸` : '칸을 고친 뒤 [스케줄 변경 완료]를 눌러 주세요.'}
          </span>
          {ops.size + assignDraft.size > 0 && (
            <button onClick={() => { setOps(new Map()); setAssignDraft(new Map()); }} disabled={savingSched} className="text-[13px] border border-[#ddd] px-4 py-2 hover:bg-[#f8f8f8]">되돌리기</button>
          )}
          <button onClick={saveSchedule} disabled={!(ops.size + assignDraft.size) || savingSched}
            className="text-[13px] border border-[var(--brand)] bg-[var(--brand)] text-white px-5 py-2 hover:opacity-90 disabled:opacity-40">
            {savingSched ? '저장 중…' : '스케줄 변경 완료'}
          </button>
          {mode === 'day' && (
            <>
              <span className="w-px h-6 bg-[#e5e5e5] mx-1" />
              <span className="text-[12px] text-[#888]">{draft.size ? `저장 안 한 결제 체크 ${draft.size}건 — 파란 칸` : '결제방식을 다 고른 뒤 [결제 완료]'}</span>
              {draft.size > 0 && (
                <button onClick={() => setDraft(new Map())} disabled={savingPay} className="text-[13px] border border-[#ddd] px-4 py-2 hover:bg-[#f8f8f8]">되돌리기</button>
              )}
              <button onClick={savePayments} disabled={!draft.size || savingPay}
                className="text-[13px] border border-[#16a34a] bg-[#16a34a] text-white px-5 py-2 hover:opacity-90 disabled:opacity-40">
                {savingPay ? '저장 중…' : '결제 완료'}
              </button>
            </>
          )}
        </div>

        <p className="text-[11px] text-[#999] mt-3 leading-[2]">
          칸을 누르면 고칠 수 있어요. 앞 숫자 = 같은 이름 구분 · 줄 = 다른 선생님에게 옮김 · ? = 미정
          {mode === 'day' && <> · 빈타임의 &quot;신청&quot; = 보호자가 수업스케쥴에서 신청 · 결제방식: 기본 결제 → <span className="bg-[#e3edfc] text-[#1d4ed8] px-1 rounded">파랑 = 직접 고름</span> → [결제 완료] → <span className="bg-[#fde2e2] text-[#b91c1c] px-1 rounded">✓ 빨강 = 확정</span></>}
        </p>
      </div>

      {editing && (
        <CellEditor
          editing={editing}
          mode={mode}
          dayLabel={mode === 'day' ? `${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]})` : `${DOW[weekday]}요일 고정`}
          kids={children}
          onClose={() => setEditing(null)}
          onSave={(input, weekly) => stage(editing, input, weekly)}
        />
      )}

      {picking && (
        <ChildPicker
          picking={picking}
          kids={children}
          onPick={c => stage(picking, { status: 'child', childId: c.id, name: c.name, payment: c.payment, oral: !!c.oral, absent: false, moved: false })}
          onSave={input => stage(picking, input)}
          onMore={() => { setEditing(picking); setPicking(null); }}
          onClose={() => setPicking(null)}
        />
      )}
    </div>
  );
}

function FragmentPair({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return <>{left}{right}</>;
}

/** 칸 글자 — 3김채현 처럼 (숫자 + 이름) */
function CellText({ cell, label, muted }: { cell: CellView; label?: string; muted?: boolean }) {
  if (cell.status === 'empty' || cell.status === 'none') {
    return label ? <span className="text-[#c4c4cc]">{label}</span> : null;
  }
  if (cell.status === 'undecided') return <span className="text-[#71717a]">?</span>;
  if (cell.status === 'off') return <span className="text-[#a1a1aa]">수업 안 함</span>;
  return (
    <span title={cell.note} className={`${muted ? 'text-[#8a8a93]' : 'text-[#27272a]'} ${cell.moved ? 'line-through' : ''} ${cell.absent ? 'opacity-50' : ''}`}>
      {cell.number ?? ''}{cell.name}
      {cell.absent && <span className="ml-0.5 text-[9px] text-[#a1a1aa]">결석</span>}
      {cell.source === 'booking' && <span className="ml-0.5 text-[9px] text-[#a1a1aa]">신청</span>}
      {cell.subName && <span className="block text-[9px] leading-[1.2] text-[#a1a1aa]">{cell.subName}</span>}
      {cell.note && <span className="ml-0.5 text-[9px] text-[#f59e0b]">●</span>}
    </span>
  );
}

/** 결제방식 칸 — 체크 전엔 기본 결제를 흐리게, 체크하면 초록 ✓와 남은 횟수(바우처 2/3, 선결제 33). 누르면 드롭박스로 고르고, 직접 적을 수도 있다 */
function PayCell({ cell, paid, pending, left, onPay }: {
  cell: CellView;
  paid?: PayEntry;
  /** 저장 안 한 체크 */
  pending?: boolean;
  left?: (m: PayMethod) => string | undefined;
  onPay?: (e: PayEntry | null) => void;
}) {
  if (cell.absent) return <span className="block text-[10px] text-[#c4c4cc]">결석</span>;
  const base = defaultMethod(cell.payment);
  const label = (k?: PayMethod) => PAY_METHODS.find(m => m.key === k)?.label;
  const rest = paid && left?.(paid.method);
  // 단계 — 기본(그대로) / 파랑: 직접 고름(저장 전) / 빨강: 결제 완료로 확정
  const tone = pending ? 'bg-[#e3edfc] text-[#1d4ed8]' : paid ? 'bg-[#fde2e2] text-[#b91c1c]' : 'text-[#27272a]';
  const text = paid
    ? <span>{pending ? '' : '✓'}{paid.note || label(paid.method)}{rest && <span className="ml-0.5 text-[10px] opacity-80">{rest}</span>}</span>
    : <span>{pending ? '체크 풀기' : (label(base) ?? '')}</span>;
  if (!onPay) return <span className="block text-[11px] text-[#27272a]" title="아이 명단에 없는 이름이라 체크할 수 없어요">{label(base) ?? ''}</span>;
  return (
    <label className={`relative block min-h-[20px] text-[11px] cursor-pointer rounded px-1 ${tone}`}
      title={pending ? '저장 전 — [결제 완료]를 눌러야 확정돼요' : paid ? '결제 완료로 확정됨' : '기본 결제 — 눌러서 고르기'}>
      {text}
      <select value={paid ? (paid.note ? 'custom' : paid.method) : ''}
        onChange={async e => {
          const v = e.target.value;
          if (!v) onPay(null);
          else if (v === 'custom') {
            const t = await askPrompt('결제 방식을 적어 주세요', paid?.note ?? '');
            if (t?.trim()) onPay({ method: 'other', note: t.trim() });
          } else onPay({ method: v as PayMethod });
        }}
        className="absolute inset-0 w-full opacity-0 cursor-pointer" aria-label={`${cell.name} 결제 체크`}>
        <option value="">체크 안 함{base ? ` (기본 ${label(base)})` : ''}</option>
        {PAY_METHODS.map(m => <option key={m.key} value={m.key}>{m.label}{m.key === base ? ' (기본)' : ''}</option>)}
        <option value="custom">{paid?.note ? `${paid.note} (고치기)` : '직접 작성…'}</option>
      </select>
    </label>
  );
}

/** 빈타임 칸 아래로 열리는 아이 명단 — 맨 위에 적으면 검색, 누르면 바로 저장 */
function ChildPicker({ picking, kids, onPick, onSave, onMore, onClose }: {
  picking: Picking;
  kids: Child[];
  onPick: (c: Child) => void;
  onSave: (input: CellInput | 'reset') => void;
  onMore: () => void;
  onClose: () => void;
}) {
  const { cell, rect } = picking;
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const list = kids.filter(c => !query || c.name.toLowerCase().includes(query) || (c.memberCode ?? '').toLowerCase().includes(query));
  // 화면 아래쪽 칸이면 위로 연다
  const W = 240, H = 340;
  const below = rect.bottom + H < window.innerHeight;
  const style: React.CSSProperties = {
    left: Math.max(8, Math.min(rect.left, window.innerWidth - W - 8)),
    ...(below ? { top: rect.bottom + 2 } : { bottom: window.innerHeight - rect.top + 2 }),
    width: W,
  };
  const btn = 'text-[11px] px-2 py-1 border border-[#ddd] rounded-full hover:bg-[#f4f4f5]';

  return (
    <div className="fixed inset-0 z-[500]" onClick={onClose}>
      <div className="fixed bg-white border border-[#d4d4d8] rounded-lg shadow-xl flex flex-col" style={style} onClick={e => e.stopPropagation()}>
        <input value={q} onChange={e => setQ(e.target.value)} autoFocus placeholder="아이 이름 검색"
          onKeyDown={e => { if (e.key === 'Enter' && list[0]) onPick(list[0]); if (e.key === 'Escape') onClose(); }}
          className="m-2 border-b border-[#ddd] py-1 text-[14px] outline-none focus:border-[var(--brand)]" />
        <ul className="max-h-[220px] overflow-y-auto">
          {list.map(c => (
            <li key={c.id}>
              <button type="button" onClick={() => onPick(c)}
                className={`w-full text-left px-3 py-1.5 text-[13px] hover:bg-[#f0f6fe] ${cell.childId === c.id ? 'bg-[#f0f6fe]' : ''}`}>
                {c.number ?? ''}{c.name}
                {c.memberCode && <span className="ml-1 text-[10px] text-[#bbb]">{c.memberCode}</span>}
              </button>
            </li>
          ))}
          {!list.length && <li className="px-3 py-2 text-[12px] text-[#aaa]">명단에 없어요. 아이 명단에 먼저 넣어 주세요.</li>}
        </ul>
        <div className="flex flex-wrap gap-1 p-2 border-t border-[#eee]">
          {cell.source === 'override' && <button type="button" onClick={() => onSave('reset')} className={`${btn} text-red-400`}>비우기</button>}
          <button type="button" onClick={() => onSave({ status: 'undecided' })} className={btn}>? 미정</button>
          <button type="button" onClick={() => onSave({ status: 'off' })} className={btn}>x 수업 안 함</button>
          <button type="button" onClick={onMore} className={`${btn} text-[#888]`}>자세히…</button>
        </div>
      </div>
    </div>
  );
}

function CellEditor({ editing, mode, dayLabel, kids, onClose, onSave }: {
  editing: Editing;
  mode: Mode;
  dayLabel: string;
  kids: Child[];
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
    if (c) setPayment(c.payment);   // 결제는 아이 명단의 기본 결제를 따른다 (그날 결제는 표의 결제방식 칸에서)
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

        <div>
          <label className="block">
            <span className="block text-[11px] text-[#999] mb-1">아이 이름</span>
            <input list="tt-children" value={name} onChange={e => pickName(e.target.value)} autoFocus placeholder="이름 (비우면 빈 칸)"
              className="w-full border-b border-[#ddd] py-1.5 text-[15px] outline-none focus:border-[var(--brand)]" />
            <datalist id="tt-children">
              {kids.map(c => <option key={c.id} value={c.name}>{c.number ? `${c.number} ${c.name}` : c.name}</option>)}
            </datalist>
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
