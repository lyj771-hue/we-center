'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { askConfirm, showAlert } from '@/lib/dialog';
import type { Child } from '@/lib/timetable';
import type { PayCount } from '@/lib/timetable';
import { deleteChild, getChildren, getFixedByChild, getPaymentCounts, linkChild, saveChild, setChildUses, setChildBalance, type UsesKey, type LessonKind, kindLabel } from '@/lib/timetable';
import type { Member } from '@/lib/types';
import { saveMemberProfile } from '@/lib/store';
import type { LedgerRow } from '@/lib/prepaid';
import { addCharge, getChildLedger } from '@/lib/prepaid';
import PrepaidCard from '@/components/PrepaidCard';
import { downloadCsv, downloadXlsx, type Sheet } from '@/lib/exportFile';
import Portal from '@/components/Portal';

// 회원 관리 — "아이 명단" 탭. 센터에 다니는 아이마다 회원 코드(W0001 …)가 있고,
// 카카오로 가입한 보호자 계정과 1:1로 잇는다(보호자 계정 하나 = 아이 한 명). 고정 수업은 시간표 관리에서 고친다.

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
// 고정 자리 결제 글자 → 이름 (표에는 영어 글자 대신 이름으로)
const PAY_LABEL: Record<string, string> = { b: '바우처', e: '굳센', c: '꿈이든', 선: '선결제', 카: '신용카드', 현: '현금' };

type Fixed = { weekday: number; time: string; teacher: string; payment: string; oral: boolean; kind: LessonKind };
const emptyForm = { name: '', number: '', memo: '', guardian: '', phone: '', vl: '0', gl: '0', kl: '0', pt: '0' };

// 결제 칸 — 쓰는 결제 체크(바우처·굳센·꿈이든·선결제), 이번 달 사용 횟수(바우처·굳센·꿈이든, 직접 적을 수 있음), 선결제 잔여
const USES: { key: UsesKey; label: string }[] = [
  { key: 'voucher', label: '바우처' }, { key: 'gusen', label: '굳센' }, { key: 'kkumideun', label: '꿈이든' },
  { key: 'woojin', label: '우진학교' }, { key: 'subsidy', label: '지원금' }, { key: 'prepaid', label: '선결제' },
];
type MonthKey = Exclude<UsesKey, 'prepaid'>;
// 우진학교·지원금 — 횟수가 아니라 남은 금액(원)을 적는다
const BALANCES: { key: 'woojin' | 'subsidy'; label: string }[] = [{ key: 'woojin', label: '우진학교' }, { key: 'subsidy', label: '지원금' }];
// 회원 관리(승인 탭)의 지원 항목과 같은 것 — 둘 중 어디서 체크해도 양쪽이 같이 바뀐다
const PROFILE_KEYS: MonthKey[] = ['voucher', 'gusen', 'kkumideun', 'woojin', 'subsidy'];

export default function ChildrenTab({ members, onLinked, onMembersChanged }: { members: Member[]; onLinked: () => void; onMembersChanged: () => void }) {
  const [kids, setKids] = useState<Child[]>([]);
  const [fixed, setFixed] = useState<Map<string, Fixed[]>>(new Map());
  const [counts, setCounts] = useState<Map<string, PayCount>>(new Map());
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<string | null>(null);   // 아이 id, 'new' = 새 아이
  const [cardFor, setCardFor] = useState<Child | null>(null);    // 선결제 카드 창을 연 아이
  const [form, setForm] = useState(emptyForm);
  const [failed, setFailed] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);

  const load = useCallback(async () => {
    try {
      const now = new Date();
      const ms = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const me = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const meY = `${me.getFullYear()}-${String(me.getMonth() + 1).padStart(2, '0')}-${String(me.getDate()).padStart(2, '0')}`;
      const [k, f, pc] = await Promise.all([getChildren(), getFixedByChild(), getPaymentCounts(ms, meY).catch(() => new Map<string, PayCount>())]);
      setCounts(pc);
      k.sort((a, b) => (a.memberCode ?? '').localeCompare(b.memberCode ?? ''));
      setKids(k);
      setFixed(f);
      setFailed('');
    } catch (e) {
      setFailed((e as Error).message);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const memberOf = useMemo(() => new Map(members.map(m => [m.userId, m])), [members]);
  const balOf = (k: Child, key: 'woojin' | 'subsidy') => (key === 'woojin' ? k.woojinBalance : k.subsidyBalance) ?? 0;
  const saveBalance = async (k: Child, key: 'woojin' | 'subsidy', text: string) => {
    const won = Number(text.replace(/[^\d]/g, '')) || 0;
    if (won === balOf(k, key)) return;
    setKids(list => list.map(x => (x.id === k.id ? { ...x, [key === 'woojin' ? 'woojinBalance' : 'subsidyBalance']: won } : x)));
    try { await setChildBalance(k.id, key, won); }
    catch (e) { showAlert(`저장하지 못했어요 — SQL(supabase/payment-balance.sql)을 실행했는지 확인해 주세요.\n${(e as Error).message}`); load(); }
  };
  const toggleUses = async (k: Child, key: UsesKey, on: boolean) => {
    setKids(list => list.map(x => (x.id === k.id ? { ...x, uses: { ...(x.uses ?? { voucher: false, gusen: false, kkumideun: false, woojin: false, subsidy: false, prepaid: false }), [key]: on } } : x)));
    try {
      await setChildUses(k.id, key, on);
      // 연결된 보호자 계정의 지원 항목도 같이
      const g = k.guardianUserId ? memberOf.get(k.guardianUserId) : undefined;
      if (g && (PROFILE_KEYS as UsesKey[]).includes(key) && g[key as MonthKey] !== on) {
        await saveMemberProfile({ userId: g.userId, nickname: g.nickname, centerNickname: g.centerNickname, memo: g.memo, approvedAt: g.approvedAt, [key]: on });
        onMembersChanged();
      }
      onLinked();   // 회원 관리 화면이 들고 있는 아이 명단도 새로 — 승인 탭 체크가 이걸 보여 준다
    }
    catch (e) { showAlert(`저장하지 못했어요 — SQL(supabase/child-payment-flags.sql)을 실행했는지 확인해 주세요.\n${(e as Error).message}`); load(); }
  };
  // 승인 여부 — 연결된 보호자 계정이 없으면 미가입
  const approvalOf = (k: Child) => !k.guardianUserId ? '미가입' : memberOf.get(k.guardianUserId)?.approvedAt ? '승인' : '미승인';

  // 내려받기 — 지금 화면의 명단(찾기 적용) 그대로
  const exportSheet = (): Sheet => {
    const head = ['회원 코드', '이름', '번호', '뒷번호', '승인 여부', '연결된 보호자', ...USES.map(u => u.label), '선결제 잔여/충전', '우진학교 남은 금액', '지원금 남은 금액', '고정 수업', '메모'];
    const rows = list.map(k => {
      const pc = counts.get(k.id);
      const ck = (key: UsesKey) => (k.uses?.[key] ? 'O' : '');
      return [
        k.memberCode ?? '', k.name, k.number ?? 1, k.phoneLast4 ?? '', approvalOf(k),
        k.guardianUserId ? memberOf.get(k.guardianUserId)?.nickname ?? '연결됨' : '',
        ...USES.map(u => ck(u.key)),
        k.prepaidTotal || pc?.prepaid ? `${(k.prepaidTotal ?? 0) - (pc?.prepaid ?? 0)}/${k.prepaidTotal ?? 0}` : '',
        balOf(k, 'woojin'), balOf(k, 'subsidy'),
        (fixed.get(k.id) ?? []).map(f => `${DOW[f.weekday]} ${f.time} ${f.teacher}${PAY_LABEL[f.payment.replace(/x/gi, '').charAt(0)] ? ` ${PAY_LABEL[f.payment.replace(/x/gi, '').charAt(0)]}` : ''}`).join(', '),
        k.memo ?? '',
      ];
    });
    return { name: '아이 명단', rows: [head, ...rows], cols: [9, 10, 5, 7, 8, 12, ...USES.map(() => 7), 12, 12, 12, 40, 20] };
  };
  const stamp = () => { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; };
  // 정렬 — 머리글을 누르면 오름차순 → 내림차순 → 원래대로(회원 코드 순)
  const sortVal = (k: Child, key: string): string | number => {
    if (key === 'name') return `${k.name}${String(k.number ?? 1).padStart(3, '0')}`;
    if (key.startsWith('uses:')) return k.uses?.[key.slice(5) as UsesKey] ? 1 : 0;
    if (key === 'prepaid') return (k.prepaidTotal ?? 0) - (counts.get(k.id)?.prepaid ?? 0);
    if (key.startsWith('bal:')) return balOf(k, key.slice(4) as 'woojin' | 'subsidy');
    return k.memberCode ?? '';
  };
  const filtered = kids.filter(k => !q.trim() || `${k.memberCode} ${k.name}${k.number ?? ''}`.includes(q.trim()));
  const list = sort ? [...filtered].sort((a, b) => {
    const x = sortVal(a, sort.key), y = sortVal(b, sort.key);
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'ko');
    return (sort.dir === 'asc' ? c : -c) || (a.memberCode ?? '').localeCompare(b.memberCode ?? '');
  }) : filtered;
  const sortBy = (key: string) => setSort(cur => (!cur || cur.key !== key ? { key, dir: 'asc' } : cur.dir === 'asc' ? { key, dir: 'desc' } : null));
  const arrow = (key: string) => <span className={`ml-0.5 text-[9px] ${sort?.key === key ? 'text-[var(--brand)]' : 'text-[#ddd]'}`}>{sort?.key === key ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>;
  const sortTh = 'cursor-pointer select-none hover:text-[#555]';

  const start = (k?: Child) => {
    setEditing(k ? k.id : 'new');
    setForm(k ? { name: k.name, number: k.number?.toString() ?? '', memo: k.memo ?? '', guardian: k.guardianUserId ?? '', phone: k.phoneLast4 ?? '',
      vl: String(k.voucherLimit ?? 0), gl: String(k.gusenLimit ?? 0), kl: String(k.kkumideunLimit ?? 0), pt: String(k.prepaidTotal ?? 0) } : emptyForm);
  };

  const save = async (k?: Child) => {
    if (!form.name.trim()) { showAlert('이름을 적어 주세요.'); return; }
    try {
      // 번호 빈칸 = 번호 없음(1로 보임, 시간표엔 숫자가 안 붙는다)
      await saveChild({ id: k?.id, name: form.name, number: form.number ? Number(form.number) : undefined, oral: k?.oral, memo: form.memo, phoneLast4: form.phone,
        voucherLimit: Number(form.vl) || 0, gusenLimit: Number(form.gl) || 0, kkumideunLimit: Number(form.kl) || 0 });   // 선결제는 [충전] 기록으로만
      if (k && form.guardian !== (k.guardianUserId ?? '')) {
        await linkChild(k.id, form.guardian || null);
        onLinked();
      }
      setEditing(null);
      load();
    } catch (e) {
      showAlert(`저장하지 못했어요.\n${(e as Error).message}`);
    }
  };

  const remove = async (k: Child) => {
    if (!(await askConfirm(`${k.memberCode} ${k.name}${k.number ?? ''}을(를) 명단에서 지울까요?\n고정 수업 칸의 이름은 남고, 명단 연결만 끊겨요.`))) return;
    try { await deleteChild(k.id); load(); } catch { showAlert('지우지 못했어요.'); }
  };

  const input = 'border-b border-[var(--brand)] py-1 text-[14px] outline-none bg-transparent';
  const th = 'text-left font-normal text-[12px] text-[#999] px-3 py-3 whitespace-nowrap';
  const td = 'px-3 py-2.5 align-middle';
  const btn = 'text-[12px] border px-2.5 py-1 transition-colors whitespace-nowrap';
  const approved = members.filter(m => m.nickname);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="이름·회원 코드 찾기"
          className="border border-[#e5e5e5] px-3 py-1.5 text-[13px] w-56 outline-none focus:border-[var(--brand)]" />
        <span className="text-[12px] text-[#aaa]">{list.length}명</span>
        <button onClick={() => downloadXlsx([exportSheet()], `아이명단_${stamp()}`).catch(e => showAlert(`내려받지 못했어요.\n${(e as Error).message}`))}
          className={`${btn} ml-auto border-[#16a34a] text-[#16a34a] hover:bg-[#f0fdf4]`} title="엑셀 파일(.xlsx) — 맥 Numbers 에서도 열려요">엑셀 다운로드</button>
        <button onClick={() => downloadCsv([exportSheet()], `아이명단_${stamp()}`)}
          className={`${btn} border-[#ddd] text-[#555] hover:bg-[#f8f8f8]`} title="CSV 파일 — 어떤 프로그램에서도 열려요">CSV 다운로드</button>
        <button onClick={() => start()} className={`${btn} border-[#0a0a0a] hover:bg-[#0a0a0a] hover:text-white`}>+ 아이 추가</button>
      </div>
      {failed && <p className="text-[13px] text-red-400 mb-3">불러오지 못했어요 — 회원 코드 SQL(supabase/children-code.sql)을 실행했는지 확인해 주세요. ({failed})</p>}

      <div className="overflow-x-auto border-t border-[#e5e5e5]">
        <table className="w-full text-[14px] text-[#333] border-collapse">
          <thead>
            <tr className="border-b border-[#e5e5e5]">
              <th className={th}>카카오계정번호</th>
              <th className={th}>회원 코드</th>
              <th className={`${th} ${sortTh}`} onClick={() => sortBy('name')} title="이름순 정렬">이름{arrow('name')}</th>
              <th className={`${th} text-center`} title="같은 이름 구분 번호 — 없으면 1">번호</th>
              <th className={th}>뒷번호</th>
              {USES.map(c => <th key={c.key} className={`${th} text-center ${sortTh}`} onClick={() => sortBy(`uses:${c.key}`)} title={`${c.label}를 쓰는 아이면 체크 · 눌러서 정렬`}>{c.label}{arrow(`uses:${c.key}`)}</th>)}
              <th className={`${th} text-center ${sortTh}`} onClick={() => sortBy('prepaid')} title="선결제 잔여순 정렬">선결제{arrow('prepaid')}<span className="block text-[10px] text-[#bbb]">잔여/충전</span></th>
              {BALANCES.map(b => <th key={b.key} className={`${th} text-center ${sortTh}`} onClick={() => sortBy(`bal:${b.key}`)} title={`${b.label} 남은 금액 — 직접 적어요(원)`}>{b.label}{arrow(`bal:${b.key}`)}<span className="block text-[10px] text-[#bbb]">남은 금액(원)</span></th>)}
              <th className={th}>고정 수업</th>
              <th className={th}>연결된 보호자 계정</th>
              <th className={th}>승인 여부</th>
              <th className={th}>메모</th>
              <th className={`${th} sticky right-0 bg-white`}><span className="sr-only">관리</span></th>
            </tr>
          </thead>
          <tbody>
            {editing === 'new' && (
              <EditRow form={form} setForm={setForm} input={input} td={td} btn={btn} approved={approved} code="새 코드" fixed={[]}
                onSave={() => save()} onCancel={() => setEditing(null)} />
            )}
            {list.map(k => editing === k.id ? (
              <EditRow key={k.id} form={form} setForm={setForm} input={input} td={td} btn={btn} approved={approved} code={k.memberCode ?? ''} fixed={fixed.get(k.id) ?? []}
                onSave={() => save(k)} onCancel={() => setEditing(null)} />
            ) : (
              <tr key={k.id} className="border-b border-[#f0f0f0]">
                <td className={`${td} text-[12px] text-[#999] whitespace-nowrap tabular-nums`}>{k.guardianUserId ? memberOf.get(k.guardianUserId)?.kakaoId || '-' : <span className="text-[#ddd]">-</span>}</td>
                <td className={`${td} text-[12px] text-[#888] whitespace-nowrap tabular-nums`}>{k.memberCode}</td>
                <td className={`${td} whitespace-nowrap`}>{k.name}</td>
                {/* 같은 이름 구분 번호 — 비어 있으면 1 (시간표에는 번호가 있는 아이만 이름 앞에 붙는다) */}
                <td className={`${td} text-center text-[13px] tabular-nums ${k.number ? '' : 'text-[#aaa]'}`}>{k.number ?? 1}</td>
                <td className={`${td} text-[12px] whitespace-nowrap tabular-nums`}>{k.phoneLast4 ?? <span className="text-[#ccc]">-</span>}</td>
                {USES.map(c => (
                  <td key={c.key} className={`${td} text-center`}>
                    <input type="checkbox" checked={!!k.uses?.[c.key]} onChange={e => toggleUses(k, c.key, e.target.checked)} aria-label={`${k.name} ${c.label} 사용`} />
                  </td>
                ))}
                <td className={`${td} text-[12px] text-center whitespace-nowrap tabular-nums`}>
                  {/* 선결제 잔여 + [충전·차감·수정](카드 내역) */}
                  <button type="button" onClick={() => setCardFor(k)} className="hover:underline" title="선결제 카드 — 충전 · 차감 · 수정">
                    {(k.prepaidTotal ?? 0) || (counts.get(k.id)?.prepaid ?? 0) ? `${(k.prepaidTotal ?? 0) - (counts.get(k.id)?.prepaid ?? 0)}/${k.prepaidTotal ?? 0}` : <span className="text-[#bbb]">-</span>}
                    <span className="ml-1 text-[10px] text-[var(--brand)] border border-[var(--brand)] rounded px-1">충전·차감·수정</span>
                  </button>
                </td>
                {BALANCES.map(b => (
                  <td key={b.key} className={`${td} text-center`}>
                    <input key={`${k.id}-${b.key}-${balOf(k, b.key)}`} defaultValue={balOf(k, b.key) ? balOf(k, b.key).toLocaleString('ko-KR') : ''} inputMode="numeric" placeholder="0"
                      onBlur={e => saveBalance(k, b.key, e.target.value)} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      className={`w-20 text-right text-[12px] tabular-nums border-b border-[#e5e5e5] outline-none bg-transparent focus:border-[var(--brand)] ${k.uses?.[b.key] ? '' : 'opacity-40'}`} />
                  </td>
                ))}
                <td className={`${td} text-[12px]`}><FixedList items={fixed.get(k.id) ?? []} /></td>
                <td className={`${td} text-[12px] whitespace-nowrap`}>
                  {k.guardianUserId ? <span className="text-[var(--brand)]">{memberOf.get(k.guardianUserId)?.nickname ?? '연결됨'}</span> : <span className="text-[#ccc]">-</span>}
                </td>
                <td className={`${td} text-[12px] whitespace-nowrap`}>
                  {(() => { const a = approvalOf(k); return <span className={a === '승인' ? 'text-[var(--brand)]' : a === '미승인' ? 'text-[#f59e0b]' : 'text-[#ccc]'}>{a}</span>; })()}
                </td>
                <td className={`${td} text-[12px] text-[#666] min-w-[120px]`}>{k.memo}</td>
                <td className={`${td} text-right whitespace-nowrap sticky right-0 bg-white shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.12)]`}>
                  <button onClick={() => start(k)} className={`${btn} border-[#e5e5e5] hover:bg-[#f8f8f8] mr-1`}>수정</button>
                  <button onClick={() => remove(k)} className={`${btn} border-[#e5e5e5] text-red-400 hover:bg-red-50`}>삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {cardFor && <Portal><PrepaidModal child={cardFor} onClose={() => { setCardFor(null); load(); }} /></Portal>}
    </div>
  );
}

/** 선결제 카드 창 — 카드 내역(충전·사용·남은 횟수·메모)과 [충전] · [차감] · [수정] */
function PrepaidModal({ child, onClose }: { child: Child; onClose: () => void }) {
  const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  const [rows, setRows] = useState<LedgerRow[] | null>(null);
  const [busy, setBusy] = useState(false);
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
    getChildLedger(child.id).then(setRows).catch(e => { setRows([]); showAlert(`불러오지 못했어요 — 선결제 SQL(supabase/prepaid-charges.sql)을 실행했는지 확인해 주세요.\n${(e as Error).message}`); });
  }, [child.id]);
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
    run(async () => { await addCharge(child.id, day, n, memo); setCount(''); setMemo(''); }, '충전하지 못했어요.');
  };
  const deduct = () => {
    const n = Number(useCount);
    if (!n || n < 0) { showAlert('차감 횟수를 적어 주세요.'); return; }
    run(async () => { await addCharge(child.id, useDay, -n, useMemo); setUseCount('1'); setUseMemo(''); }, '차감하지 못했어요.');
  };
  const fix = () => {
    if (fixLeft === '') { showAlert('남은 횟수를 적어 주세요.'); return; }
    const diff = Number(fixLeft) - left;
    if (!diff) { showAlert(`지금 남은 횟수(${left}회)와 같아요.`); return; }
    run(async () => { await addCharge(child.id, fixDay, diff, fixMemo, true); setFixLeft(''); setFixMemo(''); }, '수정하지 못했어요.');
  };

  const input = 'border-b border-[#ddd] py-1 text-[14px] outline-none focus:border-[var(--brand)]';
  const label = 'text-[11px] text-[#999]';
  const section = 'flex flex-wrap items-end gap-3';
  const title = 'w-full text-[11px] text-[#777]';

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div className="bg-[#f7f7f8] rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="text-[15px] text-[#27272a]">{child.name}{child.number ?? ''} · 선결제 카드</p>
          <button onClick={onClose} className="text-[13px] text-[#888]">닫기 ✕</button>
        </div>
        {rows === null ? <p className="text-[13px] text-[#aaa]">불러오는 중…</p> : <PrepaidCard rows={rows} name={child.name} />}

        <div className="bg-white rounded-xl p-4 space-y-4">
          {/* 충전 */}
          <div className={section}>
            <p className={title}>충전</p>
            <label className={label}>날짜<input type="date" value={day} onChange={e => e.target.value && setDay(e.target.value)} className={`${input} block`} /></label>
            <label className={label}>횟수<input value={count} inputMode="numeric" placeholder="50" onChange={e => setCount(e.target.value.replace(/\D/g, '').slice(0, 4))} className={`${input} block w-14 text-center`} /></label>
            <label className={`${label} flex-1 min-w-[110px]`}>메모<input value={memo} onChange={e => setMemo(e.target.value)} placeholder="예: 카드 남은 횟수 옮김" className={`${input} block w-full`} /></label>
            <button onClick={charge} disabled={busy} className="text-[12px] border border-[var(--brand)] bg-[var(--brand)] text-white px-3.5 py-1.5 rounded-full disabled:opacity-50">충전</button>
          </div>

          {/* 차감 */}
          <div className={`${section} pt-4 border-t border-[#f0f0f0]`}>
            <p className={title}>차감 <span className="text-[11px] text-[#aaa]">(임시)</span></p>
            <label className={label}>날짜<input type="date" value={useDay} onChange={e => e.target.value && setUseDay(e.target.value)} className={`${input} block`} /></label>
            <label className={label}>횟수<input value={useCount} inputMode="numeric" onChange={e => setUseCount(e.target.value.replace(/\D/g, '').slice(0, 3))} className={`${input} block w-14 text-center`} /></label>
            <label className={`${label} flex-1 min-w-[110px]`}>메모<input value={useMemo} onChange={e => setUseMemo(e.target.value)} placeholder="예: 10/7 수업" className={`${input} block w-full`} /></label>
            <button onClick={deduct} disabled={busy} className="text-[12px] border border-[#e11d48] text-[#e11d48] px-3.5 py-1.5 rounded-full hover:bg-red-50 disabled:opacity-50">차감</button>
          </div>

          {/* 수정 — 남은 횟수를 직접 */}
          <div className={`${section} pt-4 border-t border-[#f0f0f0]`}>
            <p className={title}>수정 <span className="text-[#aaa]">(남은 횟수를 직접 · 지금 {left}회)</span></p>
            <label className={label}>날짜<input type="date" value={fixDay} onChange={e => e.target.value && setFixDay(e.target.value)} className={`${input} block`} /></label>
            <label className={label}>남은 횟수<input value={fixLeft} inputMode="numeric" placeholder={String(left)} onChange={e => setFixLeft(e.target.value.replace(/\D/g, '').slice(0, 4))} className={`${input} block w-14 text-center`} /></label>
            <label className={`${label} flex-1 min-w-[110px]`}>메모<input value={fixMemo} onChange={e => setFixMemo(e.target.value)} placeholder="예: 종이 카드와 맞춤" className={`${input} block w-full`} /></label>
            <button onClick={fix} disabled={busy} className="text-[12px] border border-[#0a0a0a] bg-[#0a0a0a] text-white px-3.5 py-1.5 rounded-full disabled:opacity-50">수정</button>
          </div>

          <p className="text-[11px] text-[#aaa] leading-[1.7]">시간표 [결제 완료]에서 선결제로 확정한 수업도 사용으로 자동으로 들어가요(이건 시간표에서 고쳐요). 종이 카드에서 옮길 때는 지금 남은 횟수를 오늘 날짜로 충전하면 돼요.</p>
        </div>
      </div>
    </div>
  );
}

function FixedList({ items }: { items: Fixed[] }) {
  if (!items.length) return <span className="text-[#ccc]">-</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {items.map((f, i) => (
        <span key={i} className="whitespace-nowrap border border-[#eee] rounded px-1.5 py-0.5">
          {DOW[f.weekday]} {f.time} {f.teacher}{kindLabel(f.kind) ? ` ${kindLabel(f.kind)}` : ''}{PAY_LABEL[f.payment.replace(/x/gi, '').charAt(0)] ? ` · ${PAY_LABEL[f.payment.replace(/x/gi, '').charAt(0)]}` : ''}
        </span>
      ))}
    </span>
  );
}

function EditRow({ form, setForm, input, td, btn, approved, code, fixed, onSave, onCancel }: {
  form: typeof emptyForm;
  setForm: React.Dispatch<React.SetStateAction<typeof emptyForm>>;
  input: string; td: string; btn: string;
  approved: Member[];
  code: string;
  fixed: Fixed[];
  onSave: () => void;
  onCancel: () => void;
}) {
  const isNew = code === '새 코드';
  return (
    <tr className="border-b border-[#f0f0f0] bg-[#f8fbff]">
      <td className={`${td} text-[12px] text-[#bbb]`}>{approved.find(m => m.userId === form.guardian)?.kakaoId ?? '-'}</td>
      <td className={`${td} text-[12px] text-[#888]`}>{code}</td>
      <td className={td}>
        <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="이름" className={`${input} w-24`} autoFocus />
      </td>
      <td className={`${td} text-center`}>
        <input value={form.number} onChange={e => setForm(f => ({ ...f, number: e.target.value.replace(/\D/g, '') }))} placeholder="1" className={`${input} w-10 text-center`} />
      </td>
      <td className={td}>
        <input value={form.phone} inputMode="numeric" maxLength={4} placeholder="1234"
          onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 4) }))} className={`${input} w-14 text-center`} />
      </td>
      {/* 쓰는 결제·이번 달 사용·선결제는 표에서 바로 고친다 */}
      {[...USES, 'prepaid', ...BALANCES].map((_, i) => <td key={i} className={`${td} text-center text-[11px] text-[#ccc]`}>-</td>)}
      <td className={`${td} text-[12px]`}><FixedList items={fixed} /><p className="text-[10px] text-[#aaa] mt-1">고정 수업은 시간표 관리에서 고쳐요</p></td>
      <td className={td}>
        {isNew ? <span className="text-[11px] text-[#aaa]">저장 후 연결</span> : (
          <select value={form.guardian} onChange={e => setForm(f => ({ ...f, guardian: e.target.value }))}
            className="text-[13px] border border-[#ddd] bg-white px-2 py-1 max-w-[160px]">
            <option value="">연결 안 함</option>
            {approved.map(m => <option key={m.userId} value={m.userId}>{m.nickname}{m.centerNickname && m.centerNickname !== m.nickname ? ` (${m.centerNickname})` : ''}</option>)}
          </select>
        )}
      </td>
      <td className={`${td} text-[11px] text-[#aaa]`}>-</td>
      <td className={td}><input value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} placeholder="메모" className={`${input} w-full min-w-[120px]`} /></td>
      <td className={`${td} text-right whitespace-nowrap sticky right-0 bg-[#f8fbff] shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.12)]`}>
        <button onClick={onSave} className={`${btn} border-[var(--brand)] bg-[var(--brand)] text-white mr-1`}>저장</button>
        <button onClick={onCancel} className={`${btn} border-[#e5e5e5]`}>취소</button>
      </td>
    </tr>
  );
}
