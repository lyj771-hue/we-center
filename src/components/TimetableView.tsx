'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAdmin } from '@/components/AdminContext';
import Portal from '@/components/Portal';
import { downloadCsv, downloadXlsx, type Cell, type Sheet } from '@/lib/exportFile';
import { askChoice, askConfirm, askPrompt, showAlert } from '@/lib/dialog';
import { addAdminLog } from '@/lib/adminLog';
import type { Teacher } from '@/lib/schedule';
import { addDays, addTeacherWorkDay, getKoreanHolidays, getPostedOpenSlots, getTeachers, HIDDEN_TEACHERS, parseYmd, removeTeacherWorkDay, toYmd } from '@/lib/schedule';
import type { CellInput, CellView, Center, Child, LessonKind, PayCount, PayEntry, PayMethod } from '@/lib/timetable';
import TeacherLeaveDialog, { type LeaveLesson } from '@/components/TeacherLeaveDialog';
import { addAndSendOutbox, getDayLeaves, type TeacherLeave } from '@/lib/leave';
import { getMembers } from '@/lib/store';
import { notifyFixedChanges, notifyLessonDay, notifyPrepaidUses, sendSummary } from '@/lib/alimtalkNotify';
import { notifyScheduleChanged, onScheduleChanged } from '@/lib/sync';
import {
  CENTERS, LESSON_KINDS, PAY_METHODS, payMethodsFor, ROW_LABEL, kindLabel, cellOf, getDayAssigns, getDayPayments, getMonthRoundLessons, defaultPayMethod, getPaymentCounts, ROUND_LIMIT, setDayAssign, setLessonPayment, worksAt, getChildren, getDayBoard, getFixedBoard, resetDayCell,
  rowsForDay, rowsForWeekday, restoreBookedSlot, saveDayCell, saveFixedFrom, clearChildTestData, getFixedByChild,
  getLaterPayments, isLaterPay, roundMethod,
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

/** 아직 저장 안 한 시간표 변경 — [스케줄 변경 완료]에서 차례로 디비에 반영한다.
 *  day = 날짜별 칸, from = 날짜별 화면에서 "이 날부터 고정"(null = 이 날부터 고정 수업 없음), fixed = 고정 시간표 칸.
 *  auto = 선생님 빼기로 생긴 변경(다시 넣으면 같이 취소) */
type Op =
  | { kind: 'day'; teacherId: string; time: string; side: Side; input: CellInput | 'reset'; auto?: boolean; restore?: { name: string; teacherName: string } }
  | { kind: 'from'; teacherId: string; time: string; input: CellInput | null }
  | { kind: 'fixed'; teacherId: string; time: string; input: CellInput | 'reset'; start?: string };
type AssignState = 'add' | 'off' | null;

/** 빈타임 칸 아래로 여는 아이 고르기 — 칸 위치(rect)에 붙여 띄운다 */
interface Picking extends Editing {
  rect: { left: number; top: number; bottom: number };
}

/** 결제 글자(b·e·c …) → 기본 결제. 모르는 글자면 없음 */
const defaultMethod = defaultPayMethod;

/** testChildName 을 주면 "시간표(테스트)" — 그 아이 수업만 보이고 고칠 수 있다(저장은 실제 디비). 다른 아이 칸은 잠긴다 */
/** fixedCenter 를 주면 그 센터(수색/의정부) 시간표만 — 센터 탭을 숨긴다 */
export default function TimetableView({ testChildName, fixedCenter }: { testChildName?: string; fixedCenter?: Center } = {}) {
  const { isAdmin } = useAdmin();
  const [mode, setMode] = useState<Mode>('day');
  const [center, setCenter] = useState<Center>(fixedCenter ?? 'eunpyeong');
  // 접어 둔 선생님(이름만 보이고 칸은 숨김) — 이원재 선생님은 병가라 처음부터 접어 둔다
  const [folded, setFolded] = useState<Set<string>>(() => new Set(HIDDEN_TEACHERS));
  const toggleFold = (name: string) => setFolded(f => { const n = new Set(f); if (n.has(name)) n.delete(name); else n.add(name); return n; });
  const [day, setDay] = useState(() => toYmd(new Date()));
  const [weekday, setWeekday] = useState(() => new Date().getDay());
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  // 그날 결제 체크(디비) — "아이|시간" → 결제
  const [payments, setPayments] = useState<Map<string, PayEntry>>(new Map());
  // 아직 저장 안 한 결제 체크 — 다 고르고 [결제 완료]를 누르면 디비에 반영된다 (null = 체크 풀기)
  const [draft, setDraft] = useState<Map<string, { entry: PayEntry | null; childId: string; teacherId: string; time: string }>>(new Map());
  // 아이마다 이번 달 바우처·굳센·꿈이든, 지금까지 선결제 사용 횟수(디비)
  const [counts, setCounts] = useState<Map<string, PayCount>>(new Map());
  // 이번 달 1일~그날 두 센터의 바우처·굳센·꿈이든 수업(결제 전이면 기본 결제로) — 결제방식 칸에 "바우처3"처럼 월 회차를 붙인다
  const [roundPays, setRoundPays] = useState<{ childId: string; day: string; time: string; method: PayMethod }[]>([]);
  const [savingPay, setSavingPay] = useState(false);
  // 아직 결제 안 한 소급·미결(이 센터 전부) — 시간표 관리 위 안내
  const [laterPays, setLaterPays] = useState<{ day: string; method: PayMethod }[]>([]);
  // 그날만 이 센터에 더한 선생님(공휴일 등)·뺀 선생님
  const [assigns, setAssigns] = useState<{ added: string[]; removed: string[] }>({ added: [], removed: [] });
  const [board, setBoard] = useState<{ fixed: Map<string, CellView>; open: Map<string, CellView> }>({ fixed: new Map(), open: new Map() });
  // 날짜별 화면: 그 요일 고정 수업 (칸을 "고정 시간표대로" 되돌릴 때 미리 보여 주려고)
  const [base, setBase] = useState<Map<string, CellView>>(new Map());
  // 저장 안 한 시간표 변경 · 선생님 빼기/더하기
  const [ops, setOps] = useState<Map<string, Op>>(new Map());
  const [assignDraft, setAssignDraft] = useState<Map<string, AssignState>>(new Map());
  // 선생님 휴무 — 그날 휴무 기록, [휴무] 창을 연 선생님
  const [leaves, setLeaves] = useState<TeacherLeave[]>([]);
  const [leaveFor, setLeaveFor] = useState<Teacher | null>(null);
  const [savingSched, setSavingSched] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  // 그날이 공휴일인지 — 공휴일엔 요일 고정 수업을 비운다(그날 따로 넣은 칸·보호자 신청은 그대로)
  const [holiday, setHoliday] = useState(false);
  const [picking, setPicking] = useState<Picking | null>(null);
  const [failed, setFailed] = useState('');
  // 그날 게시 중인 시간("선생님|시간") — 쉬는 시간을 연 칸은 쉬는 시간 글씨 대신 빈칸으로
  const [postedOpen, setPostedOpen] = useState<Map<string, string>>(new Map());

  const load = useCallback(async () => {
    try {
      const [t, c] = await Promise.all([getTeachers({ includeHidden: true }), getChildren()]);   // 빼 둔 선생님(이원재)도 — 맨 오른쪽, 처음엔 접힘
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
        setRoundPays(await getMonthRoundLessons(day, c).catch(() => []));
        setAssigns(await getDayAssigns(day, center).catch(() => ({ added: [], removed: [] })));
        setLeaves(await getDayLeaves(day, center).catch(() => []));
        setPostedOpen(await getPostedOpenSlots(day, center).catch(() => new Map<string, string>()));
      }
      else setBoard({ fixed: await getFixedBoard(weekday, c, center), open: new Map() });
      setLaterPays(await getLaterPayments(center).catch(() => []));
      setFailed('');
    } catch (e) {
      setFailed((e as Error).message);
    }
  }, [mode, day, weekday, center]);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);
  // 다른 화면(선생님 시간표·수업스케쥴 신청)에서 바뀌면 바로 다시 읽는다 — 저장 안 한 변경은 그대로 남는다
  useEffect(() => { if (!isAdmin) return; return onScheduleChanged(() => load()); }, [isAdmin, load]);

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

  // 월별 내려받기 — 그 달 날짜별 시간표를 주마다 시트 하나로 (이 센터)
  const [exportMonth, setExportMonth] = useState(() => toYmd(new Date()).slice(0, 7));
  const [exporting, setExporting] = useState('');
  const buildMonthSheets = async (ym: string): Promise<Sheet[]> => {
    const [y, m] = ym.split('-').map(Number);
    const last = new Date(y, m, 0).getDate();
    const days = Array.from({ length: last }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`).filter(dd => parseYmd(dd).getDay() !== 0);
    const hols = await getKoreanHolidays(String(y)).catch(() => [] as string[]);
    const label = (k?: PayMethod) => PAY_METHODS.find(x => x.key === k)?.label ?? '';
    const txt = (c: CellView) => c.status === 'undecided' ? '?' : c.status === 'off' ? '수업 안 함' : c.status !== 'child' ? ''
      : `${c.name ?? ''}${c.number ?? ''}${kindLabel(c.kind) ? ` ${kindLabel(c.kind)}` : ''}${c.absent ? ' 결석' : ''}${c.moved ? ' 옮김' : ''}${c.source === 'booking' ? ' (신청)' : ''}`;
    const perDay: Record<string, Cell[][]> = {};
    for (let i = 0; i < days.length; i += 4) {
      await Promise.all(days.slice(i, i + 4).map(async dd => {
        setExporting(`${dd.slice(5).replace('-', '/')} 불러오는 중…`);
        const [b, pays, asg] = await Promise.all([getDayBoard(dd, children, center), getDayPayments(dd).catch(() => new Map<string, PayEntry>()), getDayAssigns(dd, center).catch(() => ({ added: [] as string[], removed: [] as string[] }))]);
        const holiday = hols.includes(dd);
        if (holiday) for (const [k, v] of b.fixed) if (v.source === 'fixed') b.fixed.delete(k);
        const wdd = parseYmd(dd).getDay();
        const has = new Set([...b.fixed.keys(), ...b.open.keys()].map(k => k.split('|')[0]));
        const ts = teachers.filter(t => !asg.removed.includes(t.id) && (worksAt(t, center, wdd) || asg.added.includes(t.id) || has.has(t.id)));
        const dt = parseYmd(dd);
        const out: Cell[][] = [];
        out.push([`${dt.getMonth() + 1}/${dt.getDate()}(${DOW[wdd]})${holiday ? ' 공휴일' : ''}`]);
        out.push(['시간', ...ts.flatMap(t => [t.name, '', ''])]);
        out.push(['', ...ts.flatMap(() => ['고정', '빈타임', '결제방식'])]);
        for (const time of rowsForDay(dd, [...b.fixed.keys(), ...b.open.keys()], center)) {
          const row: Cell[] = [`${time.replace(/^0/, '')}${ROW_LABEL[time] ? ` ${ROW_LABEL[time]}` : ''}`];
          for (const t of ts) {
            const l = cellOf(b.fixed, t.id, time), rr = cellOf(b.open, t.id, time);
            const c = rr.status === 'child' ? rr : l;
            let pay = '';
            if (c.status === 'child' && !c.moved && !c.absent) {
              const e = c.childId ? pays.get(`${c.childId}|${time}`) : undefined;
              pay = e ? `${e.note || label(e.method)}${e.confirmed ? '' : ' (선택)'}` : rr.status === 'child' ? '' : label(defaultMethod(c.payment));
            }
            row.push(txt(l), txt(rr), pay);
          }
          out.push(row);
        }
        perDay[dd] = out;
      }));
    }
    // 주(월요일 시작)마다 시트 하나 — 날짜별 표를 위에서 아래로 이어 붙인다
    const weeks = new Map<string, string[]>();
    for (const dd of days) {
      const mon = addDays(dd, -((parseYmd(dd).getDay() + 6) % 7));
      weeks.set(mon, [...(weeks.get(mon) ?? []), dd]);
    }
    return [...weeks.values()].map((ds, i) => {
      const a = parseYmd(ds[0]), z = parseYmd(ds[ds.length - 1]);
      const rows: Cell[][] = [[`${CENTERS.find(c => c.key === center)?.label} 시간표 · ${m}월 ${i + 1}주 (${a.getMonth() + 1}/${a.getDate()}~${z.getMonth() + 1}/${z.getDate()})`], []];
      for (const dd of ds) rows.push(...perDay[dd], []);
      return { name: `${m}월 ${i + 1}주 (${a.getDate()}~${z.getDate()}일)`, rows, cols: [12, ...Array(60).fill(11)] };
    });
  };
  const exportFile = async (kind: 'xlsx' | 'csv') => {
    try {
      setExporting('불러오는 중…');
      const sheets = await buildMonthSheets(exportMonth);
      const name = `시간표_${CENTERS.find(c => c.key === center)?.label}_${exportMonth.replace('-', '')}`;
      if (kind === 'xlsx') await downloadXlsx(sheets, name); else downloadCsv(sheets, name);
    } catch (e) {
      showAlert(`내려받지 못했어요.\n${(e as Error).message}`);
    } finally {
      setExporting('');
    }
  };

  // 표에 보이는 칸 = 디비 칸 + 저장 안 한 변경. pend = 바뀐 칸("fixed|선생님|시간" / "open|…")
  const preview = useCallback((i: CellInput): CellView => i.status === 'child'
    ? { status: 'child', name: i.name, number: children.find(c => c.id === i.childId)?.number, payment: i.payment ?? '', oral: i.kind !== undefined ? i.kind === 'oral' : !!i.oral, kind: i.kind ?? (i.oral ? 'oral' : null), absent: !!i.absent, moved: !!i.moved, note: i.note || undefined, childId: i.childId ?? undefined, source: 'override' }
    : { status: i.status, payment: '', oral: false, absent: false, moved: false, source: 'override' }, [children]);
  const view = useMemo(() => {
    const fixed = new Map(board.fixed), open = new Map(board.open);
    const pend = new Set<string>();
    for (const o of ops.values()) {
      const k = `${o.teacherId}|${o.time}`;
      const side: Side = o.kind === 'day' ? o.side : 'fixed';
      const target = side === 'open' ? open : fixed;
      const v = o.input === null ? undefined
        : o.input === 'reset' ? (o.kind === 'day' && side === 'fixed' ? base.get(k) : undefined)
        : preview(o.input);
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
  // 펼친 선생님 한 사람 몫(표 폭 %) — 수업·메모 칸 폭을 이 비율로
  const per = 95 / Math.max(1, shown.filter(t => !folded.has(t.name)).length);
  const setAssign = (id: string, st: AssignState) => setAssignDraft(m => {
    const n = new Map(m);
    if (st === dbAssign(id)) n.delete(id); else n.set(id, st);
    return n;
  });
  // 표를 화면 아래(아래 버튼 줄 위)까지 늘린다 — 브라우저를 축소하면 칸이 커져서 모든 시간이 한 화면에 나온다
  const tableBox = useRef<HTMLDivElement>(null);
  const barBox = useRef<HTMLDivElement>(null);
  const [fillH, setFillH] = useState(0);
  useEffect(() => {
    const fit = () => {
      const el = tableBox.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const v = Math.max(0, Math.round(window.innerHeight - top - (barBox.current?.offsetHeight ?? 0) - 8));
      setFillH(h => (Math.abs(h - v) > 2 ? v : h));   // 1~2px 차이로 계속 다시 그리지 않게
    };
    fit();
    window.addEventListener('resize', fit);
    const t = setTimeout(fit, 500); // 글꼴·위 줄이 늦게 그려지는 것까지
    return () => { window.removeEventListener('resize', fit); clearTimeout(t); };
  }, [mode, day, weekday, center, isAdmin]);

  // 선생님마다 맨 오른쪽에 메모 칸 (40분 수업, 4시 시작 같은 것). 수색은 접어 두고 머리 칸을 누르면 펼친다
  const showMemo = true;
  const [memoOpenFor, setMemoOpenFor] = useState<Set<Center>>(() => new Set<Center>(['uijeongbu']));
  const memoOpen = memoOpenFor.has(center);
  const toggleMemo = () => setMemoOpenFor(s => { const n = new Set(s); if (n.has(center)) n.delete(center); else n.add(center); return n; });

  // 테스트 화면 — 이 아이 칸만 고칠 수 있고, 다른 아이가 있는 칸은 잠근다
  const isTest = !!testChildName;
  // 테스트 아이 — 이 센터 명단의 그 아이 (두 센터를 다니면 센터마다 아이 기록이 따로)
  const testKid = isTest ? children.find(c => c.name === testChildName && (c.center ?? 'eunpyeong') === center) : undefined;
  const testId = testKid?.id;
  // 빈타임에 직접 작성한 칸인데 회원(보호자 계정과 이어진 아이)이 아님 — 다른 색으로
  const isNonMember = (c: CellView) => c.status === 'child' && c.source === 'override'
    && !(c.childId && children.find(k => k.id === c.childId)?.guardianUserId);
  const locked = (c: CellView) => isTest && c.status !== 'empty' && c.status !== 'none' && c.childId !== testId;
  const pickKids = isTest ? (testKid ? [testKid] : []) : children.filter(c => (c.center ?? 'eunpyeong') === center);   // 이 센터 아이만
  // 테스트 아이의 고정 수업 — 그 요일로 바로 가는 버튼 (월요일엔 수업이 없어 빈 표만 보일 수 있어서)
  const [testFixed, setTestFixed] = useState<{ weekday: number; time: string; teacher: string }[]>([]);
  useEffect(() => {
    if (!testId) return;
    getFixedByChild().then(m => setTestFixed((m.get(testId) ?? []).map(f => ({ weekday: f.weekday, time: f.time, teacher: f.teacher })))).catch(() => {});
  }, [testId]);
  const nextDay = (wd: number) => { const t = toYmd(new Date()); return addDays(t, (wd - parseYmd(t).getDay() + 7) % 7); };
  // 테스트 기록 지우기 — 이 아이의 결제 기록·그날 칸을 지운다(고정 수업·선결제 충전은 그대로)
  const clearTestRecords = async () => {
    if (!testId) return;
    if (!(await askConfirm(`${testChildName}의 테스트 기록을 지울까요?\n· 결제 기록(선택·확정) 전부\n· 날짜별로 넣거나 바꾼 칸(빈타임 포함) 전부 — 단, [이 날부터 고정] 전의 지난 수업 칸은 남기고 결석·메모만 되돌려요\n고정 수업과 선결제 충전·차감 기록은 그대로예요. 되돌릴 수 없어요.`))) return;
    try {
      const r = await clearChildTestData(testId);
      setDraft(new Map()); setOps(new Map());
      await load();
      showAlert(`지웠어요. (그날 칸 ${r.deleted}개${r.kept ? ` · [이 날부터 고정] 전 지난 수업 ${r.kept}개는 남기고 결석·메모만 되돌림` : ''})`);
    } catch (e) {
      showAlert(`지우지 못했어요.\n${(e as Error).message}`);
    }
  };

  // 정해진 줄에 없는 시간의 칸(엑셀에서 옮긴 일요일 10:10 등)도 줄로 보인다
  const rows = useMemo(() => {
    const keys = [...board.fixed.keys(), ...board.open.keys()];
    return mode === 'day' ? rowsForDay(day, keys, center) : rowsForWeekday(weekday, keys, center);
  }, [mode, day, weekday, board, center]);
  const d = parseYmd(day);

  // 칸 변경은 바로 저장하지 않고 쌓아 둔다
  const opKey = (o: Op) => o.kind === 'fixed' ? `fixed|${o.teacherId}|${o.time}` : `day|${o.teacherId}|${o.time}|${o.kind === 'from' ? 'fixed' : o.side}`;
  const putOps = (list: Op[]) => setOps(m => { const n = new Map(m); for (const o of list) n.set(opKey(o), o); return n; });
  const stage = ({ teacher, time, side, cell }: Editing, input: CellInput | 'reset', from?: boolean) => {
    const o: Op = from && mode === 'day'
      ? { kind: 'from', teacherId: teacher.id, time, input: input !== 'reset' && input.status === 'child' ? input : null }
      : mode === 'fixed' ? { kind: 'fixed', teacherId: teacher.id, time, input, start: cell.startDate }
      : { kind: 'day', teacherId: teacher.id, time, side, input };
    const list: Op[] = [o];
    // 빈타임에 아이·?·x 를 넣으면 — 그 시간 고정 아이 수업은 취소로 남긴다(줄 + 취소).
    // 나중에 빈타임을 비워도 고정 아이가 저절로 살아나지 않게 (살리려면 고정 칸에서 [취소 되돌리기])
    if (mode === 'day' && side === 'open' && input !== 'reset' && input.status !== 'none') {
      const f = cellOf(view.fixed, teacher.id, time);
      if (f.status === 'child' && !f.absent && !f.moved) {
        list.push({ kind: 'day', teacherId: teacher.id, time, side: 'fixed',
          input: { status: 'child', childId: f.childId ?? null, name: f.name, payment: f.payment, kind: f.kind ?? null, absent: false, moved: true, note: '취소' } });
      }
    }
    putOps(list);
    setEditing(null);
    setPicking(null);
  };

  // 보호자가 마이페이지에서 취소한 수업(줄 + "취소 · 보호자")을 취소 전으로 — 다른 변경처럼 [스케줄 변경 완료]를 눌러야 반영
  const restoreCancel = (e: Editing) => {
    const c = e.cell;
    putOps([{
      kind: 'day', teacherId: e.teacher.id, time: e.time, side: e.side,
      input: { status: 'child', childId: c.childId ?? null, name: c.name, payment: c.payment, kind: c.kind ?? null, absent: false, moved: false, note: '' },
      restore: { name: c.name ?? '', teacherName: e.teacher.name },
    }]);
    setEditing(null);
  };

  // 표에서 이름 옆 수업 종류 바꾸기 — 고정 수업이면 이 날부터(날짜별) / 오늘부터(고정 시간표), 그날 칸이면 그날만
  const changeKind = (e: Editing, kind: LessonKind) => {
    const c = e.cell;
    if (c.status !== 'child') return;
    const input: CellInput = { status: 'child', childId: c.childId ?? null, name: c.name, payment: c.payment, kind, absent: c.absent, moved: c.moved, note: c.note };
    stage(e, input, mode === 'day' && e.side === 'fixed' && c.source === 'fixed');
  };

  // 메모 고치기 — 고정 수업 아이면 이 날부터(날짜별) / 오늘부터(고정 시간표) 이후 일정에도 저장.
  // 그날 결석·결제를 바꾼 칸이라도 고정 아이 그대로면 고정 수업 메모로 고친다. 빈타임·그날 바뀐 아이 칸만 그날만
  const changeNote = async (e: Editing) => {
    const c = e.cell;
    const v = await askPrompt(`${c.name} — 메모`, c.note ?? '');
    if (v === null || v.trim() === (c.note ?? '')) return;
    const base = cellOf(board.fixed, e.teacher.id, e.time);
    const sameFixed = mode === 'day' && e.side === 'fixed' && c.source !== 'fixed' && base.status === 'child' && !!c.childId && c.childId === base.childId;
    if (sameFixed) {
      stage(e, { status: 'child', childId: base.childId ?? null, name: base.name, payment: base.payment, kind: base.kind ?? null, note: v.trim() }, true);
      return;
    }
    const input: CellInput = { status: 'child', childId: c.childId ?? null, name: c.name, payment: c.payment, kind: c.kind ?? null, absent: c.absent, moved: c.moved, note: v.trim() };
    stage(e, input, mode === 'day' && e.side === 'fixed' && c.source === 'fixed');
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
      const list: Op[] = rows.filter(time => cellOf(view.fixed, t.id, time).status !== 'empty').map(time => ({ kind: 'fixed', teacherId: t.id, time, input: 'reset', start: cellOf(board.fixed, t.id, time).startDate }));
      putOps(list);
      return;
    }
    if (!(await askConfirm(`${t.name} 선생님의 이 날 시간표를 모두 비울까요?\n(보호자가 수업스케쥴로 신청한 칸은 그대로예요)\n[스케줄 변경 완료]를 눌러야 반영돼요.`))) return;
    putOps(clearDayOps(t.id, false));
    setDraft(dr => new Map([...dr].filter(([, v]) => v.teacherId !== t.id)));
  };
  // 그날만 빼기 — 표에서 숨기고 그날 칸도 모두 비운다. 결제 체크도 버린다
  const hideTeacher = async (t: Teacher) => {
    // 이 날만 / 앞으로 계속 (일요일은 이 날만)
    const r = wd === 0 ? 'a' : await askChoice(`${t.name} 선생님을\n이 날(${d.getMonth() + 1}/${d.getDate()})만 뺄까요,\n앞으로 매주 ${DOW[wd]}요일 계속 뺄까요?`, '이 날만', '앞으로 계속');
    if (!r) return;
    if (r === 'b') { await hideForever(t); return; }
    if (!(await askConfirm(`${t.name} 선생님을 이 날 시간표에서 뺄까요?\n그날 칸도 모두 비워져요(보호자 신청 칸은 그대로).\n[스케줄 변경 완료]를 누르기 전에는 [되돌리기]로 취소할 수 있어요.`))) return;
    const st: AssignState = worksAt(t, center, wd) || hasCellsOf(t.id) ? 'off' : null;
    setAssign(t.id, st);
    putOps(clearDayOps(t.id, true));
    setDraft(dr => new Map([...dr].filter(([, v]) => v.teacherId !== t.id)));
  };
  // 휴무 — 저장 안 한 변경이 있으면 먼저 저장하게 한다(휴무는 바로 저장된다)
  const openLeave = (t: Teacher) => {
    if (unsaved) { showAlert('저장 안 한 변경이 있어요.\n먼저 [스케줄 변경 완료]를 누른 뒤 휴무를 넣어 주세요.'); return; }
    setLeaveFor(t);
  };
  // 그 선생님 그날 수업 — 빈타임에 아이가 있으면 그 아이, 없으면 고정 아이 (결석·옮김 빼고)
  const leaveLessons = (tid: string): LeaveLesson[] => rows.flatMap(time => {
    const l = cellOf(view.fixed, tid, time), r = cellOf(view.open, tid, time);
    const [side, c] = r.status === 'child' ? ['open' as const, r] : ['fixed' as const, l];
    return c.status === 'child' && !c.moved && !c.absent ? [{ time, side, cell: c }] : [];
  });
  const leaveOf = (tid: string) => leaves.filter(x => x.teacherId === tid);

  // 선생님 추가 — 이날만(그날만 넣기, [스케줄 변경 완료]로 저장) / 앞으로 계속(이 요일 출근으로 바로 저장 → 고정 시간표·앞으로의 날짜에 나온다)
  const addForever = async (t: Teacher, w: number) => {
    try {
      await addTeacherWorkDay(t.id, center, w);
      await load();
      showAlert(`${t.name} 선생님을 앞으로 매주 ${DOW[w]}요일 ${CENTERS.find(c => c.key === center)?.label} 시간표에 넣었어요.\n고정 수업은 고정 시간표에서 넣으면 돼요.`);
    } catch (e) { showAlert(`넣지 못했어요.\n${(e as Error).message}`); }
  };
  const addTeacher = async (t: Teacher) => {
    if (wd === 0) { showTeacher(t); return; }   // 일요일은 그날만 (일요일 선생님은 따로 정해 둠)
    const r = await askChoice(`${t.name} 선생님을\n이 날(${d.getMonth() + 1}/${d.getDate()})만 넣을까요,\n앞으로 매주 ${DOW[wd]}요일 계속 넣을까요?`, '이 날만', '앞으로 계속');
    if (r === 'a') showTeacher(t);
    else if (r === 'b') await addForever(t, wd);
  };
  // 앞으로 계속 빼기 — 바로 저장: 이 요일 출근에서 빼고, 이 날부터 그 요일 고정 수업을 끝내고, 그날 따로 넣은 칸을 지운다(보호자 신청은 그대로)
  const hideForever = async (t: Teacher) => {
    if (unsaved) { showAlert('저장 안 한 변경이 있어요.\n먼저 [스케줄 변경 완료]를 누른 뒤 빼 주세요.'); return; }
    const fixedTimes = [...base].filter(([k, v]) => k.startsWith(`${t.id}|`) && v.status === 'child').map(([k]) => k.split('|')[1]);
    const dayTimes = [...board.fixed, ...board.open].filter(([k, v]) => k.startsWith(`${t.id}|`) && v.source === 'override').map(([k]) => k.split('|')[1]);
    if (!(await askConfirm(`${t.name} 선생님을 앞으로 매주 ${DOW[wd]}요일 ${CENTERS.find(c => c.key === center)?.label} 시간표에서 뺄까요?\n· ${DOW[wd]}요일 고정 수업 ${fixedTimes.length}개가 이 날(${d.getMonth() + 1}/${d.getDate()})부터 없어져요(지난 날짜는 그대로)\n· 이 날 따로 넣은 칸도 지워져요 (보호자 신청은 그대로)\n바로 저장돼요.`))) return;
    try {
      await removeTeacherWorkDay(t.id, center, wd);
      for (const time of fixedTimes) await saveFixedFrom({ from: day, teacherId: t.id, weekday: wd, time, center, input: null });
      for (const side of ['fixed', 'open'] as const) {
        for (const [k, v] of board[side]) {
          if (k.startsWith(`${t.id}|`) && v.source === 'override') await resetDayCell(day, t.id, k.split('|')[1], side, center);
        }
      }
      if (assignOf(t.id) === 'add') await setDayAssign(day, t.id, center, null);
      setDraft(dr => new Map([...dr].filter(([, x]) => x.teacherId !== t.id)));
      await load();
      showAlert(`${t.name} 선생님을 앞으로 매주 ${DOW[wd]}요일에서 뺐어요.${dayTimes.length ? `\n이 날 따로 넣은 칸 ${dayTimes.length}개도 지웠어요.` : ''}`);
    } catch (e) { showAlert(`빼지 못했어요.\n${(e as Error).message}`); await load(); }
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
    if (o.kind === 'from') {
      // "이 날부터 고정" — 그날 따로 바꿔 둔 칸은 지우고, 이전 고정 수업은 전날까지·새 고정 수업은 이 날부터 (서버에서)
      await resetDayCell(day, o.teacherId, o.time, 'fixed', center);
      await saveFixedFrom({ from: day, teacherId: o.teacherId, weekday: d.getDay(), time: o.time, center, input: o.input });
    } else if (o.kind === 'fixed') {
      // 고정 시간표에서 고친 것도 오늘부터 앞으로만 (지난 날짜는 그대로) — 아이·수업 종류·결제방식 모두
      await saveFixedFrom({
        from: toYmd(new Date()), teacherId: o.teacherId, weekday, time: o.time, center,
        input: o.input === 'reset' || o.input.status !== 'child' ? null : o.input,
      });
    } else {
      if (o.input === 'reset') await resetDayCell(day, o.teacherId, o.time, o.side, center);
      else await saveDayCell(day, o.teacherId, o.time, o.side, o.input, center);
      // 보호자 취소 되돌리기 — 수업스케쥴 신청 칸의 "취소완료"도 지우고 관리 내역에 남긴다
      if (o.restore) {
        if (o.side === 'open') await restoreBookedSlot(day, o.time, o.teacherId).catch(() => {});
        await addAdminLog({ center, kind: 'cancel_restore', title: `보호자 취소 되돌리기 — ${o.restore.name}`, detail: `${day.replace(/-/g, '/')} ${o.time} ${o.restore.teacherName} 선생님 (${o.side === 'fixed' ? '고정' : '빈타임'})` });
      }
    }
  };
  // 날짜별 화면에서 바뀐 수업 — 칸마다 저장 전(디비)과 후를 비교한다.
  //  수업이 없어진 아이(비우기·미정·수업 안 함·다른 아이로 바꾸기·결석·옮김·이 날부터 고정 변경·선생님 빼기) → 취소
  //  수업이 생긴 아이(새로 넣기·다른 아이로 바꾸기·결석 풀기·취소 되돌리기·이 날부터 고정 변경) → 확정
  const lessonChangesByOps = () => {
    type Ch = { childId: string; teacherId: string; time: string; result: '취소' | '확정' };
    if (mode !== 'day') return [] as Ch[];
    type C = { status: string; absent?: boolean; moved?: boolean; childId?: string | null } | null | undefined;
    const live = (c: C) => (c && c.status === 'child' && !c.absent && !c.moved ? c.childId ?? null : null);
    // 그 시간 실제 수업 아이 — 빈타임 칸에 무엇이든(아이·?·x) 있으면 고정 아이는 수업이 없다(빈타임 아이 수업이거나 없음)
    const lessonOf = (fixed: C, open: C) => (open && open.status !== 'empty' && open.status !== 'none' ? live(open) : live(fixed));
    const out: Ch[] = [];
    // 바뀐 칸(선생님|시간)마다 저장 전·후 두 칸(고정·빈타임)을 맞춰 본다
    const keys = new Set<string>();
    for (const o of ops.values()) if (o.kind !== 'fixed') keys.add(`${o.teacherId}|${o.time}`);
    const offTeachers = new Set([...assignDraft].filter(([, st]) => st === 'off').map(([id]) => id));
    for (const m of [board.fixed, board.open]) for (const k of m.keys()) if (offTeachers.has(k.split('|')[0])) keys.add(k);
    for (const k of keys) {
      const [tid, time] = k.split('|');
      const bf = cellOf(board.fixed, tid, time), bo = cellOf(board.open, tid, time);
      const before = lessonOf(bf, bo);
      let af: C = bf, ao: C = bo;
      const fo = ops.get(`day|${tid}|${time}|fixed`), oo = ops.get(`day|${tid}|${time}|open`);
      if (fo) af = fo.kind === 'from' ? fo.input : fo.kind === 'day' ? (fo.input === 'reset' ? base.get(k) : fo.input) : af;
      if (oo && oo.kind === 'day') ao = oo.input === 'reset' ? null : oo.input;
      const after = offTeachers.has(tid) ? null : lessonOf(af, ao);
      if (before === after) continue;
      if (before) out.push({ childId: before, teacherId: tid, time, result: '취소' });
      if (after) out.push({ childId: after, teacherId: tid, time, result: '확정' });
    }
    return out;
  };
  // 취소된 수업 — 그 보호자에게 '수업 취소' 알림톡(시간표 신청 확정/취소 알림, 결과 = 취소) / 다시 살린 수업은 '확정'
  const notifyCancelled = async (list: { childId: string; teacherId: string; time: string; result?: '취소' | '확정' }[]) => {
    try {
      const members = await getMembers();
      const DOWS = ['일', '월', '화', '수', '목', '금', '토'];
      const res = await addAndSendOutbox(list.map(x => {
        const kid = children.find(k => k.id === x.childId);
        const m = kid?.guardianUserId ? members.find(mm => mm.userId === kid.guardianUserId) : undefined;
        return {
          templateId: 'booking_result', childId: x.childId, userId: kid?.guardianUserId, childName: kid ? `${kid.name}${kid.number ?? ''}` : '', phone: m?.phone,
          vars: { 이름: kid?.name ?? '', 날짜: day.replace(/-/g, '/'), 요일: DOWS[parseYmd(day).getDay()], 시간: x.time.replace(/^0/, ''), 선생님: teachers.find(t => t.id === x.teacherId)?.name ?? '', 신청결과: x.result ?? '취소' },
        };
      }));
      showAlert(`수업 취소·확정 알림톡 — 보냄 ${res.sent}건${res.failed ? ` · 실패 ${res.failed}건` : ''}${res.skipped ? ` · 번호 없어 못 보냄 ${res.skipped}건` : ''}${res.waiting ? ` · 템플릿 ID가 없어 남겨만 둠 ${res.waiting}건` : ''}\n(알림 → 보호자 알림 내역에서 볼 수 있어요)`);
    } catch (e) {
      showAlert(`저장했지만 수업 취소 알림톡을 보내지 못했어요.\n${(e as Error).message}`);
    }
  };

  const saveSchedule = async () => {
    // 수업을 없앤 칸이 있으면 — 알림톡이 간다고 먼저 알려 준다 (회원 계정과 이어진 아이만 받는다)
    const linked = (x: { childId: string }) => !!children.find(k => k.id === x.childId)?.guardianUserId;
    const nameOf = (x: { childId: string }) => children.find(k => k.id === x.childId)?.name;
    const changes = lessonChangesByOps();
    const cancels = changes.filter(linked);
    // 고정 수업이 바뀌는 아이 — 이 날부터 고정(날짜별) · 고정 시간표에서 아이가 생기거나(확정) 빠지면(취소) '고정 스케줄' 알림톡
    const fixedChanges = fixedChangesByOps();
    const fixedLinked = fixedChanges.filter(linked);
    // 회원 계정과 이어지지 않은 아이 — 알림을 못 보낸다는 것도 함께 알려 준다
    const unlinked = [...new Set([...changes, ...fixedChanges].filter(x => !linked(x)).map(x => `${nameOf(x) ?? '이름 없음'}(${x.result})`))];
    const nC = cancels.filter(x => x.result === '취소'), nR = cancels.filter(x => x.result === '확정');
    if ((changes.length || fixedChanges.length) && !(await askConfirm([
      nC.length ? `수업 취소 ${nC.length}건 — '수업 취소' 알림톡이 가요. (${nC.map(nameOf).join(', ')})` : '',
      nR.length ? `수업 추가 ${nR.length}건 — '수업 확정' 알림톡이 가요. (${nR.map(nameOf).join(', ')})` : '',
      fixedLinked.length ? `고정 수업 ${fixedLinked.map(x => `${nameOf(x)} ${x.result}`).join(', ')} — '고정 스케줄' 알림톡이 가요.` : '',
      unlinked.length ? `회원 계정과 이어지지 않아 알림이 안 가요: ${unlinked.join(', ')}` : '',
    ].filter(Boolean).join('\n') + '\n저장할까요?'))) return;
    setSavingSched(true);
    const failedOps: string[] = [];
    const failedAssign: string[] = [];
    for (const [k, o] of ops) {
      try { await applyOp(o); } catch { failedOps.push(k); }
    }
    for (const [id, st] of assignDraft) {
      try { await setDayAssign(day, id, center, st); } catch { failedAssign.push(id); }
    }
    // 고른 결제방식은 "선택"으로 저장 (확정은 [결제 완료]). 숨긴 선생님 수업은 버린다
    const shownIds = new Set(shown.map(t => t.id));
    const failedPay: string[] = [];
    for (const [k, v] of draft) {
      if (!shownIds.has(v.teacherId)) continue;
      try { await setLessonPayment(v.childId, day, v.time, v.teacherId, center, v.entry && { ...v.entry, confirmed: false }); }
      catch { failedPay.push(k); }
    }
    setDraft(dr => new Map([...dr].filter(([k]) => failedPay.includes(k))));
    failedOps.push(...failedPay);
    setOps(m => new Map([...m].filter(([k]) => failedOps.includes(k))));
    setAssignDraft(m => new Map([...m].filter(([id]) => failedAssign.includes(id))));
    setSavingSched(false);
    await load();
    notifyScheduleChanged(center);   // 선생님 시간표·수업스케쥴 화면에 바로 알림
    if (failedOps.length + failedAssign.length) showAlert(`${failedOps.length + failedAssign.length}건을 저장하지 못했어요. 다시 [스케줄 변경 완료]를 눌러 주세요.`);
    // 저장된 취소만 알림
    const okCancels = cancels.filter(x => ![...failedOps].some(k => k.includes(x.teacherId) && k.includes(x.time)));
    if (okCancels.length) await notifyCancelled(okCancels);
    // 저장된 고정 수업 변경만 알림
    const okFixed = fixedLinked.filter(x => !failedOps.some(k => k.includes(x.teacherId) && k.includes(x.time)));
    if (okFixed.length) {
      try {
        const r = await notifyFixedChanges(okFixed.map(x => ({ ...x, teacherName: teachers.find(t => t.id === x.teacherId)?.name ?? '' })));
        await showAlert(`고정 스케줄 알림톡 — ${sendSummary(r)}\n(알림 → 보호자 알림 내역에서 볼 수 있어요)`);
      } catch (e) { await showAlert(`저장했지만 고정 스케줄 알림톡을 보내지 못했어요.\n${(e as Error).message}`); }
    }
  };
  // [이 날 수업 알림] — 이 날 이 센터 수업이 있는 아이마다 보호자에게 '수업 일정' 알림톡 (수업 개수 1~8개 템플릿)
  const [sendingDay, setSendingDay] = useState(false);
  const sendLessonDay = async () => {
    const kids = [...new Set(lessons.map(x => x.childId))];
    const linkedKids = kids.filter(id => !!children.find(k => k.id === id)?.guardianUserId);
    const names = linkedKids.map(id => children.find(k => k.id === id)?.name).join(', ');
    if (!linkedKids.length) { await showAlert('이 날 수업이 있는 아이 중 회원 계정과 이어진 아이가 없어요.'); return; }
    if (!(await askConfirm(`${day.replace(/-/g, '/')} ${CENTERS.find(c => c.key === center)?.label} 수업 일정 알림톡을 보낼까요?\n아이 ${linkedKids.length}명: ${names}${kids.length > linkedKids.length ? `\n(회원 계정과 안 이어진 ${kids.length - linkedKids.length}명은 빼요)` : ''}`, '보내기'))) return;
    setSendingDay(true);
    try {
      const r = await notifyLessonDay(day, center, lessons.map(x => ({ childId: x.childId, time: x.time, teacherName: teachers.find(t => t.id === x.teacherId)?.name ?? '' })));
      await showAlert(`수업 일정 알림톡 — ${sendSummary(r)}\n(알림 → 보호자 알림 내역에서 볼 수 있어요)`);
    } catch (e) { await showAlert(`보내지 못했어요.\n${(e as Error).message}`); }
    finally { setSendingDay(false); }
  };
  // 고정 수업 변경 — 이 날부터 고정(날짜별, 그 요일 고정 수업과 비교) · 고정 시간표(오늘부터)에서 칸의 아이가 바뀐 것
  const fixedChangesByOps = () => {
    type FC = { childId: string; teacherId: string; time: string; result: '확정' | '취소'; weekday: number; from: string };
    const out: FC[] = [];
    for (const o of ops.values()) {
      if (o.kind !== 'from' && o.kind !== 'fixed') continue;
      const old = o.kind === 'from' ? cellOf(base, o.teacherId, o.time) : cellOf(board.fixed, o.teacherId, o.time);
      const inp = o.input === 'reset' ? null : o.input;
      const newId = inp && inp.status === 'child' ? inp.childId ?? undefined : undefined;
      const oldId = old.status === 'child' ? old.childId : undefined;
      if (oldId === newId) continue;
      const wdx = o.kind === 'from' ? d.getDay() : weekday;
      const from = o.kind === 'from' ? day : toYmd(new Date());
      if (oldId) out.push({ childId: oldId, teacherId: o.teacherId, time: o.time, result: '취소', weekday: wdx, from });
      if (newId) out.push({ childId: newId, teacherId: o.teacherId, time: o.time, result: '확정', weekday: wdx, from });
    }
    return out;
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
  // 고정 아이 결제방식을 "앞으로 계속"으로 바꿀 때 — 고정 수업 결제를 이 날부터 바꾼다([스케줄 변경 완료]로 저장)
  const setFixedPayment = (t: Teacher, time: string, method: PayMethod) => {
    const base = cellOf(board.fixed, t.id, time);
    const short = PAY_METHODS.find(m => m.key === method)?.short;
    if (base.status !== 'child' || !short) return;
    stage({ teacher: t, time, side: 'fixed', cell: base },
      { status: 'child', childId: base.childId ?? null, name: base.name, payment: short, kind: base.kind ?? null, note: base.note }, true);
  };
  // 그날 진행된 수업 — 고정·빈타임에 아이가 있고(빈타임 아이가 있으면 그 아이), 결석·옮김이 아닌 명단 아이
  const lessons = mode === 'day' ? shown.flatMap(t => rows.flatMap(time => {
    if (isTest) {
      const l0 = cellOf(view.fixed, t.id, time), r0 = cellOf(view.open, t.id, time);
      const c0 = r0.status === 'child' ? r0 : l0;
      if (c0.childId !== testId) return [];
    }
    const l = cellOf(view.fixed, t.id, time), rr = cellOf(view.open, t.id, time);
    const c = rr.status === 'child' ? rr : l;
    if (c.status !== 'child' || c.moved || c.absent || !c.childId) return [];
    // 빈타임 아이는 기본 결제 없이 비워 두고 직접 고른다
    return [{ teacherId: t.id, time, childId: c.childId, base: rr.status === 'child' ? undefined : defaultMethod(c.payment) }];
  })) : [];
  // 결제방식이 빈 수업(고른 것도 기본 결제도 없음) — 하나라도 있으면 [결제 완료]를 누를 수 없다
  const missingPay = new Set(lessons.filter(x => !paidOf(x.childId, x.time) && !x.base).map(x => keyOf(x.childId, x.time)));
  // 월 회차 — 아이마다 이번 달 바우처·굳센·꿈이든 몇 번째 수업인지 (결제 전 수업도 센다. 오늘 이 표는 고르는 중인 결제까지 반영해 시간 순)
  const effMethod = (x: { childId: string; time: string; base?: PayMethod }) => paidOf(x.childId, x.time)?.method ?? x.base;
  // 월 회차는 소급도 원래 결제(바우처소급 → 바우처)로 센다
  const rounds = (() => {
    const onBoard = new Set(lessons.map(x => keyOf(x.childId, x.time)));
    const before = new Map<string, number>();
    const today: { childId: string; time: string; method: PayMethod; mine: boolean }[] = [];
    for (const r of roundPays) {
      if (r.day < day) before.set(`${r.childId}|${r.method}`, (before.get(`${r.childId}|${r.method}`) ?? 0) + 1);
      else if (r.day === day && !onBoard.has(keyOf(r.childId, r.time))) today.push({ ...r, mine: false });   // 같은 날 다른 센터 수업
    }
    for (const x of lessons) { const m0 = effMethod(x), m = m0 && roundMethod(m0); if (m && m in ROUND_LIMIT) today.push({ childId: x.childId, time: x.time, method: m, mine: true }); }
    today.sort((a, b) => a.time.localeCompare(b.time));
    const out = new Map<string, { n: number; over: boolean }>();
    for (const r of today) {
      const k = `${r.childId}|${r.method}`;
      const n = (before.get(k) ?? 0) + 1;
      before.set(k, n);
      if (r.mine) out.set(keyOf(r.childId, r.time), { n, over: !!ROUND_LIMIT[r.method] && n >= ROUND_LIMIT[r.method]! });
    }
    return out;
  })();
  // 회차가 넘친 수업(빨간 글씨) — 하나라도 있으면 [결제 완료]를 누를 수 없다
  const overRound = [...rounds.values()].filter(r => r.over).length;
  // 아직 확정 안 된 수업 — [결제 완료]에서 고른 결제(없으면 기본 결제)로 확정한다
  // 소급·미결로 저장해 둔 수업은 [결제 완료]에 확정되지 않는다(실제 결제한 뒤 결제방식을 바꾸면 그때 확정)
  const toConfirm = lessons.filter(x => {
    const k = keyOf(x.childId, x.time);
    if (!draft.has(k) && isLaterPay(payments.get(k)?.method)) return false;
    return draft.has(k) || !payments.get(k)?.confirmed;
  });
  // 그날 아직 결제 안 한 소급·미결 — 다 바꿀 때까지 [결제 완료]를 계속 누를 수 있다
  const laterToday = lessons.filter(x => isLaterPay(effMethod(x))).length;
  const schedPending = ops.size + assignDraft.size;
  const canPay = !missingPay.size && !overRound && !schedPending && (toConfirm.length > 0 || laterToday > 0);

  // [결제 완료] — 그날 진행된 수업을 모두 확정 (스케줄 변경을 먼저 저장해야 누를 수 있다)
  const savePayments = async () => {
    if (!canPay) return;
    if (!toConfirm.length) {
      await showAlert(`소급·미결 ${laterToday}건이 남아 있어요.\n실제로 결제한 뒤 결제방식을 바우처·굳센 등으로 바꾸고 [결제 완료]를 눌러 주세요.`);
      return;
    }
    setSavingPay(true);
    const failedKeys: string[] = [];
    const prepaidUses = new Map<string, number>();   // 이번에 선결제로 확정한 아이 → 횟수 (알림톡)
    for (const x of toConfirm) {
      const k = keyOf(x.childId, x.time);
      const e = paidOf(x.childId, x.time) ?? (x.base ? { method: x.base } : undefined);
      if (!e) continue;
      // 이미 선결제로 확정(알림톡도 보냄)된 수업은 다시 알리지 않는다 — 새로 선결제가 된 수업만
      const before = payments.get(k);
      const wasPrepaid = !!before?.confirmed && before.method === 'prepaid' && !before.note;
      try {
        // 소급·미결은 고른 것만 저장하고 확정하지 않는다
        await setLessonPayment(x.childId, day, x.time, x.teacherId, center, { ...e, confirmed: !isLaterPay(e.method) });
        if (e.method === 'prepaid' && !e.note && !wasPrepaid) prepaidUses.set(x.childId, (prepaidUses.get(x.childId) ?? 0) + 1);
      }
      catch { failedKeys.push(k); }
    }
    setDraft(dr => new Map([...dr].filter(([k]) => failedKeys.includes(k))));
    setSavingPay(false);
    await load();
    if (failedKeys.length) showAlert(`${failedKeys.length}건을 저장하지 못했어요. 다시 [결제 완료]를 눌러 주세요.`);
    // 선결제 사용 — 아이마다 그날 한 번 '선결제 사용' 알림톡
    if (prepaidUses.size) {
      try {
        const r = await notifyPrepaidUses(day, [...prepaidUses].map(([childId, count]) => ({ childId, count })));
        if (r.sent + r.failed + r.skipped + r.waiting) await showAlert(`선결제 사용 알림톡 — ${sendSummary(r)}\n(알림 → 보호자 알림 내역에서 볼 수 있어요)`);
      } catch (e) { await showAlert(`결제는 확정했지만 선결제 알림톡을 보내지 못했어요.\n${(e as Error).message}`); }
    }
  };

  // 남은 횟수 — 바우처·굳센·꿈이든은 이번 달 제공 횟수에서, 선결제는 지금까지 충전한 횟수에서 확정된 만큼 뺀다
  const remaining = (childId: string, method: PayMethod): string | undefined => {
    const c = children.find(x => x.id === childId);
    // 횟수가 있는 결제만 (신용카드·현금·직접 작성은 횟수 없음)
    if (!c || (method !== 'voucher' && method !== 'gusen' && method !== 'kkumideun' && method !== 'prepaid')) return undefined;
    const limit = { voucher: c.voucherLimit, gusen: c.gusenLimit, kkumideun: c.kkumideunLimit, prepaid: c.prepaidTotal }[method] ?? 0;
    if (!limit) return undefined;
    const used = counts.get(childId)?.[method] ?? 0;   // 확정된 결제만 센다
    return method === 'prepaid' ? `${limit - used}` : `${limit - used}/${limit}`;
  };

  if (!isAdmin) return <p className="text-center text-[14px] text-[#aaa] py-32">관리자만 볼 수 있는 화면이에요.</p>;

  const th = 'border border-[#d4d4d8] px-1 py-1.5 font-normal overflow-hidden whitespace-nowrap';
  const memoTh = <th onClick={toggleMemo} title={memoOpen ? '메모 접기' : '메모 펼치기'}
    className={`${th} text-[10px] text-[#999] cursor-pointer hover:text-[#555] ${memoOpen ? 'min-w-[56px]' : 'w-5 px-0'}`}>{memoOpen ? '메모 ‹' : '›'}</th>;
  const td = 'border border-[#e4e4e7] h-9 px-1 text-center align-middle cursor-pointer hover:bg-[#f0f6fe] whitespace-nowrap overflow-hidden text-ellipsis';

  return (
    <div className="px-3 md:px-6 pt-6 pb-14 fade-up">
      <div className="mx-auto">
        <h1 className="display-heading mb-5">{isTest ? '시간표(테스트)' : '시간표'}{fixedCenter && <span className="text-[0.7em] text-[#888]"> ({fixedCenter === 'uijeongbu' ? '의정부' : '수색'})</span>}</h1>
        {isTest ? (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg bg-[#fef3c7] px-4 py-3 text-[13px] text-[#92400e]">
            <span><b>{testChildName}</b> 수업만 보이고 고칠 수 있어요. 다른 아이 칸은 잠겨 있어요. 저장은 <b>실제 디비</b>에 돼서 {testChildName} 마이페이지에서 바로 확인할 수 있어요.</span>
            <span className="w-full flex flex-wrap items-center gap-1.5 text-[12px]">
              {testChildName} 고정 수업:
              {testFixed.length === 0 && <span className="text-[#b45309]/70">없음</span>}
              {testFixed.map((f, i) => (
                <button key={i} onClick={() => guard(() => { setMode('day'); setDay(nextDay(f.weekday)); })}
                  className="border border-[#d97706] bg-white rounded-full px-2.5 py-0.5 hover:bg-[#fffbeb]" title="그 요일(오늘 또는 다음)로 가기">
                  {DOW[f.weekday]} {f.time.replace(/^0/, '')} {f.teacher} →
                </button>
              ))}
            </span>
            <button onClick={clearTestRecords} className="ml-auto text-[12px] border border-[#d97706] text-[#b45309] bg-white px-3 py-1.5 rounded-full hover:bg-[#fffbeb]">테스트 기록 지우기</button>
            <a href={center === 'uijeongbu' ? '/admin/timetable/uijeongbu' : '/admin/timetable'} className="text-[12px] underline underline-offset-2">시간표 관리로</a>
          </div>
        ) : (
          <a href={center === 'uijeongbu' ? '/admin/timetable-test/uijeongbu' : '/admin/timetable-test'} className="inline-block mb-3 text-[12px] text-[#888] underline underline-offset-2">시간표(테스트) — 김유담으로 연습하기 →</a>
        )}

        {/* 아직 결제 안 한 소급·미결 — 날짜마다 몇 건인지. 누르면 그날로 */}
        {!isTest && laterPays.length > 0 && (
          <div className="mb-4 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-[13px] text-[#991b1b]">
            <p className="font-semibold mb-1.5">결제 안 된 소급·미결이 {laterPays.length}건 있어요. 결제한 뒤 그날 결제방식을 바꾸고 [결제 완료]를 눌러 주세요.</p>
            <div className="flex flex-wrap gap-1.5">
              {[...laterPays.reduce((m, r) => m.set(r.day, [...(m.get(r.day) ?? []), r.method]), new Map<string, PayMethod[]>())].map(([d, ms]) => {
                const dd = parseYmd(d);
                const byMethod = [...ms.reduce((m, k) => m.set(k, (m.get(k) ?? 0) + 1), new Map<PayMethod, number>())]
                  .map(([k, n]) => `${PAY_METHODS.find(x => x.key === k)?.label ?? k} ${n}건`).join(' · ');
                return (
                  <button key={d} onClick={() => guard(() => { setMode('day'); setDay(d); })}
                    className={`text-[12px] border border-[#fca5a5] rounded-full px-2.5 py-0.5 hover:bg-white ${d === day && mode === 'day' ? 'bg-white font-semibold' : 'bg-[#fff7f7]'}`}>
                    {d.slice(0, 4)}/{d.slice(5, 7)}/{d.slice(8)}({DOW[dd.getDay()]}) {byMethod}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 보기 고르기 */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {!fixedCenter && CENTERS.map(cn => (
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
              {!isTest && addable.length > 0 && (
                <select value="" onChange={e => { const t = teachers.find(x => x.id === e.target.value); if (t) addTeacher(t); }}
                  className="ml-2 text-[12px] border border-[#f59e0b] text-[#b45309] bg-white px-2 h-8" title="이 날만 또는 앞으로 계속(이 요일 고정) 이 센터 시간표에 선생님 넣기">
                  <option value="">+ 선생님 추가</option>
                  {addable.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              )}
            </>
          ) : (
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5, 6, 0].map(w => (
                <button key={w} onClick={() => guard(() => setWeekday(w))}
                  className={`text-[13px] w-9 h-8 border ${weekday === w ? 'border-[#0a0a0a] bg-[#0a0a0a] text-white' : 'border-[#e5e5e5] hover:bg-[#f8f8f8]'}`}>{DOW[w]}</button>
              ))}
              {!isTest && addable.length > 0 && weekday !== 0 && (
                <select value="" onChange={e => { const t = teachers.find(x => x.id === e.target.value); if (t) addForever(t, weekday); }}
                  className="ml-2 text-[12px] border border-[#f59e0b] text-[#b45309] bg-white px-2 h-8" title="앞으로 계속 이 요일에 이 센터 시간표에 선생님 넣기">
                  <option value="">+ 선생님 추가</option>
                  {addable.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              )}
            </div>
          )}
        </div>
        <div className={`flex flex-wrap items-center gap-3 mb-3 ${isTest ? 'hidden' : ''}`}>
          <span className="text-[11px] text-[#999]">칸을 고친 뒤 아래 [스케줄 변경 완료]를 눌러야 저장돼요.</span>
          <span className="ml-auto flex items-center gap-1.5">
            <input type="month" value={exportMonth} onChange={e => e.target.value && setExportMonth(e.target.value)} className="text-[12px] border border-[#ddd] px-2 h-8" title="내려받을 달" />
            <button onClick={() => exportFile('xlsx')} disabled={!!exporting} title="엑셀 파일(.xlsx) — 주마다 시트 하나. 맥 Numbers 에서도 열려요"
              className="whitespace-nowrap text-[12px] border border-[#16a34a] text-[#16a34a] px-3 h-8 hover:bg-[#f0fdf4] disabled:opacity-50">월별 엑셀</button>
            <button onClick={() => exportFile('csv')} disabled={!!exporting} title="CSV 파일 — 주마다 이어 붙인 한 파일"
              className="whitespace-nowrap text-[12px] border border-[#ddd] text-[#555] px-3 h-8 hover:bg-[#f8f8f8] disabled:opacity-50">월별 CSV</button>
            {exporting && <span className="text-[11px] text-[#999]">{exporting}</span>}
          </span>
        </div>
        {failed && <p className="text-[13px] text-red-400 mb-3">불러오지 못했어요 — 시간표 SQL(supabase/timetable.sql)을 실행했는지 확인해 주세요. ({failed})</p>}

        {/* 표 — 이 센터 선생님만. 접은 선생님은 이름 칸만 좁게 */}
        <div ref={tableBox} className="overflow-x-hidden bg-white">
          {/* 고정 폭 표 — 칸 폭을 미리 정해서 화면 폭을 넘지 않는다(글꼴·브라우저가 달라도 가로 스크롤 없이). 너비를 안 정한 칸이 남는 폭을 나눠 가진다 */}
          {/* 수업·메모 칸은 선생님 한 사람 몫(per %)의 비율로 — 화면을 넓히거나 축소해도 이름·빈타임·결제방식만 커지지 않게 */}
          <table className="border-collapse text-[11px] w-full table-fixed" style={{ border: TEACHER_LINE, ...(fillH ? { height: fillH } : {}) }}>
            <colgroup>
              <col style={{ width: 52 }} />
              {/* 선생님 사이 세로선은 진하게 — 표가 border-collapse 라 col 의 왼쪽 선이 그 칸들의 선이 된다 */}
              {shown.map(t => folded.has(t.name) ? <col key={t.id} style={{ width: 72, borderLeft: TEACHER_LINE }} /> : (
                <Fragment key={t.id}>
                  <col style={{ borderLeft: TEACHER_LINE }} />
                  {mode === 'day' && <col />}
                  <col style={{ width: `max(40px, ${(per * 0.08).toFixed(2)}%)` }} />
                  {mode === 'day' && <col />}
                  {showMemo && <col style={{ width: memoOpen ? `max(80px, ${(per * 0.24).toFixed(2)}%)` : 16 }} />}
                </Fragment>
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className={`${th} sticky left-0 z-10 bg-white w-16`} style={{ borderBottom: TEACHER_LINE }}>시간</th>
                <th className={`${th} text-[13px] text-[#c026d3]`} style={{ borderBottom: TEACHER_LINE }} colSpan={shown.reduce((n, t) => n + (folded.has(t.name) ? 1 : (mode === 'day' ? 4 : 2) + (showMemo ? 1 : 0)), 0) || 1}>
                  {mode === 'day' ? `${DOW[d.getDay()]} / ${d.getMonth() + 1}월 ${d.getDate()}일` : `${DOW[weekday]}요일 고정 시간표`}
                  {mode === 'day' && holiday && <span className="ml-2 text-[12px] text-red-400">공휴일 — 고정 수업 없음</span>}
                </th>
              </tr>
              <tr>
                <th className={`${th} sticky left-0 z-10 bg-white`} />
                {shown.map(t => (
                  <th key={t.id} colSpan={folded.has(t.name) ? 1 : (mode === 'day' ? 4 : 2) + (showMemo ? 1 : 0)} className={`${th} text-[13px] text-[#16a34a] whitespace-nowrap`}>
                    <button type="button" onClick={() => toggleFold(t.name)} title={folded.has(t.name) ? '펼치기' : '접기'}
                      className="inline-flex items-center gap-1 hover:opacity-70">
                      {t.name}{folded.has(t.name)
                        ? <span className="text-[16px] leading-none text-[#16a34a]" aria-label="펼치기">▶</span>
                        : <span className="text-[16px] leading-none text-[#16a34a] opacity-70" aria-label="접기">◀</span>}
                    </button>
                    {!isTest && !folded.has(t.name) && (
                      <button type="button" onClick={() => clearTeacher(t)}
                        className="ml-1 text-[10px] rounded px-1 border text-[#a1a1aa] border-[#e4e4e7] hover:text-red-400"
                        title={mode === 'day' ? '이 날 이 선생님 칸 모두 비우기' : '이 요일 고정 수업 모두 비우기'}>비우기</button>
                    )}
                    {!isTest && mode === 'day' && !folded.has(t.name) && (
                      <button type="button" onClick={() => hideTeacher(t)}
                        className={`ml-1 text-[10px] rounded px-1 border ${assignOf(t.id) === 'add' ? 'text-[#f59e0b] border-[#fcd34d]' : 'text-[#a1a1aa] border-[#e4e4e7] hover:text-red-400'}`}
                        title="이 날만 또는 앞으로 계속(이 요일) 시간표에서 빼기">✕ 빼기</button>
                    )}
                    {!isTest && mode === 'day' && !folded.has(t.name) && (
                      <button type="button" onClick={() => openLeave(t)}
                        className="ml-1 text-[10px] rounded px-1 border text-[#e11d48] border-[#fecdd3] hover:bg-[#fff1f2]"
                        title="휴무 — 종일 또는 시간을 골라 그 수업을 취소하고, 수업 있던 아이들에게 보낼 알림을 남겨요">휴무</button>
                    )}
                    {mode === 'day' && leaveOf(t.id).length > 0 && (
                      <span className="block text-[10px] font-normal text-[#e11d48]" title={leaveOf(t.id).map(x => x.reason).filter(Boolean).join(' / ')}>
                        휴무 {leaveOf(t.id).some(x => !x.times) ? '종일' : leaveOf(t.id).flatMap(x => x.times ?? []).sort().map(x => x.replace(/^0/, '')).join(', ')}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
              <tr>
                <th className={`${th} sticky left-0 z-10 bg-white`} />
                {shown.map(t => folded.has(t.name) ? <th key={t.id} className={`${th} text-[10px] text-[#ccc] w-6`}>접음</th> : (
                  <FragmentPair key={t.id} left={<th className={`${th} text-[10px] text-[#999]`}>고정</th>} right={mode === 'day' ? <>
                    <th className={`${th} text-[10px] text-[#999]`}>빈타임</th>
                    <th className={`${th} text-[10px] text-[#999] px-0.5`}>수업</th>
                    <th className={`${th} text-[10px] text-[#16a34a]`}>결제방식</th>
                    {showMemo && memoTh}
                  </> : <><th className={`${th} text-[10px] text-[#999] px-0.5`}>수업</th>{showMemo && memoTh}</>} />
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(time => (
                <tr key={time}>
                  <td className={`border border-[#d4d4d8] px-1 text-center whitespace-nowrap sticky left-0 z-10 bg-white ${ROW_LABEL[time] ? 'text-[#c026d3]' : ''}`}>{time.replace(/^0/, '')}</td>
                  {shown.map(t => {
                    if (folded.has(t.name)) return <td key={t.id} className="border border-[#e4e4e7] bg-[#f4f4f5] w-6" />;
                    const left = cellOf(view.fixed, t.id, time);
                    const right = cellOf(view.open, t.id, time);
                    // 테스트 화면: 다른 아이 칸은 잠금(내용 숨김)
                    const lockL = locked(left), lockR = locked(right);
                    const lockedTd = <td className="border border-[#e4e4e7] h-9 bg-[#fafafa] text-center text-[10px] text-[#d4d4d8]" title="테스트 화면에선 다른 아이 칸을 고칠 수 없어요">·</td>;
                    // 수업 칸 — 그 시간 수업(빈타임 아이가 있으면 그 아이, 없으면 고정 아이)의 종류를 좁은 칸에서 고른다
                    const kc = mode === 'day' && right.status === 'child' ? right : left;
                    const kSide: Side = mode === 'day' && right.status === 'child' ? 'open' : 'fixed';
                    const kindTd = (
                      <td className="border border-[#e4e4e7] h-9 px-0 text-center align-middle whitespace-nowrap">
                        {kc.status === 'child' && !locked(kc) && kc.source !== 'booking' ? (
                          <label className={`relative flex h-9 w-full cursor-pointer items-center justify-center text-[11px] leading-none ${kc.kind ? 'text-[#52525b]' : 'text-[#d4d4d8]'} ${view.pend.has(`${kSide}|${t.id}|${time}`) ? 'bg-[#fff6d5]' : ''}`}
                            title="수업 종류 (운동 / 구강 / -)">
                            {/* 글씨는 그대로 보여 주고, 투명한 고르기 칸을 위에 겹친다 (손글씨 글꼴이 고르기 칸 안에서 잘려서) */}
                            {kindLabel(kc.kind) || '-'}
                            <select value={kc.kind ?? ''} onChange={e => changeKind({ teacher: t, time, side: kSide, cell: kc }, (e.target.value || null) as LessonKind)}
                              aria-label={`${kc.name} 수업 종류`} className="absolute inset-0 h-full w-full cursor-pointer opacity-0">
                              {LESSON_KINDS.map(o => <option key={o.label} value={o.key ?? ''}>{o.label}</option>)}
                            </select>
                          </label>
                        ) : kc.status === 'child' && !locked(kc) ? <span className="text-[11px] text-[#71717a]">{kindLabel(kc.kind)}</span> : null}
                      </td>
                    );
                    // 메모 칸 (선생님마다 맨 오른쪽) — 누르면 고친다
                    const memoTd = !showMemo ? null : !memoOpen ? (
                      // 접힌 메모 — 메모가 있으면 점만, 마우스를 올리면 내용
                      <td className="border border-[#e4e4e7] h-9 w-5 px-0 text-center align-middle text-[10px] text-[#a1a1aa]" title={kc.status === 'child' && kc.note ? `메모: ${kc.note}` : ''}>
                        {kc.status === 'child' && !locked(kc) && kc.note ? '•' : null}
                      </td>
                    ) : (
                      <td className={`border border-[#e4e4e7] h-9 min-w-[56px] max-w-[120px] px-1.5 text-left align-middle text-[10px] leading-[1.3] text-[#71717a] ${kc.status === 'child' && !locked(kc) ? 'cursor-pointer hover:bg-[#f0f6fe]' : ''}`}
                        title={kc.note ? `메모: ${kc.note}` : kc.status === 'child' ? '눌러서 메모 쓰기' : ''}
                        onClick={() => { if (kc.status === 'child' && !locked(kc)) changeNote({ teacher: t, time, side: kSide, cell: kc }); }}>
                        {kc.status === 'child' && !locked(kc) ? kc.note : null}
                      </td>
                    );
                    const pendL = view.pend.has(`fixed|${t.id}|${time}`);
                    const pendR = view.pend.has(`open|${t.id}|${time}`);
                    return (
                      <FragmentPair key={t.id}
                        left={lockL ? lockedTd :
                          <td className={`${td} ${pendL ? 'bg-[#fff6d5]' : mode === 'day' && right.status === 'child' ? 'bg-[#f4f4f5]' : ''}`} onClick={() => setEditing({ teacher: t, time, side: 'fixed', cell: left })}>
                            {/* 빈타임에 아이가 채워지면 옆 고정 칸은 회색으로 흐리게 */}
                            <CellText cell={left} label={postedOpen.has(`${t.id}|${time}`) ? undefined : ROW_LABEL[time]} muted={mode === 'day' && right.status === 'child'} />
                          </td>
                        }
                        right={mode === 'day' ? (<>
                          {lockR ? lockedTd : <td className={`${td} ${pendR ? 'bg-[#fff6d5]' : 'bg-[#fcfcfd]'}`} onClick={e => {
                            // 보호자 신청 칸은 안내가 있는 창으로, 그 밖은 칸 아래로 아이 명단을 연다
                            if (right.source === 'booking') { setEditing({ teacher: t, time, side: 'open', cell: right }); return; }
                            const b = e.currentTarget.getBoundingClientRect();
                            setPicking({ teacher: t, time, side: 'open', cell: right, rect: { left: b.left, top: b.top, bottom: b.bottom } });
                          }}>
                            <CellText cell={right} label={postedOpen.has(`${t.id}|${time}`) ? undefined : ROW_LABEL[time]} nonMember={isNonMember(right)} posted={mode === 'day' ? postedOpen.get(`${t.id}|${time}`) : undefined} />
                          </td>}
                          {kindTd}
                          <td className="border border-[#e4e4e7] h-9 px-1 text-center align-middle whitespace-nowrap bg-[#f9fdfa]">
                            {/* 빈타임에 아이가 채워지면 그 아이 결제만 (옆 고정 칸은 흐리게 = 그 시간엔 빈타임 아이 수업) */}
                            {(right.status === 'child' ? [right] : [left]).filter(c => c.status === 'child' && !c.moved && !locked(c)).map((c, i) => (
                              <PayCell key={i} cell={c} methods={payMethodsFor(center)} noBase={c === right} paid={c.childId ? paidOf(c.childId, time) : undefined}
                                pending={!!c.childId && draft.has(keyOf(c.childId, time))}
                                missing={!!c.childId && missingPay.has(keyOf(c.childId, time))}
                                round={c.childId ? rounds.get(keyOf(c.childId, time)) : undefined}
                                left={c.childId ? (m => remaining(c.childId!, m)) : undefined}
                                askAlways={c !== right && !!c.childId && c.childId === cellOf(board.fixed, t.id, time).childId}
                                onPay={c.childId ? (e, always) => { pay(c.childId!, t.id, time, e); if (always && e && !isLaterPay(e.method)) setFixedPayment(t, time, e.method); } : undefined} />
                            ))}
                          </td>
                          {memoTd}
                        </>) : <>{kindTd}{memoTd}</>}
                      />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 저장 버튼 — [스케줄 변경 완료] = 시간표 변경·결제방식 선택 저장 / [결제 완료] = 그날 결제 확정 */}
        <div ref={barBox} className="sticky bottom-0 z-20 flex flex-wrap items-center justify-end gap-x-3 gap-y-2 bg-white/95 border-t border-[#eee] py-3 mt-2">
          <span className="text-[12px] text-[#888]">
            {schedPending + draft.size
              ? `저장 안 한 변경 ${schedPending + draft.size}건 (시간표 ${schedPending} · 결제방식 ${draft.size})`
              : '칸이나 결제방식을 고친 뒤 [스케줄 변경 완료]를 눌러 주세요.'}
          </span>
          {schedPending + draft.size > 0 && (
            <button onClick={() => { setOps(new Map()); setAssignDraft(new Map()); setDraft(new Map()); }} disabled={savingSched || savingPay}
              className="text-[13px] border border-[#ddd] px-4 py-2 hover:bg-[#f8f8f8]">되돌리기</button>
          )}
          {mode === 'day' && !isTest && (
            <button onClick={sendLessonDay} disabled={!!schedPending || !lessons.length || sendingDay}
              title="이 날 수업이 있는 아이마다 보호자에게 '수업 일정' 알림톡 (결석·옮긴 수업 빼고, 시간표 변경을 먼저 저장해야 해요)"
              className="text-[13px] border border-[#f59e0b] text-[#b45309] bg-white px-4 py-2 hover:bg-[#fffbeb] disabled:opacity-40">
              {sendingDay ? '보내는 중…' : '이 날 수업 알림'}
            </button>
          )}
          <button onClick={saveSchedule} disabled={!(schedPending + draft.size) || savingSched}
            className="text-[13px] border border-[var(--brand)] bg-[var(--brand)] text-white px-5 py-2 hover:opacity-90 disabled:opacity-40">
            {savingSched ? '저장 중…' : '스케줄 변경 완료'}
          </button>
          {mode === 'day' && (
            <>
              <span className="w-px h-6 bg-[#e5e5e5] mx-1" />
              <span className={`text-[12px] ${missingPay.size || overRound ? 'text-red-400' : 'text-[#888]'}`}>
                {missingPay.size ? `결제방식이 빈 수업 ${missingPay.size}개 — 빨간 테두리 칸을 채워 주세요`
                  : overRound ? `월 횟수를 넘은 수업 ${overRound}개 — 빨간 글씨 칸의 결제방식을 바꿔 주세요`
                  : schedPending ? '시간표 변경을 먼저 저장해 주세요'
                  : toConfirm.length ? `확정할 결제 ${toConfirm.length}건${laterToday ? ` · 소급·미결 ${laterToday}건 남음` : ''}`
                  : laterToday ? `소급·미결 ${laterToday}건 남음 — 결제한 뒤 결제방식을 바꿔 [결제 완료]`
                  : lessons.length ? '결제가 모두 확정됐어요' : ''}
              </span>
              <button onClick={savePayments} disabled={!canPay || savingPay}
                className="text-[13px] border border-[#16a34a] bg-[#16a34a] text-white px-5 py-2 hover:opacity-90 disabled:opacity-40">
                {savingPay ? '저장 중…' : '결제 완료'}
              </button>
            </>
          )}
        </div>

        <p className="text-[11px] text-[#999] mt-3 leading-[2]">
          칸을 누르면 고칠 수 있어요. 앞 숫자 = 같은 이름 구분 · 줄 = 다른 선생님에게 옮김 · ? = 미정
          {mode === 'day' && <> · 빈타임의 &quot;신청&quot; = 보호자가 수업스케쥴에서 신청 · 결제방식: 기본 결제 → <span className="bg-[#e3edfc] text-[#1d4ed8] px-1 rounded">파랑 = 직접 고름</span> → [결제 완료] → <span className="bg-[#fde2e2] text-[#b91c1c] px-1 rounded">✓ 빨강 = 확정</span> · <span className="text-[#dc2626] font-semibold">빨간 글씨 = 소급·미결</span>(나중에 결제 — [결제 완료]에 확정 안 됨) · <span className="text-[#0d9488]">청록 이름</span> = 빈타임에 직접 작성(회원 아님) · <span className="text-[#dc2626] font-bold ring-2 ring-[#dc2626] px-1 rounded">바우처6!</span> = 월 횟수 넘침(바우처 6회째·굳센 4회째·장맞춤 9회째부터)</>}
        </p>
      </div>

      {leaveFor && (
        <Portal><TeacherLeaveDialog teacher={leaveFor} day={day} center={center} rows={rows} lessons={leaveLessons(leaveFor.id)}
          children={children} payments={payments} onClose={() => setLeaveFor(null)} onDone={() => { setLeaveFor(null); load(); }} /></Portal>
      )}
      {editing && (
        <Portal><CellEditor
          editing={editing}
          methods={payMethodsFor(center)}
          mode={mode}
          dayLabel={mode === 'day' ? `${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]})` : `${DOW[weekday]}요일 고정`}
          kids={pickKids}
          onClose={() => setEditing(null)}
          onSave={(input, weekly) => stage(editing, input, weekly)}
          onRestoreCancel={mode === 'day' ? () => restoreCancel(editing) : undefined}
          openBusy={mode === 'day' && editing.side === 'fixed' && !['empty', 'none'].includes(cellOf(view.open, editing.teacher.id, editing.time).status)}
        /></Portal>
      )}

      {picking && (
        <Portal><ChildPicker
          picking={picking}
          kids={pickKids}
          onPick={c => stage(picking, { status: 'child', childId: c.id, name: c.name, payment: '', kind: c.lessonKind ?? null, absent: false, moved: false })}
          onSave={input => stage(picking, input)}
          onMore={() => { setEditing(picking); setPicking(null); }}
          onClose={() => setPicking(null)}
        /></Portal>
      )}
    </div>
  );
}

const TEACHER_LINE = '2px solid #a1a1aa';

function FragmentPair({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return <>{left}{right}</>;
}

/** 칸 글자 — 3김채현 처럼 (숫자 + 이름) */
function CellText({ cell, label, muted, nonMember, posted }: { cell: CellView; label?: string; muted?: boolean; nonMember?: boolean; posted?: string }) {
  // 수업스케쥴 게시글에 올라가 있고 아직 신청 없는 빈타임 — 선생님 시간표 보기와 똑같이 "게시 중"
  if (posted && (cell.status === 'empty' || cell.status === 'none' || cell.status === 'off'))
    return <span className={`text-[10px] px-1 rounded ${posted === '게시 중' ? 'bg-[#ecfdf5] text-[#047857]' : 'bg-[#fef3c7] text-[#b45309]'}`}>{posted}</span>;
  if (cell.status === 'empty' || cell.status === 'none') {
    return label ? <span className="text-[#c4c4cc]">{label}</span> : null;
  }
  if (cell.status === 'undecided') return <span className="text-[#71717a]">?</span>;
  if (cell.status === 'off') return <span className="text-[#a1a1aa]">수업 안 함</span>;
  return (
    <span title={nonMember ? `회원 아님 — 직접 작성${cell.note ? ` · ${cell.note}` : ''}` : cell.note}
      className={`${muted ? 'text-[#8a8a93]' : nonMember ? 'text-[#0d9488]' : 'text-[#27272a]'} ${cell.moved ? 'line-through' : ''} ${cell.absent ? 'opacity-50' : ''}`}>
      {cell.name}{cell.number ?? ''}
      {cell.absent && <span className="ml-0.5 text-[9px] text-[#a1a1aa]">결석</span>}
      {cell.source === 'booking' && <span className="ml-0.5 text-[9px] text-[#a1a1aa]">신청</span>}
      {cell.subName && <span className="block text-[9px] leading-[1.2] text-[#a1a1aa]">{cell.subName}</span>}
      {/* 선생님 휴무로 취소된 수업 — 줄 + 휴무 */}
      {cell.moved && (cell.note?.startsWith('휴무') || cell.note?.startsWith('취소'))
        ? <span className="ml-0.5 text-[9px] text-[#e11d48] no-underline inline-block" title={cell.note}>{cell.note.startsWith('휴무') ? '휴무' : '취소'}</span>
        : cell.note && <span className="ml-0.5 text-[9px] text-[#f59e0b]">●</span>}
    </span>
  );
}

/** 결제방식 칸 — 체크 전엔 기본 결제를 흐리게, 체크하면 초록 ✓와 남은 횟수(바우처 2/3, 선결제 33). 누르면 드롭박스로 고르고, 직접 적을 수도 있다 */
function PayCell({ cell, methods, noBase, paid, pending, missing, round, left, askAlways, onPay }: {
  cell: CellView;
  /** 이 센터에서 쓰는 결제 (수색 굳센 / 의정부 장맞춤) */
  methods: typeof PAY_METHODS;
  /** 빈타임 아이 — 기본 결제를 보여 주지 않고 비워 둔다 */
  noBase?: boolean;
  paid?: PayEntry;
  /** 저장 안 한 체크 */
  pending?: boolean;
  /** 결제방식이 비어 있음 — 채워야 [결제 완료]를 누를 수 있다 */
  missing?: boolean;
  /** 바우처·굳센·꿈이든 월 회차 — over = 빨간 글씨([결제 완료] 막힘) */
  round?: { n: number; over: boolean };
  left?: (m: PayMethod) => string | undefined;
  /** 고정 아이 — 기본과 다른 결제를 고르면 이번만인지 앞으로 계속인지 묻는다 */
  askAlways?: boolean;
  onPay?: (e: PayEntry | null, always?: boolean) => void;
}) {
  if (cell.absent) return <span className="block text-[10px] text-[#c4c4cc]">결석</span>;
  const base = noBase ? undefined : defaultMethod(cell.payment);
  const label = (k?: PayMethod) => PAY_METHODS.find(m => m.key === k)?.label;
  // 칸에 보이는 짧은 이름 (장맞춤 = 장))
  const cellLabel = (k?: PayMethod) => { const m = PAY_METHODS.find(x => x.key === k); return m?.cell ?? m?.label; };
  // 고르는 목록 — 이 센터 결제 + (다른 센터 결제로 이미 골라 둔 것)
  const options = paid && !paid.note && !methods.some(m => m.key === paid.method) ? [...methods, ...PAY_METHODS.filter(m => m.key === paid.method)] : methods;
  // 회차를 붙이는 결제는 남은 횟수 대신 회차만 (고르는 목록은 그대로)
  const rest = paid?.confirmed && !pending && !round ? left?.(paid.method) : undefined;
  // 회차는 결제방식이 있는 칸에만 — 같은 아이가 같은 시간 다른 선생님 칸에도 있으면 결제방식 없는 칸에 숫자만 뜨던 것 막기
  const rn = round && (paid || base) ? <>{round.n}{round.over && <span className="ml-0.5">!</span>}</> : null;
  // 단계 — 기본(그대로) / 파랑: 직접 고름(저장 전) / 빨강: 결제 완료로 확정
  // 파랑 = 고름(저장 전·선택 저장됨) / 빨강 = 결제 완료로 확정
  const confirmed = !pending && !!paid?.confirmed;
  // 회차 넘침은 확정(빨강 바탕)과 헷갈리지 않게 — 흰 바탕 + 빨간 테두리 + ! 
  // 소급·미결 = 빨간 글씨(나중에 결제)
  const later = isLaterPay(paid?.method);
  const tone = round?.over ? 'bg-white text-[#dc2626] font-bold ring-2 ring-[#dc2626]' : later ? 'bg-white text-[#dc2626] font-semibold' : confirmed ? 'bg-[#fde2e2] text-[#b91c1c]' : pending || paid ? 'bg-[#e3edfc] text-[#1d4ed8]' : 'text-[#27272a]';
  const text = paid
    ? <span>{confirmed ? '✓' : ''}{paid.note || cellLabel(paid.method)}{rn}{rest && <span className="ml-0.5 text-[10px] opacity-80">{rest}</span>}</span>
    : <span>{pending ? '체크 풀기' : (cellLabel(base) ?? '')}{!pending && rn}</span>;
  if (!onPay) return <span className="block text-[11px] text-[#27272a]" title="아이 명단에 없는 이름이라 체크할 수 없어요">{cellLabel(base) ?? ''}</span>;
  return (
    <label className={`relative block min-h-[20px] text-[11px] cursor-pointer rounded px-1 ${tone} ${missing && !round?.over ? 'ring-1 ring-red-300' : ''}`}
      title={round?.over ? `이번 달 ${round.n}회째 — 월 횟수를 넘었어요. 결제방식을 바꿔야 [결제 완료]를 누를 수 있어요` : later ? '나중에 결제(소급·미결) — 결제한 뒤 결제방식을 바꾸고 [결제 완료]를 눌러 주세요' : pending ? '저장 전 — [스케줄 변경 완료]로 저장, [결제 완료]로 확정' : paid?.confirmed ? '결제 완료로 확정됨' : paid ? '고른 결제 — [결제 완료]를 눌러야 확정돼요' : '기본 결제 — 눌러서 고르기'}>
      {text}
      <select value={paid ? (paid.note ? 'custom' : paid.method) : ''}
        onChange={async e => {
          const v = e.target.value;
          if (!v) onPay(null);
          else if (v === 'custom') {
            const t = await askPrompt('결제 방식을 적어 주세요', paid?.note ?? '');
            if (t?.trim()) onPay({ method: 'other', note: t.trim() });
          } else if (askAlways && v !== base && !isLaterPay(v as PayMethod)) {
            const r = await askChoice(`${cell.name} — ${label(v as PayMethod)}\n이번 수업만 바꿀까요,\n앞으로 계속 ${label(v as PayMethod)}(으)로 할까요?`, '이번만', '앞으로 계속');
            if (r) onPay({ method: v as PayMethod }, r === 'b');
          } else onPay({ method: v as PayMethod });
        }}
        className="absolute inset-0 w-full opacity-0 cursor-pointer" aria-label={`${cell.name} 결제 체크`}>
        <option value="">체크 안 함{base ? ` (기본 ${label(base)})` : ''}</option>
        {options.map(m => <option key={m.key} value={m.key}>{m.label}{m.key === base ? ' (기본)' : ''}</option>)}
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
  // 검색은 "이름숫자"(동명이인 구분, 예: 김채현3)·회원 코드로
  const list = kids.filter(c => !query || `${c.name}${c.number ?? ''}`.toLowerCase().includes(query) || (c.memberCode ?? '').toLowerCase().includes(query));
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
                {c.name}{c.number ?? ''}
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

function CellEditor({ editing, methods, mode, dayLabel, kids, onClose, onSave, onRestoreCancel, openBusy }: {
  editing: Editing;
  /** 이 센터에서 쓰는 결제 (수색 굳센 / 의정부 장맞춤) */
  methods: typeof PAY_METHODS;
  mode: Mode;
  dayLabel: string;
  kids: Child[];
  onClose: () => void;
  /** from = 날짜별 화면의 고정 칸에서 "이 날부터 고정" */
  onSave: (input: CellInput | 'reset', from?: boolean) => void;
  /** 보호자가 취소한 수업 되돌리기 (날짜별 화면) */
  onRestoreCancel?: () => void;
  /** 날짜별 고정 칸 — 같은 시간 빈타임에 이미 수업(아이·?·x)이 있으면 고정 아이를 다시 살릴 수 없다 */
  openBusy?: boolean;
}) {
  // 빈타임에 수업이 있는데 고정 아이를 살리려 할 때
  const blockedByOpen = () => showAlert('같은 시간 빈타임에 다른 수업이 있어서 고정 아이 수업을 살릴 수 없어요.\n먼저 빈타임 칸을 비운 뒤 다시 해 주세요.');
  const { teacher, time, side, cell } = editing;
  // 보호자가 마이페이지에서 취소한 칸 — 줄 + "취소 · 보호자"
  const guardianCancelled = cell.status === 'child' && cell.moved && !!cell.note?.startsWith('취소');
  const restoreBox = guardianCancelled && onRestoreCancel ? (
    <div className="rounded-lg bg-[#fef2f2] px-3 py-2.5 space-y-2">
      <p className="text-[12px] leading-[1.7] text-[#b91c1c]">{cell.note?.includes('보호자') ? '보호자가 마이페이지에서 취소한 수업이에요.' : '취소된 수업이에요(빈타임에 다른 수업을 넣어 취소됨).'} 되돌린 뒤 [스케줄 변경 완료]를 눌러야 반영돼요. (취소할 때 지워진 '선택' 결제방식은 다시 골라 주세요)</p>
      <button onClick={() => (openBusy ? blockedByOpen() : onRestoreCancel?.())} className="text-[13px] px-3 py-1.5 rounded-full border border-[#b91c1c] text-[#b91c1c] bg-white hover:bg-[#fff5f5]">취소 되돌리기 (취소 전으로)</button>
    </div>
  ) : null;
  // 이름 칸은 "이름숫자"(동명이인 구분)로 보여 주고 고른다 — 저장할 땐 이름과 숫자를 나눠 둔 명단 아이로
  const disp = (c: Child) => `${c.name}${c.number ?? ''}`;
  const [name, setName] = useState(() => {
    if (cell.status !== 'child') return '';
    const k = cell.childId ? kids.find(c => c.id === cell.childId) : undefined;
    return k ? disp(k) : cell.name ?? '';
  });
  const [payment, setPayment] = useState(cell.payment);
  // 수업 종류 — 운동 / 구강 / 없음. 아이를 고르면 그 아이 기본값으로
  const [kind, setKind] = useState<LessonKind>(cell.kind ?? (cell.oral ? 'oral' : null));
  const [absent, setAbsent] = useState(cell.absent);
  const [moved, setMoved] = useState(cell.moved);
  const [note, setNote] = useState(cell.note ?? '');
  const child = kids.find(c => disp(c) === name.trim()) ?? kids.find(c => c.name === name.trim() && !c.number);

  const pickName = (v: string) => {
    setName(v);
    // 결제는 아이가 아니라 이 자리(요일·시간)마다 정한다 — 아이를 바꿔도 결제방식은 그대로.
    // 수업 종류는 다른 아이로 바꿀 때 그 아이 기본값으로
    const c = kids.find(x => disp(x) === v.trim());
    if (c && c.id !== cell.childId) setKind(c.lessonKind ?? null);
  };


  const save = () => {
    // (빈타임 칸) 이름을 비우고 저장 — 원래대로
    if (!name.trim()) { onSave('reset'); return; }
    onSave({ status: 'child', childId: child?.id ?? null, name: child?.name ?? name.trim(), payment, kind, absent, moved, note });
  };

  const isBooking = cell.source === 'booking';
  const chip = 'text-[13px] px-3 py-2 border rounded-full';

  // 고정 자리 — 아이·구강·결제방식만 고르고 [이 날부터 고정](날짜별) / [저장](고정 시간표)
  if (side === 'fixed') {
    const base = defaultMethod(payment);
    const saveFixedSeat = async () => {
      if (!name.trim()) {
        if (mode === 'day' && cell.status === 'child' && !(await askConfirm(`${dayLabel}부터 이 자리 고정 수업을 없앨까요?`))) return;
        onSave(mode === 'day' ? { status: 'none' } : 'reset', mode === 'day');
        return;
      }
      onSave({ status: 'child', childId: child?.id ?? null, name: child?.name ?? name.trim(), payment, kind, absent: false, moved: false }, mode === 'day');
    };
    return (
      <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4" onClick={e => e.stopPropagation()}>
          <p className="text-[13px] text-[#888]">{dayLabel} · {time} · {teacher.name} 선생님 · 고정 자리</p>
          {restoreBox}
          <label className="block">
            <span className="block text-[11px] text-[#999] mb-1">아이 (명단에서 검색)</span>
            <input list="tt-children" value={name} onChange={e => pickName(e.target.value)} autoFocus placeholder="이름 (비우면 고정 수업 없음)"
              className="w-full border-b border-[#ddd] py-1.5 text-[15px] outline-none focus:border-[var(--brand)]" />
            <datalist id="tt-children">
              {kids.map(c => <option key={c.id} value={disp(c)} />)}
            </datalist>
          </label>
          {name.trim() && !child && <p className="text-[11px] text-red-400 -mt-2">아이 명단에 없는 이름이에요. 명단에서 골라 주세요.</p>}
          <div className="flex items-center gap-4 text-[13px]">
            <label className="flex items-center gap-1.5">수업
              <select value={kind ?? ''} onChange={e => setKind((e.target.value || null) as LessonKind)} className="border border-[#ddd] px-2 py-1 text-[13px] bg-white">
                {LESSON_KINDS.map(k => <option key={k.label} value={k.key ?? ''}>{k.label}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-1.5">
              결제방식
              <select value={base ?? ''} onChange={e => setPayment(PAY_METHODS.find(m => m.key === e.target.value)?.short ?? '')}
                className="border border-[#ddd] px-2 py-1 text-[13px] bg-white">
                <option value="">없음</option>
                {(base && !methods.some(m => m.key === base) ? [...methods, ...PAY_METHODS.filter(m => m.key === base)] : methods).map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={saveFixedSeat} disabled={!!name.trim() && !child} className={`${chip} border-[#0a0a0a] bg-[#0a0a0a] text-white disabled:opacity-40`}>
              {mode === 'day' ? '이 날부터 반영' : '오늘부터 반영'}
            </button>
            {/* 이 날만 결석 — 고정 수업은 그대로, 그날 칸에만 결석(x) */}
            {mode === 'day' && cell.status === 'child' && !guardianCancelled && (
              <button onClick={() => (cell.absent && openBusy ? blockedByOpen() : onSave({ status: 'child', childId: cell.childId ?? null, name: cell.name, payment: cell.payment, kind: cell.kind ?? null, absent: !cell.absent, moved: cell.moved, note: cell.note }))}
                className={`${chip} ${cell.absent ? 'border-[#ddd] text-[#555]' : 'border-[#a1a1aa] text-[#52525b]'}`}>
                {cell.absent ? '결석 취소' : '이 날만 결석'}
              </button>
            )}
            <button onClick={onClose} className={`${chip} border-transparent text-[#888]`}>닫기</button>
          </div>
          <p className="text-[11px] text-[#aaa] leading-[1.7]">[스케줄 변경 완료]를 누르면 {mode === 'day' ? dayLabel : '오늘'}부터 매주 이렇게(아이·수업·결제방식) 바뀌어요. 지난 날짜는 그대로 남아요.</p>
          {mode === 'day' && cell.status === 'child' && <p className="text-[11px] text-[#aaa] leading-[1.7] -mt-2">[이 날만 결석]은 {dayLabel} 하루만 결석으로 바꿔요(고정 수업은 그대로).</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <p className="text-[13px] text-[#888]">
          {dayLabel} · {time} · {teacher.name} 선생님 · 빈타임 칸
        </p>
        {restoreBox}
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
              {kids.map(c => <option key={c.id} value={disp(c)} />)}
            </datalist>
          </label>
        </div>
        {child?.number !== undefined && <p className="text-[11px] text-[#999] -mt-2">아이 명단: {child.number}{child.name}</p>}

        <div className="flex flex-wrap gap-3 text-[13px]">
          <label className="flex items-center gap-1.5">수업
              <select value={kind ?? ''} onChange={e => setKind((e.target.value || null) as LessonKind)} className="border border-[#ddd] px-2 py-1 text-[13px] bg-white">
                {LESSON_KINDS.map(k => <option key={k.label} value={k.key ?? ''}>{k.label}</option>)}
              </select>
            </label>
          {mode === 'day' && <label className="flex items-center gap-1.5"><input type="checkbox" checked={absent} onChange={e => setAbsent(e.target.checked)} />결석(x)</label>}
          {mode === 'day' && <label className="flex items-center gap-1.5"><input type="checkbox" checked={moved} onChange={e => setMoved(e.target.checked)} />다른 선생님에게 옮김</label>}
        </div>
        {mode === 'day' && (
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="메모 (선택)"
            className="w-full border-b border-[#eee] py-1 text-[13px] outline-none focus:border-[var(--brand)]" />
        )}


        <div className="flex flex-wrap gap-1.5">
          <button onClick={save} className={`${chip} border-[var(--brand)] bg-[var(--brand)] text-white`}>저장</button>
          {mode === 'day' && <button onClick={() => onSave({ status: 'undecided' })} className={`${chip} border-[#ddd]`}>? 미정</button>}
          {mode === 'day' && <button onClick={() => onSave({ status: 'off' })} className={`${chip} border-[#ddd]`}>x 수업 안 함</button>}
          {mode === 'day' && cell.source === 'override' && (
            <button onClick={() => onSave('reset')} className={`${chip} border-[#ddd]`}>원래대로</button>
          )}
          <button onClick={onClose} className={`${chip} border-transparent text-[#888]`}>닫기</button>
        </div>
      </div>
    </div>
  );
}
