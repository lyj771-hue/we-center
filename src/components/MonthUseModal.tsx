'use client';

import { useEffect, useState } from 'react';
import type { Child, MonthUse, MonthUseRow } from '@/lib/timetable';
import { getMonthUseRows } from '@/lib/timetable';
import { getTeachers } from '@/lib/schedule';

// 회원 관리 "결제내역" 탭에서 그 달 사용 횟수 칸(바우처·굳센·…·선결제C)을 누르면 여는 상세보기.
// 그 달 시간표 [결제 완료]로 확정된 수업마다 날짜 · 시간 · 선생님 · 회차 · 메모. 선결제는 카드에서 직접 차감한 것도. 0회여도 빈 표로 연다.

const ymd = (d: string) => d.replace(/-/g, '/');

export default function MonthUseModal({ child, method, label, month, onClose }: {
  child: Child; method: keyof MonthUse; label: string; /** YYYY-MM */ month: string; onClose: () => void;
}) {
  const [rows, setRows] = useState<MonthUseRow[] | null>(null);
  const [teachers, setTeachers] = useState<Map<string, string>>(new Map());
  const [failed, setFailed] = useState('');

  useEffect(() => {
    Promise.all([getMonthUseRows(child.id, month, method), getTeachers({ includeHidden: true })])
      .then(([r, t]) => { setRows(r); setTeachers(new Map(t.map(x => [x.id, x.name]))); })
      .catch(e => { setRows([]); setFailed((e as Error).message); });
  }, [child.id, month, method]);

  // 회차 — 그 달 1회부터 (직접 차감은 횟수만큼)
  let n = 0;
  const shown = (rows ?? []).map(r => { n += r.count; return { ...r, nth: n }; });
  const th = 'py-2 px-2 font-normal text-[11px] text-[#999] whitespace-nowrap';
  const td = 'py-2 px-2 tabular-nums whitespace-nowrap';

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div className="bg-[#f7f7f8] rounded-2xl shadow-2xl w-full max-w-lg p-5 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="text-[15px] text-[#27272a]">{child.name}{child.number ?? ''} · {Number(month.slice(5, 7))}월 {label} 사용</p>
          <button onClick={onClose} className="text-[13px] text-[#888]">닫기 ✕</button>
        </div>
        {failed && <p className="text-[13px] text-red-400">불러오지 못했어요. ({failed})</p>}
        {rows === null ? <p className="text-[13px] text-[#aaa]">불러오는 중…</p> : (
          <div className="bg-white rounded-xl border border-[#e4e4e7] overflow-x-auto">
            <table className="w-full text-[13px] text-[#333] border-collapse">
              <thead>
                <tr className="border-b border-dashed border-[#bbb] text-left">
                  <th className={th}>날짜</th><th className={th}>시간</th><th className={th}>선생님</th>
                  <th className={`${th} text-right`}>회차</th><th className={th}>메모</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r, i) => (
                  <tr key={i} className="border-b border-[#f0f0f0] last:border-b-0">
                    <td className={td}>{ymd(r.day)}{r.center === 'uijeongbu' && <span className="ml-1 text-[10px] text-[#aaa]">의정부</span>}</td>
                    <td className={td}>{r.time ? r.time.replace(/^0/, '') : <span className="text-[#ccc]">-</span>}</td>
                    <td className={td}>{r.manual ? <span className="text-[#b45309]">카드에서 직접 차감{r.count > 1 ? ` ${r.count}회` : ''}</span> : (r.teacherId && teachers.get(r.teacherId)) || <span className="text-[#ccc]">-</span>}</td>
                    <td className={`${td} text-right`}>{r.nth}회</td>
                    <td className="py-2 px-2 text-[12px] text-[#888] break-keep">{r.note && r.note !== '차감' ? r.note : ''}</td>
                  </tr>
                ))}
                {!shown.length && <tr><td colSpan={5} className="py-8 text-center text-[13px] text-[#bbb]">{Number(month.slice(5, 7))}월에 확정된 {label} 수업이 없어요.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-right text-[13px] text-[#27272a]">{Number(month.slice(5, 7))}월 사용 <span className="text-[16px] tabular-nums text-[var(--brand)]">{n}</span>회</p>
        <p className="text-[11px] text-[#aaa] leading-[1.7]">시간표 [결제 완료]로 확정된 수업만 보여요(휴직 중인 선생님 수업은 빼요). 고치려면 시간표 관리에서 그날 결제방식을 바꿔 주세요.</p>
      </div>
    </div>
  );
}
