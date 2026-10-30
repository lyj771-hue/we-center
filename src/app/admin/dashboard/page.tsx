'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useAdmin } from '@/components/AdminContext';
import type { Teacher } from '@/lib/schedule';
import { getTeachers } from '@/lib/schedule';
import type { Center, PayMethod } from '@/lib/timetable';
import { CENTERS, getMonthLessonPayments, methodInCenter } from '@/lib/timetable';
import { downloadCsv, downloadXlsx, type Sheet } from '@/lib/exportFile';
import { showAlert } from '@/lib/dialog';

// 수업 진행 현황 (관리자) — 달·센터를 골라 선생님별 × 결제방식별 진행 횟수.
// 진행 횟수 = 시간표에서 [결제 완료]로 확정된 수업. [스케줄 변경 완료]로 고르기만 한 것은 따로 작게 센다.

// 지원(바우처·굳센·장맞춤·꿈이든·지원금·학교) — 하나씩 보고 합계, 사설(그 밖: 선결제·카드·현금·직접 작성) — 묶어서 한 칸
// 굳센은 수색, 장맞춤은 의정부 — 한 센터만 볼 땐 그 센터 것만, 전체는 둘 다
const ALL_SUPPORT: { key: PayMethod; label: string }[] = [
  { key: 'voucher', label: '바우처' }, { key: 'gusen', label: '굳센' }, { key: 'jangmatchum', label: '장맞춤' }, { key: 'kkumideun', label: '꿈이든' },
  { key: 'subsidy', label: '지원금' }, { key: 'woojin_ext', label: '학교외부' }, { key: 'woojin_self', label: '학교자율' },
];
const PRIVATE: { key: PayMethod; label: string }[] = [
  { key: 'prepaid', label: '선결제A' }, { key: 'prepaid_b', label: '선결제B' }, { key: 'prepaid_c', label: '선결제C' }, { key: 'card', label: '신용카드' }, { key: 'cash', label: '현금' }, { key: 'other', label: '직접 작성' },
];

const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const shiftMonth = (ym: string, n: number) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

type Row = { teacher_id: string | null; method: PayMethod; confirmed: boolean; center: string };

export default function DashboardPage() {
  const { canSeeStats: isAdmin } = useAdmin();   // 수업 현황은 전체 관리자만(직원 계정은 못 본다)
  const [month, setMonth] = useState(thisMonth);
  const [center, setCenter] = useState<Center | 'all'>('all');
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [failed, setFailed] = useState('');
  const [loading, setLoading] = useState(false);
  const SUPPORT = ALL_SUPPORT.filter(x => center === 'all' || methodInCenter(x.key, center));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, r] = await Promise.all([getTeachers(), getMonthLessonPayments(month)]);
      setTeachers(t); setRows(r as Row[]); setFailed('');
    } catch (e) {
      setFailed((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [month]);
  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  // 센터별 선생님 — 기본 센터로(은평: 이정길·허홍석·선우용 / 의정부: 김영훈·문석현). 공휴일에 다른 지점에서 수업해도 기본 센터로 센다.
  // 두 센터에서 일하는 설영수·이원재는 일한 곳으로 — 은평·의정부 두 줄에 나온다
  // 표 순서 — 시간표와 같게 은평: 설영수·이정길·허홍석·선우용·이원재, 의정부: 설영수·김영훈·문석현·이원재 (그 밖의 선생님은 뒤에)
  const ORDER: Record<string, string[]> = { eunpyeong: ['설영수', '이정길', '허홍석', '선우용', '이원재'], uijeongbu: ['설영수', '김영훈', '문석현', '이원재'] };
  const orderOf = (name: string, c: string) => ((ORDER[c] ?? []).indexOf(name) + 1 || 99);
  // 현황에서 빼는 선생님 — 표·합계·엑셀 모두에서 빠진다
  const EXCLUDE: string[] = ['설영수'];
  const BY_WORKPLACE = ['설영수', '이원재'];
  const keyOf = (tid: string, c: string) => `${tid}|${c}`;
  const teacherById = useMemo(() => new Map(teachers.map(t => [t.id, t])), [teachers]);
  const homeOf = (t: Teacher) => (t.centers.length === 1 ? t.centers[0] : null);
  const inSection = (t: Teacher, c: string) => !EXCLUDE.includes(t.name) && (BY_WORKPLACE.includes(t.name) ? t.centers.includes(c) : homeOf(t) === c);
  // 수업 기록이 어느 센터 칸에 들어가나
  const centerOfRow = (r: Row) => {
    const t = r.teacher_id ? teacherById.get(r.teacher_id) : undefined;
    return (t && !BY_WORKPLACE.includes(t.name) && homeOf(t)) || (r.center ?? 'eunpyeong');
  };
  const sections = CENTERS.filter(c => center === 'all' || c.key === center)
    .map(c => ({ ...c, teachers: teachers.filter(t => inSection(t, c.key)).sort((x, y) => orderOf(x.name, c.key) - orderOf(y.name, c.key)) }));
  const inShown = useMemo(() => new Set(sections.flatMap(sct => sct.teachers.map(t => keyOf(t.id, sct.key)))), [sections]);
  const filtered = useMemo(() => rows.filter(r => r.teacher_id && inShown.has(keyOf(r.teacher_id, centerOfRow(r)))), [rows, inShown]);
  const done = filtered.filter(r => r.confirmed);
  const pendingCount = filtered.length - done.length;
  // 선생님 × 결제방식 → 횟수
  const grid = useMemo(() => {
    const g = new Map<string, Map<PayMethod, number>>();
    for (const r of done) {
      const tid = keyOf(r.teacher_id ?? '?', centerOfRow(r));
      const m = g.get(tid) ?? new Map<PayMethod, number>();
      m.set(r.method, (m.get(r.method) ?? 0) + 1);
      g.set(tid, m);
    }
    return g;
  }, [done]);
  const totalOf = (tid: string) => [...(grid.get(tid)?.values() ?? [])].reduce((a, b) => a + b, 0);
  const methodTotal = (k: PayMethod) => done.filter(r => r.method === k).length;
  const sumOf = (tid: string, list: { key: PayMethod }[]) => list.reduce((a, x) => a + (grid.get(tid)?.get(x.key) ?? 0), 0);
  const groupTotal = (list: { key: PayMethod }[]) => list.reduce((a, x) => a + methodTotal(x.key), 0);
  // 센터 소계 — 그 센터 선생님들만
  const secSum = (ts: Teacher[], c: string, list: { key: PayMethod }[]) => ts.reduce((a, t) => a + sumOf(keyOf(t.id, c), list), 0);
  const secMethod = (ts: Teacher[], c: string, k: PayMethod) => ts.reduce((a, t) => a + (grid.get(keyOf(t.id, c))?.get(k) ?? 0), 0);
  // 표에 나오는 선생님 — 그 센터에서 일하거나 이 달 기록이 있는 선생님
  const cellMax = Math.max(1, ...[...grid.values()].flatMap(m => [...m.values()]));
  const [y, m] = month.split('-').map(Number);

  const sheet = (): Sheet => ({
    name: `${y}년 ${m}월 수업 현황`,
    rows: [
      ['센터', '선생님', ...SUPPORT.map(x => x.label), '지원 합계', '사설', '전체 합계'],
      ...sections.flatMap(sct => [
        ...sct.teachers.map(t => { const k = keyOf(t.id, sct.key); return [sct.label, t.name, ...SUPPORT.map(x => grid.get(k)?.get(x.key) ?? 0), sumOf(k, SUPPORT), sumOf(k, PRIVATE), totalOf(k)]; }),
        [sct.label, `${sct.label} 합계`, ...SUPPORT.map(x => secMethod(sct.teachers, sct.key, x.key)), secSum(sct.teachers, sct.key, SUPPORT), secSum(sct.teachers, sct.key, PRIVATE), secSum(sct.teachers, sct.key, [...SUPPORT, ...PRIVATE])],
      ]),
      ...(sections.length > 1 ? [['', '전체 합계', ...SUPPORT.map(x => methodTotal(x.key)), groupTotal(SUPPORT), groupTotal(PRIVATE), done.length]] : []),
    ],
    cols: [7, 10, ...SUPPORT.map(() => 8), 9, 8, 9],
  });

  if (!isAdmin) return <p className="text-center text-[14px] text-[#aaa] py-32">관리자만 볼 수 있는 화면이에요.</p>;

  // 칸 색 — 한 가지 색(브랜드 파랑)을 횟수만큼 진하게 (0은 칠하지 않는다)
  const shade = (n: number) => (n ? `rgba(8, 123, 234, ${0.08 + 0.42 * (n / cellMax)})` : 'transparent');
  const th = 'px-3 py-2.5 font-normal text-[12px] text-[#888] whitespace-nowrap';

  return (
    <div className="px-3 md:px-6 pt-6 pb-14 fade-up">
      <div className="max-w-[1200px] mx-auto">
        <h1 className="display-heading mb-5">수업 현황</h1>

        {/* 고르기 — 달 · 센터 · 내려받기 */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <button onClick={() => setMonth(x => shiftMonth(x, -1))} className="text-[13px] border border-[#e5e5e5] w-8 h-8 hover:bg-[#f8f8f8]" aria-label="지난달">‹</button>
          <input type="month" value={month} onChange={e => e.target.value && setMonth(e.target.value)} className="text-[13px] border border-[#ddd] px-2 h-8" />
          <button onClick={() => setMonth(x => shiftMonth(x, 1))} className="text-[13px] border border-[#e5e5e5] w-8 h-8 hover:bg-[#f8f8f8]" aria-label="다음달">›</button>
          {month !== thisMonth() && <button onClick={() => setMonth(thisMonth())} className="text-[12px] text-[#888] underline underline-offset-2">이번 달</button>}
          <span className="w-3" />
          {([['all', '전체'], ...CENTERS.map(c => [c.key, c.label])] as [Center | 'all', string][]).map(([k, l]) => (
            <button key={k} onClick={() => setCenter(k)}
              className={`text-[13px] px-3 py-1.5 border ${center === k ? 'border-[var(--brand)] bg-[var(--brand)] text-white' : 'border-[#e5e5e5] hover:bg-[#f8f8f8]'}`}>{l}</button>
          ))}
          {loading && <span className="text-[12px] text-[#aaa]">불러오는 중…</span>}
          <span className="ml-auto flex gap-1.5">
            <button onClick={() => downloadXlsx([sheet()], `수업현황_${month.replace('-', '')}`).catch(e => showAlert(`내려받지 못했어요.\n${(e as Error).message}`))}
              className="text-[12px] border border-[#16a34a] text-[#16a34a] px-3 h-8 hover:bg-[#f0fdf4]">엑셀</button>
            <button onClick={() => downloadCsv([sheet()], `수업현황_${month.replace('-', '')}`)} className="text-[12px] border border-[#ddd] text-[#555] px-3 h-8 hover:bg-[#f8f8f8]">CSV</button>
          </span>
        </div>
        {failed && <p className="text-[13px] text-red-400 mb-4">불러오지 못했어요. ({failed})</p>}

        {/* 한눈에 — 이 달 진행한 수업 수와 결제방식별 합계 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-8">
          <div className="col-span-2 rounded-xl border border-[#e5e5e5] bg-white px-5 py-4">
            <p className="text-[12px] text-[#888]">{m}월 진행한 수업</p>
            <p className="mt-1 text-[34px] leading-none text-[#27272a] tabular-nums">{done.length}<span className="ml-1 text-[14px] text-[#888]">회</span></p>
            {pendingCount > 0 && <p className="mt-2 text-[11px] text-[#aaa]">결제방식만 고르고 아직 확정 안 한 수업 {pendingCount}회 (포함 안 함)</p>}
          </div>
          {[{ label: '지원 합계', n: groupTotal(SUPPORT), sub: SUPPORT.map(x => `${x.label} ${methodTotal(x.key)}`).join(' · ') },
            { label: '사설', n: groupTotal(PRIVATE), sub: PRIVATE.map(x => `${x.label} ${methodTotal(x.key)}`).join(' · ') }].map(g => (
            <div key={g.label} className="col-span-2 rounded-xl border border-[#e5e5e5] bg-white px-5 py-4">
              <p className="text-[12px] text-[#888]">{g.label}</p>
              <p className="mt-1 text-[28px] leading-none text-[#27272a] tabular-nums">{g.n}<span className="ml-1 text-[13px] text-[#888]">회</span></p>
              <p className="mt-2 text-[11px] text-[#aaa]">{g.sub}</p>
            </div>
          ))}
        </div>

        {/* 선생님별 × 결제방식별 진행 횟수 — 칸이 진할수록 많이 */}
        <h2 className="text-[16px] text-[#27272a] mb-3">선생님별 진행 횟수 <span className="text-[12px] text-[#999]">{y}년 {m}월 · {center === 'all' ? '은평점 · 의정부점' : `${CENTERS.find(c => c.key === center)?.label}점`}</span></h2>
        <div className="overflow-x-auto rounded-xl border border-[#e5e5e5] bg-white">
          <table className="w-full text-[14px] border-collapse">
            <thead>
              <tr className="border-b border-[#eee] bg-[#fafafa]">
                <th className={`${th} text-left sticky left-0 bg-[#fafafa]`}>선생님</th>
                {SUPPORT.map(x => <th key={x.key} className={`${th} text-center`}>{x.label}</th>)}
                <th className={`${th} text-center bg-[#f1f5fb] text-[#555]`}>지원 합계</th>
                <th className={`${th} text-center bg-[#f7f7f7] text-[#555]`} title="선결제A·B·C·신용카드·현금·직접 작성">사설</th>
                <th className={`${th} text-center text-[#27272a]`}>전체 합계</th>
              </tr>
            </thead>
            <tbody>
              {sections.map(sct => (
                <Fragment key={sct.key}>
                  {/* 센터 머리 줄 */}
                  <tr className="border-b border-[#eee] bg-white">
                    <td colSpan={SUPPORT.length + 4} className="px-3 pt-4 pb-1.5 text-[13px] text-[var(--brand)]">{sct.label}점</td>
                  </tr>
                  {sct.teachers.map(t => {
                    const k = keyOf(t.id, sct.key);
                    const total = totalOf(k);
                    return (
                      <tr key={t.id} className="border-b border-[#f3f3f3]">
                        <td className="px-3 py-2 pl-5 whitespace-nowrap sticky left-0 bg-white">{t.name}</td>
                        {SUPPORT.map(x => {
                          const n = grid.get(k)?.get(x.key) ?? 0;
                          return (
                            <td key={x.key} className="px-1 py-1 text-center">
                              <span title={`${t.name} · ${x.label} ${n}회`} className={`block rounded-md py-1.5 tabular-nums ${n ? 'text-[#27272a]' : 'text-[#d4d4d8]'}`} style={{ background: shade(n) }}>{n}</span>
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 text-center tabular-nums text-[13px] bg-[#f1f5fb] text-[#27272a]" title={`${t.name} 지원 합계`}>{sumOf(k, SUPPORT)}</td>
                        <td className="px-3 py-2 text-center tabular-nums text-[13px] bg-[#f7f7f7] text-[#27272a]"
                          title={`${t.name} 사설 — ${PRIVATE.map(x => `${x.label} ${grid.get(k)?.get(x.key) ?? 0}`).join(' · ')}`}>{sumOf(k, PRIVATE)}</td>
                        <td className="px-3 py-2 text-center tabular-nums text-[14px] text-[#27272a]" title={`${t.name} 전체 ${total}회`}>{total}</td>
                      </tr>
                    );
                  })}
                  {/* 센터 소계 */}
                  <tr className="border-b border-[#e5e5e5] bg-[#fcfcfc]">
                    <td className="px-3 py-2 pl-5 text-[12px] text-[#888] sticky left-0 bg-[#fcfcfc]">{sct.label} 합계</td>
                    {SUPPORT.map(x => <td key={x.key} className="px-1 py-2 text-center tabular-nums text-[13px] text-[#555]">{secMethod(sct.teachers, sct.key, x.key)}</td>)}
                    <td className="px-3 py-2 text-center tabular-nums text-[13px] bg-[#e9f0fa] text-[#27272a]">{secSum(sct.teachers, sct.key, SUPPORT)}</td>
                    <td className="px-3 py-2 text-center tabular-nums text-[13px] bg-[#f0f0f0] text-[#27272a]">{secSum(sct.teachers, sct.key, PRIVATE)}</td>
                    <td className="px-3 py-2 text-center tabular-nums text-[14px] text-[#27272a]">{secSum(sct.teachers, sct.key, [...SUPPORT, ...PRIVATE])}</td>
                  </tr>
                </Fragment>
              ))}
              {sections.length > 1 && (
                <tr className="bg-[#fafafa]">
                  <td className="px-3 py-2.5 text-[13px] text-[#555] sticky left-0 bg-[#fafafa]">전체 합계</td>
                  {SUPPORT.map(x => <td key={x.key} className="px-1 py-2.5 text-center tabular-nums text-[13px] text-[#555]">{methodTotal(x.key)}</td>)}
                  <td className="px-3 py-2.5 text-center tabular-nums text-[13px] bg-[#e9f0fa] text-[#27272a]">{groupTotal(SUPPORT)}</td>
                  <td className="px-3 py-2.5 text-center tabular-nums text-[13px] bg-[#f0f0f0] text-[#27272a]">{groupTotal(PRIVATE)}</td>
                  <td className="px-3 py-2.5 text-center tabular-nums text-[14px] text-[#27272a]">{done.length}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] text-[#aaa] leading-[1.8]">진행 횟수는 시간표에서 [결제 완료]로 확정된 수업이에요. 결석·옮긴 수업은 결제를 하지 않아 들어가지 않아요. 칸에 마우스를 올리면 선생님·결제방식·횟수가 보여요.</p>
      </div>
    </div>
  );
}
