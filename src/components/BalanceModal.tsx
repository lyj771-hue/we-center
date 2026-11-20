'use client';

import { useCallback, useEffect, useState } from 'react';
import type { BalanceCharge, BalanceKey, BalanceUse, Child } from '@/lib/timetable';
import { addBalanceCharge, getBalanceCharges, getBalanceUses, WOOJIN_FEE } from '@/lib/timetable';
import { getTeachers } from '@/lib/schedule';

// 회원 관리 "결제정보" 탭에서 우진학교외부·자율·지원금 남은 금액을 누르면 여는 상세보기. 아래 [충전]·[차감]으로 금액을 더하거나 뺀다(고른 날짜 = 적용날짜).
// 충전·수정 기록(balance_charges)과 확정된 수업(차감 6만원)을 최신 적용날짜가 위로 늘어놓고, 줄마다 그 뒤 잔여금액을 붙인다.
// 적용날짜 = 수업일·충전일, 처리날짜 = 실제로 누른 날([결제 완료]·충전/수정 저장). 월사용횟수 = 그 달 몇 번째 수업.

const LABEL: Record<BalanceKey, string> = { woojin_ext: '우진학교외부', woojin_self: '우진학교자율', subsidy: '지원금' };
const ymd = (d: string) => d.replace(/-/g, '/');
const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;
/** 처리날짜 — [결제 완료]·충전/수정 저장을 누른 시각(ISO) → 한국 날짜 YYYY-MM-DD */
const kstDay = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);

type Row =
  | { kind: 'charge'; day: string; c: BalanceCharge }
  | { kind: 'use'; day: string; u: BalanceUse; nth: number };

/** 처음에 보이는 줄 수 — 아래로 내리면 이만큼씩 더 */
const STEP = 20;

const KIND_STYLE = { 충전: 'text-[var(--brand)]', 차감: 'text-[#e11d48]', 수정: 'text-[#b45309]' } as const;

export default function BalanceModal({ child, method, onClose }: { child: Child; method: BalanceKey; onClose: () => void }) {
  const [uses, setUses] = useState<BalanceUse[] | null>(null);
  const [charges, setCharges] = useState<BalanceCharge[]>([]);
  const [noTable, setNoTable] = useState(false);
  const [teachers, setTeachers] = useState<Map<string, string>>(new Map());
  const [failed, setFailed] = useState('');
  // 아래 칸 — [충전] / [차감] 중 하나 (balance-charges.sql 이 있어야 한다)
  //   충전: 고른 날짜(적용날짜)에 넣은 금액만큼 더한다
  //   차감: 시간표 [결제 완료]로 쓰지 않은 수업을 직접 뺀다 — 고른 날짜(차감할 날 = 적용날짜)에 횟수 × 6만원.
  //   처리날짜(실제로 저장한 날)는 저장한 시각으로 저절로 남는다. 차감은 balance_charges 에 − 금액으로 들어간다
  const todayStr = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  const [act, setAct] = useState<'charge' | 'deduct'>('charge');
  const [editDay, setEditDay] = useState(todayStr);
  const [editVal, setEditVal] = useState('');
  const [editMemo, setEditMemo] = useState('');
  const [useDay, setUseDay] = useState(todayStr);
  const [useCount, setUseCount] = useState('1');
  const [useMemo, setUseMemo] = useState('');
  const [saving, setSaving] = useState(false);
  // 아래로 내리면 STEP 줄씩 더 — 표 끝에 '더 있어요' 줄
  const [shown, setShown] = useState(STEP);

  const load = useCallback(() => {
    Promise.all([
      getBalanceUses(child.id, method),
      // balance-charges.sql 전에는 충전 기록 없이 차감만
      getBalanceCharges(child.id, method).then(c => { setNoTable(false); return c; }).catch(() => { setNoTable(true); return [] as BalanceCharge[]; }),
      getTeachers({ includeHidden: true }),
    ])
      .then(([u, c, t]) => { setUses(u); setCharges(c); setTeachers(new Map(t.map(x => [x.id, x.name]))); })
      .catch(e => { setUses([]); setFailed((e as Error).message); });
  }, [child.id, method]);
  useEffect(() => { load(); }, [load]);

  // 날짜 순 — 같은 날은 충전·수정 먼저. 잔여금액은 처음부터 더하고 뺀다(충전 기록이 없으면 지금 남은 금액에서 거꾸로). 보여 줄 땐 최신이 위로
  // 월사용횟수 — 수업일의 달마다 1회, 2회…
  const perMonth = new Map<string, number>();
  const list: Row[] = [
    ...charges.map(c => ({ kind: 'charge' as const, day: c.day, c })),
    ...(uses ?? []).map(u => {
      const m = u.day.slice(0, 7);
      const nth = (perMonth.get(m) ?? 0) + 1;
      perMonth.set(m, nth);
      return { kind: 'use' as const, day: u.day, u, nth };
    }),
  ].sort((a, b) => a.day.localeCompare(b.day) || (a.kind === b.kind ? 0 : a.kind === 'charge' ? -1 : 1));
  const delta = (r: Row) => (r.kind === 'charge' ? r.c.amount : r.u.deducted ? -WOOJIN_FEE : 0);
  const end = list.reduce((s, r) => s + delta(r), 0);
  const now = charges.length ? end : child[method === 'woojin_ext' ? 'woojinExtBalance' : method === 'woojin_self' ? 'woojinSelfBalance' : 'subsidyBalance'] ?? 0;
  let bal = now - end;
  const rows = list.map(r => { bal += delta(r); return { r, left: bal }; }).reverse();
  // 직접 넣은 차감 = − 금액의 충전 기록(adjust 아님)
  const kindOf = (r: Row) => (r.kind === 'use' ? '차감' : r.c.adjust ? '수정' : r.c.amount < 0 ? '차감' : '충전');
  const visible = rows.slice(0, shown);
  const hidden = rows.length - visible.length;
  // 창을 끝까지 내렸을 때만 더 (열자마자 저절로 다 펼쳐지지 않게). 창이 짧아 안 내려가면 휠을 아래로 굴릴 때
  const atBottom = (el: HTMLElement) => el.scrollTop + el.clientHeight >= el.scrollHeight - 40;
  const more = (el: HTMLElement) => { if (hidden > 0 && atBottom(el)) setShown(n => n + STEP); };
  const doneDay = (r: Row) => (r.kind === 'use' ? (r.u.confirmedAt ? kstDay(r.u.confirmedAt) : '') : r.c.at ? kstDay(r.c.at) : '');

  const th = 'py-2 px-2 font-normal text-[11px] text-[#999] whitespace-nowrap';
  const td = 'py-2 px-2 tabular-nums whitespace-nowrap';

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div className="bg-[#f7f7f8] rounded-2xl shadow-2xl w-full max-w-4xl p-5 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}
        onScroll={e => more(e.currentTarget)} onWheel={e => { if (e.deltaY > 0) more(e.currentTarget); }}>
        <div className="flex items-center justify-between">
          <p className="text-[15px] text-[#27272a]">{child.name}{child.number ?? ''} · {LABEL[method]} 상세</p>
          <button onClick={onClose} className="text-[13px] text-[#888]">닫기 ✕</button>
        </div>
        {failed && <p className="text-[13px] text-red-400">불러오지 못했어요 — SQL(supabase/balance-detail.sql)을 실행했는지 확인해 주세요. ({failed})</p>}
        {noTable && <p className="text-[12px] text-[#b45309]">충전 기록을 남기려면 SQL(supabase/balance-charges.sql)을 실행해 주세요. 지금은 차감 내역만 보여요.</p>}
        {uses === null ? <p className="text-[13px] text-[#aaa]">불러오는 중…</p> : (
          <div className="bg-white rounded-xl border border-[#e4e4e7] overflow-x-auto">
            <table className="w-full text-[13px] text-[#333] border-collapse">
              <thead>
                <tr className="border-b border-dashed border-[#bbb] text-left">
                  <th className={th}>적용날짜</th><th className={th}>처리날짜</th><th className={th}>구분</th>
                  <th className={`${th} text-right`}>금액</th><th className={`${th} text-right`}>잔여금액</th>
                  <th className={`${th} text-right`}>월사용횟수</th><th className={th}>수업</th><th className={th}>메모</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(({ r, left }, i) => (
                  <tr key={i} className="border-b border-[#f0f0f0] last:border-b-0">
                    <td className={td}>{ymd(r.day)}</td>
                    {/* 처리날짜 — 적용날짜와 다르면 눈에 띄게 */}
                    <td className={`${td} ${doneDay(r) && doneDay(r) !== r.day ? 'text-[#b45309]' : 'text-[#aaa]'}`}>{doneDay(r) ? ymd(doneDay(r)) : '-'}</td>
                    <td className={`${td} ${KIND_STYLE[kindOf(r)]}`}>{kindOf(r)}</td>
                    <td className={`${td} text-right ${delta(r) > 0 ? 'text-[var(--brand)]' : delta(r) < 0 ? 'text-[#e11d48]' : 'text-[#bbb]'}`}>
                      {r.kind === 'use' && !r.u.deducted ? '차감 전 기록' : `${delta(r) > 0 ? '+' : '−'}${won(Math.abs(delta(r)))}`}
                    </td>
                    <td className={`${td} text-right text-[var(--brand)]`}>{won(left)}</td>
                    <td className={`${td} text-right`}>{r.kind === 'use' ? `${Number(r.day.slice(5, 7))}월 ${r.nth}회` : ''}</td>
                    <td className={`${td} text-[12px]`}>
                      {r.kind === 'use' && <>{(r.u.teacherId && teachers.get(r.u.teacherId)) || '-'}{r.u.time ? ` ${r.u.time.replace(/^0/, '')}` : ''}
                        {r.u.center === 'uijeongbu' && <span className="ml-1 text-[10px] text-[#aaa]">의정부</span>}</>}
                    </td>
                    <td className="py-2 px-2 text-[11px] text-[#999] break-keep">{r.kind === 'charge' ? (r.c.seed ? '이전 잔액' : r.c.memo ?? '') : ''}</td>
                  </tr>
                ))}
                {hidden > 0 && (
                  <tr>
                    <td colSpan={8} className="py-3 text-center text-[12px] text-[#999]">
                      <button type="button" onClick={() => setShown(n => n + STEP)} className="hover:text-[var(--brand)]">↓ 아래에 {hidden}줄 더 있어요</button>
                    </td>
                  </tr>
                )}
                {!rows.length && <tr><td colSpan={8} className="py-8 text-center text-[13px] text-[#bbb]">아직 충전·차감 내역이 없어요.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-right text-[13px] text-[#27272a]">지금 남은 금액 <span className="text-[16px] tabular-nums text-[var(--brand)]">{won(now)}</span></p>

        {/* 충전 · 차감 — 하나를 골라 그 칸만 (선결제 카드 창과 같은 모양) */}
        <div className="bg-white rounded-xl border border-[#e4e4e7] p-3 space-y-3">
          <div role="tablist" className="flex gap-1.5">
            {([['charge', '충전'], ['deduct', '차감']] as const).map(([k, t]) => (
              <button key={k} type="button" role="tab" aria-selected={act === k} onClick={() => setAct(k)}
                className={`text-[13px] px-4 py-1.5 rounded-full border ${act === k ? 'border-[#27272a] bg-[#27272a] text-white' : 'border-[#ddd] bg-white text-[#555] hover:bg-[#f8f8f8]'}`}>{t}</button>
            ))}
          </div>

          {act === 'charge' && (
            <form className="flex flex-wrap items-end gap-3" onSubmit={async e => {
              e.preventDefault();
              const v = Number(editVal.replace(/[^\d]/g, ''));
              if (!v) return;
              setSaving(true);
              try {
                await addBalanceCharge(child.id, method, editDay, v, editMemo.trim() || undefined);
                setEditVal(''); setEditMemo(''); load();
              } catch (err) { setFailed((err as Error).message); }
              finally { setSaving(false); }
            }}>
              <label className="text-[12px] text-[#888]">적용날짜
                <input type="date" value={editDay} onChange={e => e.target.value && setEditDay(e.target.value)} className="block border-b border-[#ddd] py-1 text-[13px] text-[#27272a] outline-none focus:border-[var(--brand)]" /></label>
              <label className="text-[12px] text-[#888]">충전 금액
                <span className="flex items-center gap-1"><input inputMode="numeric" value={editVal} onChange={e => setEditVal(e.target.value)} placeholder="300000"
                  className="w-32 border-b border-[#ddd] py-1 text-[13px] text-[#27272a] text-right tabular-nums outline-none focus:border-[var(--brand)]" /><span className="text-[13px] text-[#888]">원</span></span></label>
              <label className="text-[12px] text-[#888] flex-1 min-w-[120px]">메모
                <input value={editMemo} onChange={e => setEditMemo(e.target.value)} placeholder="선택"
                  className="block w-full border-b border-[#ddd] py-1 text-[13px] text-[#27272a] outline-none focus:border-[var(--brand)]" /></label>
              <p className="w-full text-[13px] text-[#555]">지금 {won(now)}{Number(editVal.replace(/[^\d]/g, '')) > 0 && <> → 저장하면 <b className="font-medium text-[var(--brand)]">{won(now + Number(editVal.replace(/[^\d]/g, '')))}</b></>}</p>
              <button type="submit" disabled={saving || noTable || editVal.trim() === ''}
                className="text-[13px] bg-[var(--brand)] text-white px-4 py-1.5 rounded-full hover:opacity-90 disabled:opacity-40">{saving ? '저장 중…' : '충전 저장'}</button>
            </form>
          )}

          {act === 'deduct' && (
            <form className="flex flex-wrap items-end gap-3" onSubmit={async e => {
              e.preventDefault();
              const n = Number(useCount);
              if (!n) return;
              setSaving(true);
              try {
                await addBalanceCharge(child.id, method, useDay, -n * WOOJIN_FEE, useMemo.trim() || undefined);
                setUseCount('1'); setUseMemo(''); load();
              } catch (err) { setFailed((err as Error).message); }
              finally { setSaving(false); }
            }}>
              <label className="text-[12px] text-[#888]">차감할 날짜 (적용날짜)
                <input type="date" value={useDay} onChange={e => e.target.value && setUseDay(e.target.value)} className="block border-b border-[#ddd] py-1 text-[13px] text-[#27272a] outline-none focus:border-[#e11d48]" /></label>
              <label className="text-[12px] text-[#888]">차감 횟수
                <input inputMode="numeric" value={useCount} onChange={e => setUseCount(e.target.value.replace(/\D/g, '').slice(0, 2))}
                  className="block w-14 border-b border-[#ddd] py-1 text-[13px] text-[#27272a] text-center tabular-nums outline-none focus:border-[#e11d48]" /></label>
              <span className="text-[13px] text-[#e11d48] pb-1 tabular-nums">−{won(Number(useCount || 0) * WOOJIN_FEE)}</span>
              <label className="text-[12px] text-[#888] flex-1 min-w-[120px]">메모
                <input value={useMemo} onChange={e => setUseMemo(e.target.value)} placeholder="예: 11/7 수업"
                  className="block w-full border-b border-[#ddd] py-1 text-[13px] text-[#27272a] outline-none focus:border-[#e11d48]" /></label>
              <p className="w-full text-[13px] text-[#555]">지금 {won(now)}{Number(useCount) > 0 && <> → 저장하면 <b className="font-medium text-[#e11d48]">{won(now - Number(useCount) * WOOJIN_FEE)}</b></>}</p>
              <p className="w-full text-[11px] text-[#aaa] -mt-2">시간표에 없는 수업만 직접 빼요. 시간표 [결제 완료]로 확정한 수업은 저절로 빠져요. 처리날짜는 오늘({ymd(todayStr)})로 남아요.</p>
              <button type="submit" disabled={saving || noTable || !Number(useCount)}
                className="text-[13px] bg-[#e11d48] text-white px-4 py-1.5 rounded-full hover:opacity-90 disabled:opacity-40">{saving ? '저장 중…' : '차감 저장'}</button>
            </form>
          )}
        </div>

        <p className="text-[11px] text-[#aaa] leading-[1.7]">시간표 [결제 완료]로 확정한 수업이 한 번에 {won(WOOJIN_FEE)}씩 빠져요. 적용날짜 = 충전·차감이 들어가는 날, 처리날짜 = 실제로 저장한 날(다르면 주황색). 아이 명단에서 남은 금액을 고치면 그 차이는 [수정] 기록으로 남아요.</p>
      </div>
    </div>
  );
}
