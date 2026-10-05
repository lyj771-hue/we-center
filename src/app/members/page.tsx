'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAdmin } from '@/components/AdminContext';
import { deleteProfile, getProfiles, updateProfile } from '@/lib/store';
import type { Profile, ProfileStatus } from '@/lib/types';

// 회원 관리 (관리자 전용) — 카카오로 로그인한 보호자의 닉네임을 승인·거절하고, 닉네임을 바꾼다.
// 메뉴에는 없고 관리자 모드 띠의 "회원 관리"로 들어온다.

const TABS: { key: ProfileStatus; label: string }[] = [
  { key: 'pending', label: '승인 대기' },
  { key: 'approved', label: '승인됨' },
  { key: 'rejected', label: '거절됨' },
];

const fmt = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
};

export default function MembersPage() {
  const { isAdmin } = useAdmin();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [tab, setTab] = useState<ProfileStatus>('pending');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(() => {
    getProfiles().then(setProfiles).catch(() => setProfiles([])).finally(() => setLoaded(true));
  }, []);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  if (!isAdmin) {
    return <p className="text-center text-[14px] text-[#aaa] py-32">관리자만 볼 수 있는 화면이에요.</p>;
  }

  const setStatus = async (p: Profile, status: ProfileStatus) => {
    try { await updateProfile(p.userId, { status }); load(); }
    catch { alert('저장하지 못했어요. 다시 시도해 주세요.'); }
  };

  const saveNickname = async (p: Profile) => {
    const nickname = draft.trim();
    if (!nickname || nickname === p.nickname) { setEditing(null); return; }
    try {
      const r = await updateProfile(p.userId, { nickname });
      if (r === 'taken') { alert('이미 쓰고 있는 닉네임이에요.'); return; }
      setEditing(null);
      load();
    } catch { alert('저장하지 못했어요. 다시 시도해 주세요.'); }
  };

  const remove = async (p: Profile) => {
    if (!confirm(`"${p.nickname}" 회원의 닉네임을 지울까요?\n다음에 로그인하면 닉네임을 다시 정하게 돼요.`)) return;
    try { await deleteProfile(p.userId); load(); }
    catch { alert('지우지 못했어요. 다시 시도해 주세요.'); }
  };

  const list = profiles.filter(p => p.status === tab);
  const count = (s: ProfileStatus) => profiles.filter(p => p.status === s).length;
  const btn = 'text-[12px] border px-3 py-1.5 transition-colors shrink-0';

  return (
    <div className="max-w-[768px] mx-auto px-5 md:px-8 pt-8 pb-14 md:pt-14 fade-up">
      <h1 className="display-heading mb-3">회원 관리</h1>
      <p className="text-[14px] text-[#666] leading-[1.9] mb-10">
        카카오로 로그인한 보호자의 닉네임이에요. 승인해야 수업 신청 등을 할 수 있어요.
      </p>

      <div role="tablist" className="flex gap-1.5 mb-6">
        {TABS.map(t => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={[
              'text-[13px] px-4 py-2 border transition-colors',
              tab === t.key ? 'border-[var(--brand)] bg-[var(--brand)] text-white' : 'border-[#e5e5e5] text-[#555] hover:bg-[#f8f8f8]',
            ].join(' ')}>
            {t.label} {count(t.key)}
          </button>
        ))}
      </div>

      {loaded && list.length === 0 && (
        <p className="text-[14px] text-[#bbb] py-16 text-center border-t border-[#eee]">아직 없어요.</p>
      )}

      <ul className="divide-y divide-[#eee] border-t border-[#eee]">
        {list.map(p => (
          <li key={p.userId} className="flex flex-wrap items-center gap-3 py-4">
            <div className="flex-1 min-w-[160px]">
              {editing === p.userId ? (
                <input value={draft} onChange={e => setDraft(e.target.value)} maxLength={20} autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') saveNickname(p); if (e.key === 'Escape') setEditing(null); }}
                  className="w-full border-b border-[var(--brand)] py-1 text-[16px] outline-none" />
              ) : (
                <p className="text-[16px] text-[#222]">{p.nickname}</p>
              )}
              <p className="text-[12px] text-[#aaa] mt-0.5">{fmt(p.createdAt)} 가입</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {editing === p.userId ? (
                <>
                  <button onClick={() => saveNickname(p)} className={`${btn} border-[var(--brand)] text-[var(--brand)] hover:bg-[var(--brand)] hover:text-white`}>저장</button>
                  <button onClick={() => setEditing(null)} className={`${btn} border-[#e5e5e5] hover:bg-[#f8f8f8]`}>취소</button>
                </>
              ) : (
                <>
                  {p.status !== 'approved' && (
                    <button onClick={() => setStatus(p, 'approved')} className={`${btn} border-[var(--brand)] bg-[var(--brand)] text-white hover:opacity-90`}>승인</button>
                  )}
                  {p.status !== 'rejected' && (
                    <button onClick={() => setStatus(p, 'rejected')} className={`${btn} border-[#e5e5e5] text-[#888] hover:bg-[#f8f8f8]`}>
                      {p.status === 'approved' ? '승인 취소' : '거절'}
                    </button>
                  )}
                  <button onClick={() => { setEditing(p.userId); setDraft(p.nickname); }} className={`${btn} border-[#e5e5e5] hover:bg-[#f8f8f8]`}>닉네임 수정</button>
                  <button onClick={() => remove(p)} className={`${btn} border-[#e5e5e5] text-red-400 hover:bg-red-50`}>삭제</button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
