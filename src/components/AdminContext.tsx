'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { supabase } from '@/lib/supabaseClient';

// 관리자 로그인은 이 고정 계정 하나만 사용한다. 실제 "비밀번호"는
// Supabase 대시보드 → Authentication → Users에서 이 계정에 설정한 값이다.
const ADMIN_EMAIL = 'admin@we-center.local';

interface AdminCtx {
  isAdmin: boolean;
  requestAdmin: () => void;
  logout: () => void;
}

const Ctx = createContext<AdminCtx>({ isAdmin: false, requestAdmin: () => {}, logout: () => {} });

export function AdminProvider({ children }: { children: ReactNode }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [modal, setModal] = useState(false);
  const [pw, setPw] = useState('');
  const [err, setErr] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setIsAdmin(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAdmin(!!session);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const requestAdmin = useCallback(() => setModal(true), []);

  const logout = useCallback(() => {
    supabase.auth.signOut();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email: ADMIN_EMAIL, password: pw });
    if (error) {
      setErr(true);
    } else {
      setModal(false);
      setPw('');
      setErr(false);
    }
  };

  return (
    <Ctx.Provider value={{ isAdmin, requestAdmin, logout }}>
      {children}

      {modal && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/20 backdrop-blur-sm"
          onClick={() => { setModal(false); setPw(''); setErr(false); }}
        >
          <div
            className="bg-white border border-[#e5e5e5] w-80 p-8 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <p className="text-[11px] tracking-[0.2em] uppercase text-[#888] mb-6">관리자 인증</p>
            <form onSubmit={submit} className="space-y-4">
              <input
                type="password"
                value={pw}
                onChange={e => { setPw(e.target.value); setErr(false); }}
                placeholder="비밀번호"
                autoFocus
                className="w-full border-b border-[#ccc] py-2 text-sm outline-none focus:border-[#0a0a0a] transition-colors placeholder:text-[#bbb]"
              />
              {err && <p className="text-[11px] text-red-400">비밀번호가 올바르지 않습니다</p>}
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 bg-[#0a0a0a] text-white text-[11px] py-2.5 tracking-widest hover:bg-[#333] transition-colors"
                >
                  확인
                </button>
                <button
                  type="button"
                  onClick={() => { setModal(false); setPw(''); setErr(false); }}
                  className="flex-1 border border-[#e5e5e5] text-[11px] py-2.5 tracking-widest hover:bg-[#f8f8f8] transition-colors"
                >
                  취소
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export const useAdmin = () => useContext(Ctx);
