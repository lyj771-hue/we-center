'use client';

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { createMyProfile, getMyProfile, signInWithKakao } from '@/lib/store';
import type { Profile } from '@/lib/types';
import { useAdmin } from './AdminContext';
import { askConfirm, showAlert } from '@/lib/dialog';

// 보호자 로그인(카카오) 상태. 관리자 계정은 여기서 다루지 않는다(AdminContext).
// 처음 로그인해서 닉네임이 없으면 보호자 닉네임 입력 창을 띄운다. 센터 닉네임은 관리자가 정한다(있으면 승인된 회원).

interface MemberCtx {
  /** 로그인한 보호자의 계정 id (로그인 안 했거나 관리자면 null) */
  userId: string | null;
  /** 닉네임 — 아직 안 정했으면 null */
  profile: Profile | null;
  loading: boolean;
  login: () => void;
  logout: () => void;
}

const Ctx = createContext<MemberCtx>({
  userId: null, profile: null, loading: true, login: () => {}, logout: () => {},
});

export function MemberProvider({ children }: { children: ReactNode }) {
  const { isAdmin } = useAdmin();
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const apply = (id: string | null) => {
      setUserId(id);
      if (!id) { setProfile(null); setLoading(false); return; }
      setLoading(true);
      getMyProfile(id)
        .then(setProfile)
        .catch(() => setProfile(null))
        .finally(() => setLoading(false));
    };
    // 카카오 로그인이 실패해서 돌아오면 주소에 error_description 이 붙는다 — 알려 주고 주소를 깨끗이
    const params = new URLSearchParams(window.location.hash.slice(1) || window.location.search);
    const err = params.get('error_description');
    if (err) {
      history.replaceState(null, '', window.location.pathname);
      showAlert(`로그인하지 못했어요.\n(${err.replace(/\+/g, ' ')})`);
    }
    supabase.auth.getSession().then(({ data }) => apply(data.session?.user.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => apply(session?.user.id ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const login = useCallback(() => {
    signInWithKakao().catch(() => showAlert('카카오 로그인을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.'));
  }, []);
  const logout = useCallback(() => { supabase.auth.signOut(); }, []);

  const memberId = isAdmin ? null : userId;
  const needsNickname = !!memberId && !loading && !profile;

  return (
    <Ctx.Provider value={{ userId: memberId, profile: memberId ? profile : null, loading, login, logout }}>
      {children}
      {needsNickname && <NicknameSetup userId={memberId} onDone={setProfile} onCancel={logout} />}
    </Ctx.Provider>
  );
}

export const useMember = () => useContext(Ctx);

/** 처음 로그인한 보호자가 닉네임(아이 이름)을 한 번 정하는 창. 이후 변경은 관리자만 */
function NicknameSetup({ userId, onDone, onCancel }: { userId: string; onDone: (p: Profile) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nickname = name.trim();
    if (!nickname) return;
    if (!(await askConfirm(`닉네임을 "${nickname}"(으)로 정할까요?\n한 번 정하면 바꿀 때 센터에 요청해야 해요.`))) return;
    setSaving(true);
    try {
      await createMyProfile(userId, nickname);
      const p = await getMyProfile(userId);
      if (p) onDone(p);
    } catch {
      setError('저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
      <div className="bg-white border border-[#e5e5e5] w-full max-w-sm p-8 shadow-2xl">
        <p className="text-[var(--brand)] text-[22px] mb-2">아이 이름(닉네임)을 정해 주세요</p>
        <p className="text-[13px] leading-[2] text-[#666] mb-6">
          아이 이름으로 적어 주세요.<br />
          한 번 정한 닉네임은 센터에서만 바꿀 수 있어요.
        </p>
        <form onSubmit={submit} className="space-y-4">
          <input
            type="text"
            value={name}
            maxLength={20}
            onChange={e => { setName(e.target.value); setError(''); }}
            placeholder="예: 김민준"
            autoFocus
            className="w-full border-b border-[#ccc] py-2 text-[15px] outline-none focus:border-[var(--brand)] placeholder:text-[#bbb]"
          />
          {error && <p className="text-[12px] text-red-400">{error}</p>}
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={saving || !name.trim()}
              className="flex-1 bg-[var(--brand)] text-white text-[13px] py-3 tracking-widest hover:opacity-90 transition-opacity disabled:opacity-40">
              {saving ? '저장 중...' : '정하기'}
            </button>
            <button type="button" onClick={onCancel}
              className="flex-1 border border-[#e5e5e5] text-[13px] py-3 tracking-widest hover:bg-[#f8f8f8] transition-colors">
              로그아웃
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
