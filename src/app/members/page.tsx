'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAdmin } from '@/components/AdminContext';
import { deleteProfile, getMembers, saveMemberProfile } from '@/lib/store';
import type { Member, MemberExtras } from '@/lib/types';
import { askConfirm, askPrompt, showAlert } from '@/lib/dialog';
import ChildrenTab from '@/components/ChildrenTab';
import type { Child } from '@/lib/timetable';
import { getChildren, linkChild } from '@/lib/timetable';

// 회원 관리 (관리자 전용) — 카카오로 로그인한 보호자 표.
// 보호자 닉네임은 보호자가 처음 입력한 것, 관리자 닉네임(center_nickname)·설명은 관리자가 정한다. 보호자 화면엔 늘 보호자 닉네임.
// "승인"을 누르면 승인일자가 찍힌다(같은 닉네임 회원이 있을 때만 관리자 닉네임을 정해야 한다). 승인/미승인 탭으로 나눠 본다(승인 탭의 '가입일자'는 승인한 날, 미승인 탭의 '가입신청일자'는 처음 로그인한 날).
// 메뉴에는 없고 관리자 모드 띠의 "회원 관리"로 들어온다.

type Filter = 'waiting' | 'approved' | 'children';

// 선결제 칸 — 지금은 가려 둔다(DB에는 칸이 있다). 다시 보이려면 true
const SHOW_PREPAID = false;

// 지원 항목 — 받는지 체크(O/X). 누르면 바로 저장된다
const SUPPORTS: { key: keyof Pick<MemberExtras, 'voucher' | 'gusen' | 'kkumideun' | 'woojin' | 'subsidy'>; label: string }[] = [
  { key: 'voucher', label: '바우처' },
  { key: 'gusen', label: '굳센' },
  { key: 'kkumideun', label: '꿈이든' },
  { key: 'woojin', label: '우진학교' },
  { key: 'subsidy', label: '지원금' },
];

const pad = (n: number) => String(n).padStart(2, '0');
const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
};
const fmtDateTime = (iso?: string) => {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${fmtDate(iso)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function MembersPage() {
  const { isAdmin } = useAdmin();
  const [members, setMembers] = useState<Member[]>([]);
  const [filter, setFilter] = useState<Filter>('approved');
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ nickname: '', centerNickname: '', memo: '', prepaidEunpyeong: '0', prepaidUijeongbu: '0', code: '', phone: '' });
  const [showDates, setShowDates] = useState(false);   // 카카오계정번호·회원 코드·가입일자·마지막 로그인은 접어 둔다
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const [kids, setKids] = useState<Child[]>([]);
  const loadKids = useCallback(() => { getChildren().then(setKids).catch(() => {}); }, []);
  useEffect(() => { if (isAdmin) loadKids(); }, [isAdmin, loadKids]);

  const load = useCallback(() => {
    getMembers()
      .then(m => { setMembers(m); setFailed(false); })
      .catch(() => setFailed(true))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  if (!isAdmin) {
    return <p className="text-center text-[14px] text-[#aaa] py-32">관리자만 볼 수 있는 화면이에요.</p>;
  }

  const kidOf = (userId: string) => kids.find(k => k.guardianUserId === userId);

  const startEdit = (m: Member) => {
    setEditing(m.userId);
    setForm({
      nickname: m.nickname, centerNickname: m.centerNickname ?? '', memo: m.memo ?? '',
      prepaidEunpyeong: String(m.prepaidEunpyeong), prepaidUijeongbu: String(m.prepaidUijeongbu),
      code: kidOf(m.userId)?.memberCode ?? '',
      phone: m.phoneLast4 ?? '',
    });
  };

  const save = async (m: Member) => {
    if (!form.nickname.trim()) { alert('보호자 닉네임을 입력해 주세요.'); return; }
    try {
      const r = await saveMemberProfile({
        userId: m.userId, nickname: form.nickname, centerNickname: form.centerNickname, memo: form.memo, approvedAt: m.approvedAt, phoneLast4: form.phone,
        prepaidEunpyeong: Number(form.prepaidEunpyeong) || 0, prepaidUijeongbu: Number(form.prepaidUijeongbu) || 0,
      });
      if (r === 'taken') { alert('이미 다른 회원이 쓰는 관리자 닉네임이에요.'); return; }
      // 회원 코드로 아이와 잇기 (계정 하나 = 아이 한 명)
      const code = form.code.trim().toUpperCase();
      const current = kidOf(m.userId);
      if (code !== (current?.memberCode ?? '')) {
        if (!code) {
          if (current) await linkChild(current.id, null);
        } else {
          const kid = kids.find(k => k.memberCode === code);
          if (!kid) { await showAlert(`회원 코드 ${code}인 아이가 명단에 없어요.`); return; }
          if (kid.guardianUserId && kid.guardianUserId !== m.userId && !(await askConfirm(`${code} ${kid.name}은(는) 다른 계정에 이어져 있어요.\n이 계정으로 옮길까요?`))) return;
          await linkChild(kid.id, m.userId);
        }
        loadKids();
      }
      setEditing(null);
      load();
    } catch { alert('저장하지 못했어요. 다시 시도해 주세요.'); }
  };

  const toggleSupport = async (m: Member, key: (typeof SUPPORTS)[number]['key']) => {
    try {
      await saveMemberProfile({ userId: m.userId, nickname: m.nickname, centerNickname: m.centerNickname, memo: m.memo, approvedAt: m.approvedAt, [key]: !m[key] });
      setMembers(ms => ms.map(x => (x.userId === m.userId ? { ...x, [key]: !m[key] } : x)));
    } catch { alert('저장하지 못했어요. 다시 시도해 주세요.'); }
  };

  // 승인 — 승인 버튼만 누르면 된다. 다만 같은 닉네임을 쓰는 다른 회원이 있으면 관리자 닉네임을 정해야 승인된다
  const setApproved = async (m: Member, approve: boolean) => {
    let centerNickname = m.centerNickname ?? '';
    if (approve) {
      const same = (name: string) => members.some(o => o.userId !== m.userId && (o.nickname.trim() === name.trim() || (o.centerNickname ?? '').trim() === name.trim()));
      if (!centerNickname && same(m.nickname)) {
        while (true) {
          const input = await askPrompt(`"${m.nickname}" 닉네임을 쓰는 회원이 이미 있어요.\n구분할 관리자 닉네임을 정해야 승인돼요.`, '');
          if (input === null) return;
          const v = input.trim();
          if (!v) continue;
          if (same(v)) { await showAlert(`"${v}"도 이미 쓰고 있어요. 다른 이름으로 정해 주세요.`); continue; }
          centerNickname = v;
          break;
        }
      }
    } else if (!(await askConfirm(`"${m.nickname}" 회원의 승인을 취소할까요?`))) {
      return;
    }
    try {
      const r = await saveMemberProfile({
        userId: m.userId,
        nickname: m.nickname,
        centerNickname,
        memo: m.memo,
        approvedAt: approve ? new Date().toISOString() : undefined,
      });
      if (r === 'taken') { await showAlert('이미 다른 회원이 쓰는 관리자 닉네임이에요.'); return; }
      load();
    } catch { showAlert('저장하지 못했어요. 다시 시도해 주세요.'); }
  };

  const remove = async (m: Member) => {
    if (!confirm(`"${m.nickname}" 회원의 닉네임·설명을 지울까요?\n다음에 로그인하면 보호자 닉네임을 다시 정하게 돼요.`)) return;
    try { await deleteProfile(m.userId); load(); }
    catch { alert('지우지 못했어요. 다시 시도해 주세요.'); }
  };

  const waiting = members.filter(m => !m.approvedAt);
  const approved = members.filter(m => m.approvedAt);
  const list = filter === 'waiting' ? waiting : approved;
  const btn = 'text-[12px] border px-2.5 py-1 transition-colors whitespace-nowrap';
  const input = 'w-full min-w-[90px] border-b border-[var(--brand)] py-1 text-[14px] outline-none bg-transparent';
  const th = 'text-left font-normal text-[12px] text-[#999] px-3 py-3 whitespace-nowrap';
  const td = 'px-3 py-3 align-middle';

  return (
    <div className="max-w-[1400px] mx-auto px-5 md:px-8 pt-8 pb-14 md:pt-14 fade-up">
      <h1 className="display-heading mb-3">회원 관리</h1>
      <p className="text-[14px] text-[#666] leading-[2] mb-8">
        카카오로 로그인한 보호자예요. 승인한 회원만 수업 신청 등을 할 수 있어요.
      </p>

      <div role="tablist" className="flex gap-1.5 mb-5">
        {([['approved', `승인 ${approved.length}`], ['waiting', `미승인 ${waiting.length}`], ['children', `아이 명단 ${kids.length}`]] as const).map(([key, label]) => (
          <button key={key} role="tab" aria-selected={filter === key} onClick={() => setFilter(key)}
            className={[
              'text-[13px] px-4 py-2 border transition-colors',
              filter === key ? 'border-[var(--brand)] bg-[var(--brand)] text-white' : 'border-[#e5e5e5] text-[#555] hover:bg-[#f8f8f8]',
            ].join(' ')}>
            {label}
          </button>
        ))}
      </div>

      {failed && <p className="text-[14px] text-red-400 py-6">회원 목록을 불러오지 못했어요. (DB 설정 SQL을 실행했는지 확인해 주세요)</p>}

      <datalist id="member-codes">
        {kids.map(k => <option key={k.id} value={k.memberCode}>{`${k.number ?? ''}${k.name}`}</option>)}
      </datalist>
      {filter === 'children' ? (
        <ChildrenTab members={members} onLinked={loadKids} />
      ) : (<>
      <div className="overflow-x-auto border-t border-[#e5e5e5]">
        <table className="w-full text-[14px] text-[#333] border-collapse">
          <thead>
            <tr className="border-b border-[#e5e5e5]">
              <th className={`${th} w-8 pr-0`}>
                <button type="button" onClick={() => setShowDates(v => !v)}
                  aria-label={showDates ? '카카오계정번호·회원 코드·가입일자·마지막 로그인 접기' : '카카오계정번호·회원 코드·가입일자·마지막 로그인 펼치기'} aria-expanded={showDates}
                  title={showDates ? '접기' : '카카오계정번호·회원 코드·가입일자·마지막 로그인 펼치기'}
                  className="w-5 h-5 inline-flex items-center justify-center rounded border border-[#ddd] text-[#888] hover:border-[var(--brand)] hover:text-[var(--brand)]">
                  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className={`transition-transform ${showDates ? 'rotate-180' : ''}`}>
                    <path d="M3.5 1.5 7 5l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </th>
              {showDates && <th className={th}>카카오계정번호</th>}
              {showDates && <th className={th}>회원 코드</th>}
              {showDates && <th className={th}>{filter === 'waiting' ? '가입신청일자' : '가입일자'}</th>}
              {showDates && <th className={th}>마지막 로그인</th>}
              <th className={th}>보호자 닉네임</th>
              <th className={th}>관리자 닉네임</th>
              <th className={th}>뒷번호</th>
              <th className={th}>설명</th>
              {SUPPORTS.map(x => <th key={x.key} className={`${th} text-center`}>{x.label}</th>)}
              {SHOW_PREPAID && <th className={th}>선결제 <span className="text-[11px] text-[#bbb]">은평 | 의정부</span></th>}
              <th className={th}><span className="sr-only">관리</span></th>
            </tr>
          </thead>
          <tbody>
            {list.map(m => {
              const on = editing === m.userId;
              return (
                <tr key={m.userId} className="border-b border-[#f0f0f0]">
                  <td className={`${td} w-8 pr-0`} />
                  {showDates && <td className={`${td} text-[12px] text-[#999] whitespace-nowrap`} title={`카카오 회원번호 ${m.kakaoId}`}>{m.kakaoId || '-'}</td>}
                  {showDates && (<td className={`${td} whitespace-nowrap`}>
                    {on ? (
                      <input className={`${input} w-20 uppercase`} value={form.code} placeholder="W0001" list="member-codes"
                        onChange={e => setForm(f => ({ ...f, code: e.target.value }))} />
                    ) : kidOf(m.userId) ? (
                      <span className="text-[12px]"><span className="text-[#888] tabular-nums">{kidOf(m.userId)!.memberCode}</span> {kidOf(m.userId)!.number ?? ''}{kidOf(m.userId)!.name}</span>
                    ) : m.requestedCode ? <span className="text-[12px] text-[#f59e0b]" title="가입할 때 적은 회원 코드 — 아직 연결 안 됨">요청 {m.requestedCode}</span> : <span className="text-[#ccc]">-</span>}
                  </td>)}
                  {showDates && <td className={`${td} whitespace-nowrap`}>{fmtDate(m.approvedAt ?? m.joinedAt)}</td>}
                  {showDates && <td className={`${td} whitespace-nowrap`}>{fmtDateTime(m.lastSignInAt)}</td>}
                  <td className={td}>
                    {on ? <input className={input} value={form.nickname} maxLength={20} onChange={e => setForm(f => ({ ...f, nickname: e.target.value }))} />
                      : m.nickname || <span className="text-[#ccc]">아직 안 정함</span>}
                  </td>
                  <td className={td}>
                    {on ? <input className={input} value={form.centerNickname} maxLength={20} placeholder="예: 김민준" onChange={e => setForm(f => ({ ...f, centerNickname: e.target.value }))} />
                      : m.centerNickname ? <span className="text-[var(--brand)]">{m.centerNickname}</span> : <span className="text-[#ccc]">-</span>}
                  </td>
                  <td className={`${td} whitespace-nowrap tabular-nums`}>
                    {on ? <input className={`${input} w-14 text-center`} value={form.phone} inputMode="numeric" maxLength={4} placeholder="1234"
                      onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 4) }))} />
                      : m.phoneLast4 ?? <span className="text-[#ccc]">-</span>}
                  </td>
                  <td className={`${td} min-w-[160px]`}>
                    {on ? <input className={input} value={form.memo} placeholder="메모" onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} />
                      : <span className="text-[#666] whitespace-pre-line">{m.memo || ''}</span>}
                  </td>
                  {SUPPORTS.map(x => (
                    <td key={x.key} className={`${td} text-center`}>
                      <input type="checkbox" checked={m[x.key]} disabled={!m.nickname} aria-label={`${m.centerNickname || m.nickname} ${x.label}`}
                        onChange={() => toggleSupport(m, x.key)} className="w-4 h-4 accent-[var(--brand)] cursor-pointer disabled:cursor-not-allowed" />
                    </td>
                  ))}
                  {SHOW_PREPAID && (
                  <td className={`${td} whitespace-nowrap`}>
                    {on ? (
                      <span className="inline-flex items-center gap-1 text-[13px]">
                        <input type="number" min={0} inputMode="numeric" value={form.prepaidEunpyeong} aria-label="선결제 은평"
                          onChange={e => setForm(f => ({ ...f, prepaidEunpyeong: e.target.value }))}
                          className="w-14 border-b border-[var(--brand)] py-1 text-center outline-none" />
                        <span className="text-[#ccc]">|</span>
                        <input type="number" min={0} inputMode="numeric" value={form.prepaidUijeongbu} aria-label="선결제 의정부"
                          onChange={e => setForm(f => ({ ...f, prepaidUijeongbu: e.target.value }))}
                          className="w-14 border-b border-[var(--brand)] py-1 text-center outline-none" />
                      </span>
                    ) : (
                      <span className="tabular-nums">{m.prepaidEunpyeong}<span className="mx-1.5 text-[#ccc]">|</span>{m.prepaidUijeongbu}</span>
                    )}
                  </td>
                  )}
                  <td className={`${td} text-right`}>
                    <div className="flex justify-end gap-1">
                      {on ? (
                        <>
                          <button onClick={() => save(m)} className={`${btn} border-[var(--brand)] bg-[var(--brand)] text-white hover:opacity-90`}>저장</button>
                          <button onClick={() => setEditing(null)} className={`${btn} border-[#e5e5e5] hover:bg-[#f8f8f8]`}>취소</button>
                        </>
                      ) : (
                        <>
                          {m.nickname && (m.approvedAt
                            ? <button onClick={() => setApproved(m, false)} className={`${btn} border-[#e5e5e5] text-[#888] hover:bg-[#f8f8f8]`}>승인 취소</button>
                            : <button onClick={() => setApproved(m, true)} className={`${btn} border-[var(--brand)] bg-[var(--brand)] text-white hover:opacity-90`}>승인</button>)}
                          <button onClick={() => startEdit(m)} className={`${btn} border-[#e5e5e5] hover:bg-[#f8f8f8]`}>수정</button>
                          {m.nickname && <button onClick={() => remove(m)} className={`${btn} border-[#e5e5e5] text-red-400 hover:bg-red-50`}>삭제</button>}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {loaded && !failed && list.length === 0 && (
        <p className="text-[14px] text-[#bbb] py-16 text-center">아직 없어요.</p>
      )}
      </>)}
    </div>
  );
}
