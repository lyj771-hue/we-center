'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { askConfirm, showAlert } from '@/lib/dialog';
import type { Child } from '@/lib/timetable';
import type { PayCount } from '@/lib/timetable';
import { deleteChild, getChildren, getFixedByChild, getPaymentCounts, linkChild, paymentColor, saveChild } from '@/lib/timetable';
import type { Member } from '@/lib/types';

// 회원 관리 — "아이 명단" 탭. 센터에 다니는 아이마다 회원 코드(W0001 …)가 있고,
// 카카오로 가입한 보호자 계정과 1:1로 잇는다(보호자 계정 하나 = 아이 한 명). 고정 수업은 시간표 관리에서 고친다.

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const PAY_LABEL: Record<string, string> = { b: '바우처', e: '굳센', c: '꿈이든', v: 'v' };

type Fixed = { weekday: number; time: string; teacher: string; payment: string; oral: boolean };
const emptyForm = { name: '', number: '', payment: '', oral: false, memo: '', guardian: '', phone: '', vl: '0', gl: '0', kl: '0', pt: '0' };

// 결제 현황 칸 — 바우처·굳센·꿈이든은 이번 달, 차감은 지금까지 (사용/제공·충전)
const PAY_COLS = [
  { key: 'voucher', label: '바우처', limit: 'voucherLimit', form: 'vl' },
  { key: 'gusen', label: '굳센', limit: 'gusenLimit', form: 'gl' },
  { key: 'kkumideun', label: '꿈이든', limit: 'kkumideunLimit', form: 'kl' },
  { key: 'prepaid', label: '차감', limit: 'prepaidTotal', form: 'pt' },
] as const;

export default function ChildrenTab({ members, onLinked }: { members: Member[]; onLinked: () => void }) {
  const [kids, setKids] = useState<Child[]>([]);
  const [fixed, setFixed] = useState<Map<string, Fixed[]>>(new Map());
  const [counts, setCounts] = useState<Map<string, PayCount>>(new Map());
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<string | null>(null);   // 아이 id, 'new' = 새 아이
  const [form, setForm] = useState(emptyForm);
  const [failed, setFailed] = useState('');

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
  const list = kids.filter(k => !q.trim() || `${k.memberCode} ${k.number ?? ''}${k.name}`.includes(q.trim()));

  const start = (k?: Child) => {
    setEditing(k ? k.id : 'new');
    setForm(k ? { name: k.name, number: k.number?.toString() ?? '', payment: k.payment, oral: !!k.oral, memo: k.memo ?? '', guardian: k.guardianUserId ?? '', phone: k.phoneLast4 ?? '',
      vl: String(k.voucherLimit ?? 0), gl: String(k.gusenLimit ?? 0), kl: String(k.kkumideunLimit ?? 0), pt: String(k.prepaidTotal ?? 0) } : emptyForm);
  };

  const save = async (k?: Child) => {
    if (!form.name.trim()) { showAlert('이름을 적어 주세요.'); return; }
    try {
      await saveChild({ id: k?.id, name: form.name, number: form.number ? Number(form.number) : undefined, payment: form.payment, oral: form.oral, memo: form.memo, phoneLast4: form.phone,
        voucherLimit: Number(form.vl) || 0, gusenLimit: Number(form.gl) || 0, kkumideunLimit: Number(form.kl) || 0, prepaidTotal: Number(form.pt) || 0 });
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
    if (!(await askConfirm(`${k.memberCode} ${k.number ?? ''}${k.name}을(를) 명단에서 지울까요?\n고정 수업 칸의 이름은 남고, 명단 연결만 끊겨요.`))) return;
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
        <button onClick={() => start()} className={`${btn} ml-auto border-[#0a0a0a] hover:bg-[#0a0a0a] hover:text-white`}>+ 아이 추가</button>
      </div>
      {failed && <p className="text-[13px] text-red-400 mb-3">불러오지 못했어요 — 회원 코드 SQL(supabase/children-code.sql)을 실행했는지 확인해 주세요. ({failed})</p>}

      <div className="overflow-x-auto border-t border-[#e5e5e5]">
        <table className="w-full text-[14px] text-[#333] border-collapse">
          <thead>
            <tr className="border-b border-[#e5e5e5]">
              <th className={th}>카카오계정번호</th>
              <th className={th}>회원 코드</th>
              <th className={th}>이름</th>
              <th className={th}>뒷번호</th>
              <th className={th}>기본 결제</th>
              {PAY_COLS.map(c => <th key={c.key} className={`${th} text-center`}>{c.label}<span className="block text-[10px] text-[#bbb]">{c.key === 'prepaid' ? '사용/충전' : '이번 달'}</span></th>)}
              <th className={th}>고정 수업</th>
              <th className={th}>연결된 보호자 계정</th>
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
                <td className={`${td} whitespace-nowrap`} style={{ color: paymentColor(k.payment) }}>{k.number ?? ''}{k.oral ? 'S' : ''}{k.name}</td>
                <td className={`${td} text-[12px] whitespace-nowrap tabular-nums`}>{k.phoneLast4 ?? <span className="text-[#ccc]">-</span>}</td>
                <td className={`${td} text-[12px] whitespace-nowrap`}>{k.payment ? `${k.payment} ${PAY_LABEL[k.payment] ?? ''}` : <span className="text-[#ccc]">없음</span>}</td>
                {PAY_COLS.map(c => {
                  const used = counts.get(k.id)?.[c.key] ?? 0;
                  const total = (k[c.limit] as number | undefined) ?? 0;
                  return (
                    <td key={c.key} className={`${td} text-[12px] text-center whitespace-nowrap tabular-nums ${total && used >= total ? 'text-[#e11d48]' : ''}`}>
                      {total || used ? `${used}/${total}` : <span className="text-[#ddd]">-</span>}
                    </td>
                  );
                })}
                <td className={`${td} text-[12px]`}><FixedList items={fixed.get(k.id) ?? []} /></td>
                <td className={`${td} text-[12px] whitespace-nowrap`}>
                  {k.guardianUserId ? <span className="text-[var(--brand)]">{memberOf.get(k.guardianUserId)?.nickname ?? '연결됨'}</span> : <span className="text-[#ccc]">-</span>}
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
    </div>
  );
}

function FixedList({ items }: { items: Fixed[] }) {
  if (!items.length) return <span className="text-[#ccc]">-</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {items.map((f, i) => (
        <span key={i} className="whitespace-nowrap border border-[#eee] rounded px-1.5 py-0.5" style={{ color: paymentColor(f.payment) }}>
          {DOW[f.weekday]} {f.time} {f.teacher}{f.oral ? ' S' : ''}{f.payment ? ` ${f.payment}` : ''}
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
        <span className="inline-flex items-center gap-1">
          <input value={form.number} onChange={e => setForm(f => ({ ...f, number: e.target.value.replace(/\D/g, '') }))} placeholder="숫자" className={`${input} w-10 text-center`} />
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="이름" className={`${input} w-24`} autoFocus />
        </span>
        <label className="flex items-center gap-1 text-[11px] text-[#888] mt-1"><input type="checkbox" checked={form.oral} onChange={e => setForm(f => ({ ...f, oral: e.target.checked }))} />구강(S)</label>
      </td>
      <td className={td}>
        <input value={form.phone} inputMode="numeric" maxLength={4} placeholder="1234"
          onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 4) }))} className={`${input} w-14 text-center`} />
      </td>
      <td className={td}>
        <input value={form.payment} onChange={e => setForm(f => ({ ...f, payment: e.target.value }))} placeholder="b·e·c" className={`${input} w-14 text-center`}
          style={{ color: paymentColor(form.payment) }} />
      </td>
      {PAY_COLS.map(c => (
        <td key={c.key} className={`${td} text-center`}>
          <input value={form[c.form]} inputMode="numeric" title={c.key === 'prepaid' ? '지금까지 충전한 횟수' : '한 달 제공 횟수'}
            onChange={e => setForm(f => ({ ...f, [c.form]: e.target.value.replace(/\D/g, '').slice(0, 3) }))} className={`${input} w-10 text-center`} />
        </td>
      ))}
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
      <td className={td}><input value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} placeholder="메모" className={`${input} w-full min-w-[120px]`} /></td>
      <td className={`${td} text-right whitespace-nowrap sticky right-0 bg-[#f8fbff] shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.12)]`}>
        <button onClick={onSave} className={`${btn} border-[var(--brand)] bg-[var(--brand)] text-white mr-1`}>저장</button>
        <button onClick={onCancel} className={`${btn} border-[#e5e5e5]`}>취소</button>
      </td>
    </tr>
  );
}
