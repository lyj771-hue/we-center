'use client';

import { useEffect, useState } from 'react';
import { useMember } from '@/components/MemberContext';
import { getMyMonthCounts, type TeacherMonthCount } from '@/lib/teacher';

// 보호자 앱(선생님) — 마이페이지: 내 월별 수업 진행 횟수. 시간표에서 [결제 완료]로 확정된 수업을 사설 · 지원금으로 나눠 센다.
// 사설 = 현금 · 신용카드 · 선결제, 지원금 = 꿈이든 · 굳센 · 장맞춤 · 바우처 · 우진학교 · 지원금 (supabase/teacher-month-counts.sql)

export default function AppTeacherMe() {
  const { teacher } = useMember();
  const [rows, setRows] = useState<TeacherMonthCount[] | null>(null);
  const [failed, setFailed] = useState('');
  useEffect(() => {
    if (!teacher) return;
    getMyMonthCounts(12).then(setRows).catch(e => { setRows([]); setFailed((e as Error).message); });
  }, [teacher]);

  if (!teacher) return <p className="py-16 text-center text-[13px] text-[#bbb]">선생님만 볼 수 있어요.</p>;
  const label = (ym: string) => { const [y, m] = ym.split('-').map(Number); return `${y}년 ${m}월`; };
  const th = 'py-2.5 px-3 font-normal text-[12px] text-[#999] whitespace-nowrap';
  const td = 'py-3 px-3 tabular-nums whitespace-nowrap';

  return (
    <div className="space-y-4">
      <p className="text-[17px] text-[#27272a]">{teacher.name} 선생님 · 월별 수업 횟수</p>
      {failed && <p className="text-[13px] text-red-400">불러오지 못했어요 ({failed})</p>}
      {rows === null ? <p className="py-10 text-center text-[13px] text-[#bbb]">불러오는 중…</p> : (
        <div className="bg-white rounded-[18px] overflow-hidden">
          <table className="w-full text-[15px] text-[#27272a] border-collapse">
            <thead>
              <tr className="border-b border-[#f0f0f0] text-left">
                <th className={th}>월</th>
                <th className={`${th} text-right`}>사설</th>
                <th className={`${th} text-right`}>지원금</th>
                <th className={`${th} text-right`}>합계</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.month} className="border-b border-[#f6f6f6] last:border-b-0">
                  <td className={td}>{label(r.month)}</td>
                  <td className={`${td} text-right`}>{r.private}회</td>
                  <td className={`${td} text-right`}>{r.support}회</td>
                  <td className={`${td} text-right text-[var(--brand)]`}>{r.private + r.support}회</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={4} className="py-10 text-center text-[13px] text-[#bbb]">아직 확정된 수업이 없어요.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[12px] text-[#aaa] leading-[1.8]">
        시간표에서 [결제 완료]로 확정된 수업만 세요.<br />
        사설 = 현금 · 신용카드 · 선결제<br />
        지원금 = 꿈이든 · 굳센 · 장맞춤 · 바우처 · 우진학교 · 지원금
      </p>
    </div>
  );
}
