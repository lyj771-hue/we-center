'use client';

import { getMyBranches, type BranchKey, type MyBranch } from '@/lib/mypage';
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
  /** 지점(수색/의정부) 가입 상태 — 처음 가입한 지점 + 추가 신청한 지점 */
  branches: MyBranch[];
  refreshBranches: () => void;
  /** 프로필 다시 읽기 (지점 가입 취소 등으로 기본 지점·승인이 바뀌었을 때) */
  refreshProfile: () => void;
  /** 이 지점 수업스케쥴·마이페이지를 볼 수 있는지 (처음 지점은 승인, 다른 지점은 그 지점 승인) */
  canUse: (b: BranchKey) => boolean;
}

const Ctx = createContext<MemberCtx>({
  userId: null, profile: null, loading: true, login: () => {}, logout: () => {},
  branches: [], refreshBranches: () => {}, refreshProfile: () => {}, canUse: () => false,
});

export function MemberProvider({ children }: { children: ReactNode }) {
  const { isAdmin } = useAdmin();
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState<MyBranch[]>([]);
  const refreshBranches = useCallback(() => {
    if (!userId || !profile) { setBranches([]); return; }
    getMyBranches(userId, profile.center ?? 'eunpyeong').then(setBranches).catch(() => setBranches([]));
  }, [userId, profile]);
  useEffect(() => { refreshBranches(); }, [refreshBranches]);

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

  const refreshProfile = useCallback(() => {
    if (userId) getMyProfile(userId).then(setProfile).catch(() => {});
  }, [userId]);

  const memberId = isAdmin ? null : userId;
  const canUse = useCallback((b: BranchKey) => {
    const st = branches.find(x => x.key === b)?.status ?? (b === (profile?.center ?? 'eunpyeong') ? 'primary' : 'none');
    return st === 'primary' ? !!profile?.approvedAt : st === 'approved';
  }, [branches, profile]);
  const needsNickname = !!memberId && !loading && !profile;

  return (
    <Ctx.Provider value={{ userId: memberId, profile: memberId ? profile : null, loading, login, logout, branches: memberId ? branches : [], refreshBranches, refreshProfile, canUse }}>
      {children}
      {needsNickname && <NicknameSetup userId={memberId} onDone={setProfile} onCancel={logout} />}
    </Ctx.Provider>
  );
}

export const useMember = () => useContext(Ctx);

/** 처음 로그인한 보호자가 닉네임(아이 이름)을 한 번 정하는 창. 이후 변경은 관리자만 */
function NicknameSetup({ userId, onDone, onCancel }: { userId: string; onDone: (p: Profile) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  // 다니는 센터 — 수색(은평) / 의정부
  const [center, setCenter] = useState<'eunpyeong' | 'uijeongbu' | ''>('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const ready = !!name.trim() && /^\d{4}$/.test(phone) && !!center;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const child = name.trim();
    if (!child) { setError('아이 이름을 적어 주세요.'); return; }
    if (!/^\d{4}$/.test(phone)) { setError('대표 보호자 전화번호 뒷 4자리를 숫자로 적어 주세요.'); return; }
    if (!center) { setError('다니는 센터를 골라 주세요.'); return; }
    if (!(await askConfirm(`센터: ${center === 'uijeongbu' ? '의정부' : '수색'}\n아이 이름: ${child}\n전화번호 뒷자리: ${phone}\n\n이대로 가입할까요?\n(아이 이름은 나중에 센터에서만 바꿀 수 있어요)`))) return;
    setSaving(true);
    try {
      await createMyProfile(userId, child, phone, center);
      const p = await getMyProfile(userId);
      if (p) onDone(p);
    } catch {
      setError('저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  };

  const field = 'w-full border-b border-[#ccc] py-2 text-[15px] outline-none focus:border-[var(--brand)] placeholder:text-[#bbb]';
  const label = 'block text-[12px] text-[#888] mb-0.5';

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
      <div className="relative bg-white border border-[#e5e5e5] w-full max-w-sm p-8 shadow-2xl">
        {/* ✕ = 가입 취소(카카오 로그인 풀기) */}
        <button type="button" onClick={onCancel} aria-label="가입 취소"
          className="absolute top-3 right-3 w-9 h-9 flex items-center justify-center text-[18px] text-[#999] hover:text-[#333]">✕</button>
        <p className="text-[var(--brand)] text-[22px] mb-2">처음 오셨네요</p>
        <p className="text-[13px] leading-[2] text-[#666] mb-6">
          아이 이름과 대표 보호자 전화번호 뒷자리를 적어 주세요.
        </p>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <span className={label}>다니는 센터 <span className="text-[#e11d48]">*</span></span>
            <div className="flex gap-2 mt-1.5">
              {([['eunpyeong', '수색'], ['uijeongbu', '의정부']] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => { setCenter(k); setError(''); }}
                  className={`flex-1 py-2 text-[14px] border rounded-full ${center === k ? 'border-[var(--brand)] bg-[var(--brand)] text-white' : 'border-[#ddd] text-[#555] hover:bg-[#f8f8f8]'}`}>{l}</button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className={label}>아이 이름 <span className="text-[#e11d48]">*</span></span>
            <input type="text" value={name} maxLength={20} autoFocus placeholder="예: 김민준"
              onChange={e => { setName(e.target.value); setError(''); }} className={field} />
          </label>
          <label className="block">
            <span className={label}>대표 보호자 전화번호 뒷 4자리 <span className="text-[#e11d48]">*</span></span>
            <input type="text" inputMode="numeric" value={phone} maxLength={4} placeholder="예: 1234"
              onChange={e => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 4)); setError(''); }} className={`${field} tracking-[0.3em]`} />
          </label>
          {error && <p className="text-[12px] text-red-400">{error}</p>}
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={saving || !ready}
              className="flex-1 bg-[var(--brand)] text-white text-[13px] py-3 tracking-widest hover:opacity-90 transition-opacity disabled:opacity-40">
              {saving ? '저장 중...' : '가입하기'}
            </button>
            <button type="button" onClick={onCancel}
              className="flex-1 border border-[#e5e5e5] text-[13px] py-3 tracking-widest hover:bg-[#f8f8f8] transition-colors">
              가입 취소
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
