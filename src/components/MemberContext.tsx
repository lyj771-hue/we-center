'use client';

import { getMyBranches, type BranchKey, type MyBranch } from '@/lib/mypage';
import { claimTeacher, getMyTeacher, type MyTeacher } from '@/lib/teacher';
import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { createMyProfile, fetchKakaoPhone, getMyProfile, saveMyPhone, signInWithKakao } from '@/lib/store';
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
  /** 이 카카오 계정이 선생님이면 — 선생님은 시간표 보기만 (가입 창·마이페이지 없음) */
  teacher: MyTeacher | null;
}

const Ctx = createContext<MemberCtx>({
  userId: null, profile: null, loading: true, login: () => {}, logout: () => {},
  branches: [], refreshBranches: () => {}, refreshProfile: () => {}, canUse: () => false, teacher: null,
});

export function MemberProvider({ children }: { children: ReactNode }) {
  const { isAdmin } = useAdmin();
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState<MyBranch[]>([]);
  const [teacher, setTeacher] = useState<MyTeacher | null>(null);
  // 로그인 확인이 끝까지 안 됐을 때 — 가입 창을 띄우지 않는다(선생님·회원을 새로 가입시키지 않게)
  const [unsure, setUnsure] = useState(false);
  // 카카오계정 전화번호 — 로그인 직후 한 번 카카오에서 읽는다(접근 토큰은 그때만 있다). 새로고침해도 가입 창에 쓰게 탭에 잠깐 둔다
  const [kakaoPhone, setKakaoPhone] = useState<string | null>(() => {
    try { return typeof window !== 'undefined' ? sessionStorage.getItem('kakaoPhone') : null; } catch { return null; }
  });
  const refreshBranches = useCallback(() => {
    if (!userId || !profile) { setBranches([]); return; }
    getMyBranches(userId, profile.center ?? 'eunpyeong').then(setBranches).catch(() => setBranches([]));
  }, [userId, profile]);
  useEffect(() => { refreshBranches(); }, [refreshBranches]);

  useEffect(() => {
    // 로그인 직후엔 apply 가 여러 번(첫 세션·로그인·토큰 갱신) 거의 동시에 불린다.
    // 늦게 끝난 예전 확인 결과가 새 결과를 덮어쓰면, 이미 이어진 선생님·가입한 보호자에게도 가입 창이 뜬다 → 마지막 요청 결과만 쓴다.
    // 둘 다 없다고 나오면(세션이 막 붙는 중일 수 있어) 잠깐 뒤 한 번 더 확인하고 나서 가입 창을 띄운다.
    // 확인이 실패하면(세션이 아직 안 붙어 요청이 막힌 경우 등) "없음"으로 치지 않고 다시 확인한다 — 이어진 선생님에게 가입 창이 뜨지 않게.
    // 끝까지 확인이 안 되면 가입 창은 띄우지 않는다(unsure).
    let seq = 0;
    const once = async (id: string) => {
      const [p, t] = await Promise.allSettled([getMyProfile(id), getMyTeacher()]);
      return { ok: p.status === 'fulfilled' && t.status === 'fulfilled', p: p.status === 'fulfilled' ? p.value : null, t: t.status === 'fulfilled' ? t.value : null };
    };
    const check = async (id: string, my: number) => {
      let r = await once(id);
      for (const wait of [700, 1500, 3000]) {
        if (my !== seq || (r.ok && (r.p || r.t)) || r.p || r.t) break;
        await new Promise(res => setTimeout(res, wait));
        r = await once(id);
      }
      return r;
    };
    const apply = (id: string | null) => {
      const my = ++seq;
      setUserId(id);
      if (!id) { setProfile(null); setTeacher(null); setUnsure(false); setLoading(false); return; }
      setLoading(true);
      check(id, my)
        .then(r => { if (my !== seq) return; setProfile(r.p); setTeacher(r.t); setUnsure(!r.ok && !r.p && !r.t); })
        .finally(() => { if (my === seq) setLoading(false); });
    };
    // 카카오 로그인이 실패해서 돌아오면 주소에 error_description 이 붙는다 — 알려 주고 주소를 깨끗이
    const params = new URLSearchParams(window.location.hash.slice(1) || window.location.search);
    const err = params.get('error_description');
    if (err) {
      history.replaceState(null, '', window.location.pathname);
      showAlert(`로그인하지 못했어요.\n(${err.replace(/\+/g, ' ')})`);
    }
    // 카카오에서 막 돌아온 세션엔 카카오 접근 토큰이 있다 — 전화번호를 읽어 두고, 이미 가입한 분이면 프로필에도 저장
    const seen = new Set<string>();
    const capture = (session: { provider_token?: string | null; user: { id: string } } | null) => {
      const token = session?.provider_token;
      if (!token || seen.has(token)) return;
      seen.add(token);
      fetchKakaoPhone(token).then(p => {
        if (!p) return;
        setKakaoPhone(p);
        try { sessionStorage.setItem('kakaoPhone', p); } catch { /* 저장 못 해도 괜찮다 */ }
        saveMyPhone(p).catch(() => {});
      });
    };
    supabase.auth.getSession().then(({ data }) => { capture(data.session); apply(data.session?.user.id ?? null); });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => { capture(session); apply(session?.user.id ?? null); });
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
  const needsNickname = !!memberId && !loading && !profile && !teacher && !unsure;

  return (
    <Ctx.Provider value={{ userId: memberId, profile: memberId ? profile : null, loading, login, logout, branches: memberId ? branches : [], refreshBranches, refreshProfile, canUse, teacher: memberId ? teacher : null }}>
      {children}
      {needsNickname && <NicknameSetup userId={memberId} kakaoPhone={kakaoPhone} onDone={setProfile} onTeacher={setTeacher} onCancel={logout} />}
    </Ctx.Provider>
  );
}

export const useMember = () => useContext(Ctx);

/** 처음 로그인한 보호자가 닉네임(아이 이름)을 한 번 정하는 창. 이후 변경은 관리자만 */
function NicknameSetup({ userId, kakaoPhone, onDone, onTeacher, onCancel }: { userId: string; kakaoPhone: string | null; onDone: (p: Profile) => void; onTeacher: (t: MyTeacher) => void; onCancel: () => void }) {
  // 구분 — 보호자(아이 이름·뒷번호) / 선생님(이름·휴대전화 번호 → 회원관리에 적어 둔 것과 같으면 인증)
  const [role, setRole] = useState<'guardian' | 'teacher'>('guardian');
  // 뒷번호 칸은 카카오계정 전화번호로 미리 채운다 — 다른 번호로 가입하고 싶으면 고칠 수 있다
  const last4 = (kakaoPhone ?? '').replace(/\D/g, '').slice(-4);
  const [tPhone, setTPhone] = useState(last4);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState(last4);   // 보호자 — 칸은 없고 카카오 번호 뒷 4자리
  // 카카오 번호가 늦게 오면 — 아직 비어 있는 칸만 채운다
  useEffect(() => {
    if (!last4) return;
    setPhone(p => p || last4);
    setTPhone(p => p || last4);
  }, [last4]);
  // 다니는 센터 — 수색(은평) / 의정부
  const [center, setCenter] = useState<'eunpyeong' | 'uijeongbu' | ''>('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const ready = role === 'teacher'
    ? !!name.trim() && /^\d{4}$/.test(tPhone)
    : !!name.trim() && !!center;

  // 선생님 인증
  const submitTeacher = async () => {
    setSaving(true);
    try {
      const r = await claimTeacher(name, tPhone);
      if (r === 'ok') {
        if (kakaoPhone) await saveMyPhone(kakaoPhone).catch(() => {});
        const t = await getMyTeacher();
        if (t) { await showAlert(`${t.name} 선생님, 인증됐어요.\n위 메뉴의 시간표에서 수업을 볼 수 있어요.`); onTeacher(t); }
        return;
      }
      setError(r === 'taken' ? '이미 다른 카카오 계정으로 인증된 선생님이에요. 센터에 말씀해 주세요.'
        : r === 'bad_phone' ? '휴대전화 뒷번호 4자리를 숫자로 적어 주세요.'
        : '센터에 등록된 선생님 정보와 달라요. 이름과 휴대전화 뒷번호를 확인해 주세요.');
    } catch {
      setError('인증하지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (role === 'teacher') { await submitTeacher(); return; }
    const child = name.trim();
    if (!child) { setError('아이 이름을 적어 주세요.'); return; }
    if (!center) { setError('다니는 센터를 골라 주세요.'); return; }
    if (!(await askConfirm(`센터: ${center === 'uijeongbu' ? '의정부' : '수색'}\n아이 이름: ${child}\n\n이대로 가입할까요?\n(아이 이름은 나중에 센터에서만 바꿀 수 있어요)`))) return;
    setSaving(true);
    try {
      // 보호자 전화번호는 묻지 않고 카카오계정 번호로 (뒷 4자리 + 전체 번호) — 센터가 아이 명단 번호와 비교한다
      await createMyProfile(userId, child, phone, center);
      if (kakaoPhone) await saveMyPhone(kakaoPhone).catch(() => {});
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
          {role === 'teacher' ? '센터에 등록된 이름과 휴대전화 뒷번호 4자리를 적어 주세요.' : '다니는 센터를 고르고 아이 이름을 적어 주세요.'}
        </p>
        <form onSubmit={submit} className="space-y-4">
          {/* 구분 */}
          <div className="flex gap-2">
            {([['guardian', '보호자'], ['teacher', '선생님']] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => { setRole(k); setError(''); }}
                className={`flex-1 py-1.5 text-[13px] border-b-2 ${role === k ? 'border-[var(--brand)] text-[var(--brand)]' : 'border-transparent text-[#999]'}`}>{l}</button>
            ))}
          </div>
          {role === 'teacher' ? (<>
            <label className="block">
              <span className={label}>선생님 이름 <span className="text-[#e11d48]">*</span></span>
              <input type="text" value={name} maxLength={20} placeholder="예: 이정길"
                onChange={e => { setName(e.target.value); setError(''); }} className={field} />
            </label>
            <label className="block">
              <span className={label}>휴대전화 뒷번호 4자리 <span className="text-[#e11d48]">*</span></span>
              <input type="text" inputMode="numeric" value={tPhone} maxLength={4} placeholder="예: 1234"
                onChange={e => { setTPhone(e.target.value.replace(/\D/g, '').slice(0, 4)); setError(''); }} className={`${field} tracking-[0.3em]`} />
            </label>
          </>) : (<>
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
          </>)}
          {error && <p className="text-[12px] text-red-400">{error}</p>}
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={saving || !ready}
              className="flex-1 bg-[var(--brand)] text-white text-[13px] py-3 tracking-widest hover:opacity-90 transition-opacity disabled:opacity-40">
              {saving ? '저장 중...' : role === 'teacher' ? '선생님 인증' : '가입하기'}
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
