'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { showAlert } from '@/lib/dialog';
import type { Child, PrepaidKey } from '@/lib/timetable';
import { PREPAID_KINDS } from '@/lib/timetable';
import type { LedgerRow } from '@/lib/prepaid';
import { addCharge, getChildLedger } from '@/lib/prepaid';
import PrepaidCard from '@/components/PrepaidCard';
import { notifyPrepaid, sendSummary } from '@/lib/alimtalkNotify';

// 회원 관리 "결제정보" 탭에서 여는 선결제 카드 창. 선결제는 아이(=센터)마다, A·B·C 종류마다 따로다.

/** 선결제 카드 창 — 카드 내역(충전·사용·남은 횟수·메모)과 [충전] · [차감] · [수정] 중 고른 칸 하나 */
export default function PrepaidModal({ child, method: first = 'prepaid', onClose }: { child: Child; method?: PrepaidKey; onClose: () => void }) {
  const [method, setMethod] = useState<PrepaidKey>(first);
  const kindLabel = PREPAID_KINDS.find(x => x.key === method)!.label;
  const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  const [rows, setRows] = useState<LedgerRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  // 아래 칸 — 충전 / 차감 / 수정 중 하나
  const [act, setAct] = useState<'charge' | 'deduct' | 'fix'>('charge');
  // 충전
  const [day, setDay] = useState(today);
  const [count, setCount] = useState('');
  const [memo, setMemo] = useState('');
  // 차감(임시) — 시간표 [결제 완료]로 쓰기 전까지 종이 카드처럼 직접 빼기 (충전 기록에 − 횟수로 남는다)
  const [useDay, setUseDay] = useState(today);
  const [useCount, setUseCount] = useState('1');
  const [useMemo, setUseMemo] = useState('');
  // 수정 — 남은 횟수를 직접 맞춘다 (지금 남은 횟수와의 차이를 [수정] 기록으로 남긴다)
  const [fixDay, setFixDay] = useState(today);
  const [fixLeft, setFixLeft] = useState('');
  const [fixMemo, setFixMemo] = useState('');

  const load = useCallback(() => {
    setRows(null);
    getChildLedger(child.id, method).then(setRows).catch(e => { setRows([]); showAlert(`불러오지 못했어요 — 선결제 SQL(supabase/prepaid-charges.sql)을 실행했는지 확인해 주세요.\n${(e as Error).message}`); });
  }, [child.id, method]);
  useEffect(() => { load(); }, [load]);

  const left = rows?.length ? rows[rows.length - 1].balance : 0;

  const run = async (fn: () => Promise<void>, fail: string) => {
    setBusy(true);
    try { await fn(); load(); }
    catch (e) { showAlert(`${fail}\n${(e as Error).message}`); }
    finally { setBusy(false); }
  };
  const charge = () => {
    const n = Number(count);
    if (!n || n < 0) { showAlert('충전 횟수를 적어 주세요.'); return; }
    run(async () => { await addCharge(child.id, day, n, memo, false, method); setCount(''); setMemo(''); await tell('충전', day, n); }, '충전하지 못했어요.');
  };
  // 저장한 뒤 보호자에게 '선결제 사용·충전·변경' 알림톡 (보호자 계정과 이어진 아이만)
  const tell = async (kind: '사용' | '충전' | '변경', d: string, delta: number) => {
    try {
      const r = await notifyPrepaid(child, kind, d, left, delta, method);
      if (r.sent + r.failed + r.skipped + r.waiting) await showAlert(`${kindLabel} ${kind} 알림톡 — ${sendSummary(r)}`);
    } catch (e) { await showAlert(`저장했지만 알림톡을 보내지 못했어요.\n${(e as Error).message}`); }
  };
  const deduct = () => {
    const n = Number(useCount);
    if (!n || n < 0) { showAlert('차감 횟수를 적어 주세요.'); return; }
    run(async () => { await addCharge(child.id, useDay, -n, useMemo, false, method); setUseCount('1'); setUseMemo(''); await tell('사용', useDay, -n); }, '차감하지 못했어요.');
  };
  const fix = () => {
    if (fixLeft === '') { showAlert('남은 횟수를 적어 주세요.'); return; }
    const diff = Number(fixLeft) - left;
    if (!diff) { showAlert(`지금 남은 횟수(${left}회)와 같아요.`); return; }
    run(async () => { await addCharge(child.id, fixDay, diff, fixMemo, true, method); setFixLeft(''); setFixMemo(''); await tell('변경', fixDay, diff); }, '수정하지 못했어요.');
  };

  const input = 'border-b border-[#ddd] py-1 text-[14px] outline-none focus:border-[var(--brand)]';
  const label = 'text-[11px] text-[#999]';
  const section = 'flex flex-wrap items-end gap-3';

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div className="bg-[#f7f7f8] rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="text-[15px] text-[#27272a]">{child.name}{child.number ?? ''} · {kindLabel} 카드</p>
          <button onClick={onClose} className="text-[13px] text-[#888]">닫기 ✕</button>
        </div>
        <div className="flex gap-1.5">
          {PREPAID_KINDS.map(x => (
            <button key={x.key} type="button" onClick={() => setMethod(x.key)} disabled={busy}
              className={`text-[12px] px-3 py-1 rounded-full border ${method === x.key ? 'border-[var(--brand)] bg-[var(--brand)] text-white' : 'border-[#ddd] bg-white text-[#666]'}`}>{x.label}</button>
          ))}
        </div>
        {rows === null ? <p className="text-[13px] text-[#aaa]">불러오는 중…</p> : <PrepaidCard rows={rows} name={child.name} />}

        {/* 충전 · 차감 · 수정 — 하나를 골라 그 칸만 */}
        <div className="bg-white rounded-xl p-4 space-y-3">
          <div role="tablist" className="flex gap-1.5">
            {([['charge', '충전'], ['deduct', '차감'], ['fix', '수정']] as const).map(([k, t]) => (
              <button key={k} type="button" role="tab" aria-selected={act === k} onClick={() => setAct(k)}
                className={`text-[13px] px-4 py-1.5 rounded-full border ${act === k ? 'border-[#27272a] bg-[#27272a] text-white' : 'border-[#ddd] bg-white text-[#555] hover:bg-[#f8f8f8]'}`}>{t}</button>
            ))}
          </div>

          {act === 'charge' && (
            <div className={section}>
              <label className={label}>날짜<input type="date" value={day} onChange={e => e.target.value && setDay(e.target.value)} className={`${input} block`} /></label>
              <label className={label}>충전 횟수<input value={count} inputMode="numeric" placeholder="10" onChange={e => setCount(e.target.value.replace(/\D/g, '').slice(0, 4))} className={`${input} block w-16 text-center`} /></label>
              <label className={`${label} flex-1 min-w-[110px]`}>메모<input value={memo} onChange={e => setMemo(e.target.value)} placeholder="예: 11월 카드 결제" className={`${input} block w-full`} /></label>
              <p className="w-full text-[13px] text-[#555]">지금 {left}회{Number(count) > 0 && <> → 저장하면 <b className="font-medium text-[var(--brand)]">{left + Number(count)}회</b></>}</p>
              <button onClick={charge} disabled={busy} className="text-[13px] border border-[var(--brand)] bg-[var(--brand)] text-white px-4 py-1.5 rounded-full disabled:opacity-50">충전 저장</button>
            </div>
          )}

          {act === 'deduct' && (
            <div className={section}>
              <label className={label}>날짜<input type="date" value={useDay} onChange={e => e.target.value && setUseDay(e.target.value)} className={`${input} block`} /></label>
              <label className={label}>차감 횟수<input value={useCount} inputMode="numeric" onChange={e => setUseCount(e.target.value.replace(/\D/g, '').slice(0, 3))} className={`${input} block w-16 text-center`} /></label>
              <label className={`${label} flex-1 min-w-[110px]`}>메모<input value={useMemo} onChange={e => setUseMemo(e.target.value)} placeholder="예: 10/7 수업" className={`${input} block w-full`} /></label>
              <p className="w-full text-[13px] text-[#555]">지금 {left}회{Number(useCount) > 0 && <> → 저장하면 <b className="font-medium text-[#e11d48]">{left - Number(useCount)}회</b></>}</p>
              <p className="w-full text-[11px] text-[#aaa] -mt-1">시간표에 없는 사용만 직접 빼요. 시간표 [결제 완료]로 쓴 수업은 저절로 빠져요.</p>
              <button onClick={deduct} disabled={busy} className="text-[13px] border border-[#e11d48] bg-[#e11d48] text-white px-4 py-1.5 rounded-full disabled:opacity-50">차감 저장</button>
            </div>
          )}

          {act === 'fix' && (
            <div className={section}>
              <label className={label}>날짜<input type="date" value={fixDay} onChange={e => e.target.value && setFixDay(e.target.value)} className={`${input} block`} /></label>
              <label className={label}>남은 횟수를<input value={fixLeft} inputMode="numeric" placeholder={String(left)} onChange={e => setFixLeft(e.target.value.replace(/\D/g, '').slice(0, 4))} className={`${input} block w-16 text-center`} /></label>
              <label className={`${label} flex-1 min-w-[110px]`}>메모<input value={fixMemo} onChange={e => setFixMemo(e.target.value)} placeholder="예: 종이 카드와 맞춤" className={`${input} block w-full`} /></label>
              <p className="w-full text-[13px] text-[#555]">지금 {left}회{fixLeft !== '' && <> → <b className="font-medium text-[#b45309]">{fixLeft}회</b>로 맞춤 ({Number(fixLeft) - left >= 0 ? '+' : ''}{Number(fixLeft) - left})</>}</p>
              <button onClick={fix} disabled={busy} className="text-[13px] border border-[#0a0a0a] bg-[#0a0a0a] text-white px-4 py-1.5 rounded-full disabled:opacity-50">수정 저장</button>
            </div>
          )}

          <p className="text-[11px] text-[#aaa] leading-[1.7]">저장하면 보호자에게 알림톡이 가요(보호자 계정과 이어진 아이만). 종이 카드에서 옮길 때는 [수정]으로 남은 횟수를 맞추면 돼요.</p>
        </div>
      </div>
    </div>
  );
}
