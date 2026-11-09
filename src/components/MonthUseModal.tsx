'use client';

import { Fragment, useEffect, useState } from 'react';
import type { Child, MonthUse, MonthUseRow } from '@/lib/timetable';
import { getMonthUseRows } from '@/lib/timetable';
import { getTeachers } from '@/lib/schedule';

// 회원 관리(결제정보·아이명단·미승인)에서 결제 칸의 사용 횟수(바우처·굳센·…·선결제C)를 누르면 여는 사용 내역.
// 처음부터 지금까지 시간표 [결제 완료]로 확정된 수업 전부 — 최근 달이 위, 달 안에서는 날짜 순. 회차는 달마다 1회부터,
// 달이 끝나는 자리에 그 달 합계를 작게. 선결제는 카드에서 직접 차감한 것도. 없어도 빈 표로 연다.

const ymd = (d: string) => d.replace(/-/g, '/');
/** 처리일 — [결제 완료]를 누른 시각(ISO) → 한국 날짜 YYYY-MM-DD */
const kstDay = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const monthLabel = (ym: string) => `${ym.slice(0, 4)}년 ${Number(ym.slice(5, 7))}월`;

export default function MonthUseModal({ child, method, label, month, onClose }: {
  child: Child; method: keyof MonthUse; label: string; /** 연 곳의 달(YYYY-MM) — 그 달을 표시 */ month: string; onClose: () => void;
}) {
  const [rows, setRows] = useState<MonthUseRow[] | null>(null);
  const [teachers, setTeachers] = useState<Map<string, string>>(new Map());
  const [failed, setFailed] = useState('');

  useEffect(() => {
    Promise.all([getMonthUseRows(child.id, null, method), getTeachers({ includeHidden: true })])
      .then(([r, t]) => { setRows(r); setTeachers(new Map(t.map(x => [x.id, x.name]))); })
      .catch(e => { setRows([]); setFailed((e as Error).message); });
  }, [child.id, method]);

  // 달마다 묶기 — 회차는 달마다 1회부터(직접 차감은 횟수만큼), 최근 달이 위
  const groups = (() => {
    const by = new Map<string, (MonthUseRow & { nth: number })[]>();
    for (const r of rows ?? []) {
      const ym = r.day.slice(0, 7);
      const list = by.get(ym) ?? [];
      const prev = list.length ? list[list.length - 1].nth : 0;
      list.push({ ...r, nth: prev + r.count });
      by.set(ym, list);
    }
    return [...by].sort((a, b) => b[0].localeCompare(a[0])).map(([ym, list]) => ({ ym, list, total: list.length ? list[list.length - 1].nth : 0 }));
  })();
  const total = groups.reduce((s, g) => s + g.total, 0);
  const th = 'py-2 px-2 font-normal text-[11px] text-[#999] whitespace-nowrap';
  const td = 'py-2 px-2 tabular-nums whitespace-nowrap';

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div className="bg-[#f7f7f8] rounded-2xl shadow-2xl w-full max-w-lg p-5 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="text-[15px] text-[#27272a]">{child.name}{child.number ?? ''} · {label} 사용 내역</p>
          <button onClick={onClose} className="text-[13px] text-[#888]">닫기 ✕</button>
        </div>
        {failed && <p className="text-[13px] text-red-400">불러오지 못했어요. ({failed})</p>}
        {rows === null ? <p className="text-[13px] text-[#aaa]">불러오는 중…</p> : (
          <div className="bg-white rounded-xl border border-[#e4e4e7] overflow-x-auto">
            <table className="w-full text-[13px] text-[#333] border-collapse">
              <thead>
                <tr className="border-b border-dashed border-[#bbb] text-left">
                  <th className={th}>수업일</th><th className={th} title="[결제 완료]를 누른 날">처리일</th><th className={th}>시간</th><th className={th}>선생님</th>
                  <th className={`${th} text-right`}>회차</th><th className={th}>메모</th>
                </tr>
              </thead>
              <tbody>
                {groups.map(g => (
                  <Fragment key={g.ym}>
                    {g.list.map((r, i) => (
                      <tr key={i} className={`border-b border-[#f0f0f0] ${g.ym === month ? 'bg-[#f8fbff]' : ''}`}>
                        <td className={td}>{ymd(r.day)}{r.center === 'uijeongbu' && <span className="ml-1 text-[10px] text-[#aaa]">의정부</span>}</td>
                        {/* 처리일 — 수업일과 같으면 흐리게 */}
                        <td className={`${td} ${r.confirmedAt && kstDay(r.confirmedAt) !== r.day ? 'text-[#b45309]' : 'text-[#bbb]'}`}>{r.confirmedAt ? ymd(kstDay(r.confirmedAt)) : '-'}</td>
                        <td className={td}>{r.time ? r.time.replace(/^0/, '') : <span className="text-[#ccc]">-</span>}</td>
                        <td className={td}>{r.manual ? <span className="text-[#b45309]">카드에서 직접 차감{r.count > 1 ? ` ${r.count}회` : ''}</span> : (r.teacherId && teachers.get(r.teacherId)) || <span className="text-[#ccc]">-</span>}</td>
                        <td className={`${td} text-right`}>{r.nth}회</td>
                        <td className="py-2 px-2 text-[12px] text-[#888] break-keep">{r.note && r.note !== '차감' ? r.note : ''}</td>
                      </tr>
                    ))}
                    {/* 그 달 합계 — 작게 */}
                    <tr className="border-b border-[#e4e4e7] bg-[#fafafa]">
                      <td colSpan={6} className="py-1.5 px-2 text-right text-[11px] text-[#888]">{monthLabel(g.ym)} 합계 <span className="tabular-nums text-[#27272a]">{g.total}회</span></td>
                    </tr>
                  </Fragment>
                ))}
                {!groups.length && <tr><td colSpan={6} className="py-8 text-center text-[13px] text-[#bbb]">확정된 {label} 수업이 없어요.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-right text-[13px] text-[#27272a]">전체 <span className="text-[16px] tabular-nums text-[var(--brand)]">{total}</span>회</p>
        <p className="text-[11px] text-[#aaa] leading-[1.7]">시간표 [결제 완료]로 확정된 수업만 보여요(휴직 중인 선생님 수업은 빼요). 회차는 달마다 1회부터예요. 수업일 = 그 수업을 한 날(보호자 마이페이지 기준), 처리일 = [결제 완료]를 누른 날. 고치려면 시간표 관리에서 그날 결제방식을 바꿔 주세요.</p>
      </div>
    </div>
  );
}
