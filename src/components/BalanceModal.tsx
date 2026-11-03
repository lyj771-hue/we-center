'use client';

import { useEffect, useState } from 'react';
import type { BalanceKey, BalanceUse, Child } from '@/lib/timetable';
import { balanceOf, getBalanceUses, WOOJIN_FEE } from '@/lib/timetable';
import { getTeachers } from '@/lib/schedule';

// 회원 관리 "결제내역" 탭에서 우진학교외부·자율·지원금 남은 금액을 누르면 여는 상세보기.
// 확정된 수업마다 날짜 · 선생님 · 횟수(몇 번째) · 차감금액 · 잔여금액. 잔여금액은 지금 남은 금액에서 거꾸로 더해 구한다.

const LABEL: Record<BalanceKey, string> = { woojin_ext: '우진학교외부', woojin_self: '우진학교자율', subsidy: '지원금' };
const ymd = (d: string) => d.replace(/-/g, '/');
const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;

export default function BalanceModal({ child, method, onClose }: { child: Child; method: BalanceKey; onClose: () => void }) {
  const [uses, setUses] = useState<BalanceUse[] | null>(null);
  const [teachers, setTeachers] = useState<Map<string, string>>(new Map());
  const [failed, setFailed] = useState('');
  const now = balanceOf(child, method);

  useEffect(() => {
    Promise.all([getBalanceUses(child.id, method), getTeachers({ includeHidden: true })])
      .then(([u, t]) => { setUses(u); setTeachers(new Map(t.map(x => [x.id, x.name]))); })
      .catch(e => { setUses([]); setFailed((e as Error).message); });
  }, [child.id, method]);

  // 잔여금액 — 마지막 줄이 지금 남은 금액, 위로 갈수록 그 뒤에 뺀 금액을 더한다
  const rows = (() => {
    const list = uses ?? [];
    let after = now;
    const left = new Array<number>(list.length);
    for (let i = list.length - 1; i >= 0; i--) { left[i] = after; if (list[i].deducted) after += WOOJIN_FEE; }
    return list.map((u, i) => ({ ...u, nth: i + 1, left: left[i] }));
  })();

  const th = 'py-2 px-2 font-normal text-[11px] text-[#999] whitespace-nowrap';
  const td = 'py-2 px-2 tabular-nums whitespace-nowrap';

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div className="bg-[#f7f7f8] rounded-2xl shadow-2xl w-full max-w-lg p-5 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="text-[15px] text-[#27272a]">{child.name}{child.number ?? ''} · {LABEL[method]} 상세</p>
          <button onClick={onClose} className="text-[13px] text-[#888]">닫기 ✕</button>
        </div>
        {failed && <p className="text-[13px] text-red-400">불러오지 못했어요 — SQL(supabase/balance-detail.sql)을 실행했는지 확인해 주세요. ({failed})</p>}
        {uses === null ? <p className="text-[13px] text-[#aaa]">불러오는 중…</p> : (
          <div className="bg-white rounded-xl border border-[#e4e4e7] overflow-x-auto">
            <table className="w-full text-[13px] text-[#333] border-collapse">
              <thead>
                <tr className="border-b border-dashed border-[#bbb] text-left">
                  <th className={th}>날짜</th><th className={th}>선생님</th><th className={`${th} text-right`}>횟수</th>
                  <th className={`${th} text-right`}>차감금액</th><th className={`${th} text-right`}>잔여금액</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-[#f0f0f0] last:border-b-0">
                    <td className={td}>{ymd(r.day)}{r.center === 'uijeongbu' && <span className="ml-1 text-[10px] text-[#aaa]">의정부</span>}</td>
                    <td className={td}>{(r.teacherId && teachers.get(r.teacherId)) || <span className="text-[#ccc]">-</span>}</td>
                    <td className={`${td} text-right`}>{r.nth}회</td>
                    <td className={`${td} text-right ${r.deducted ? 'text-[#e11d48]' : 'text-[#bbb]'}`}>{r.deducted ? `−${won(WOOJIN_FEE)}` : '차감 전 기록'}</td>
                    <td className={`${td} text-right text-[var(--brand)]`}>{won(r.left)}</td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={5} className="py-8 text-center text-[13px] text-[#bbb]">확정된 수업이 없어요.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-right text-[13px] text-[#27272a]">지금 남은 금액 <span className="text-[16px] tabular-nums text-[var(--brand)]">{won(now)}</span></p>
        <p className="text-[11px] text-[#aaa] leading-[1.7]">시간표 [결제 완료]로 확정한 수업이 한 번에 {won(WOOJIN_FEE)}씩 빠져요. 잔여금액은 그 수업이 빠진 뒤 금액이에요. 남은 금액을 아이 명단에서 직접 고치면 위 잔여금액도 그만큼 함께 바뀌어요.</p>
      </div>
    </div>
  );
}
