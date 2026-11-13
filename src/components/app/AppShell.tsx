'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useMember } from '@/components/MemberContext';
import type { BranchKey, MyChild, MyKid } from '@/lib/mypage';
import { BRANCHES, getMyChild, getMyChildCenters, getMyChildren, setActiveChild } from '@/lib/mypage';
import { showAlert } from '@/lib/dialog';
import { AppJoin, AppLogin, AppPending, AppSplash } from './AppGate';
import { registerAppSw } from '@/lib/push';

// 보호자 앱 틀 — 로그인·가입·승인 확인(문지기) + 위(아이·지점 고르기) + 아래 탭 4개.
// 데이터·권한은 홈페이지 마이페이지와 같다(같은 DB, 같은 함수).

interface AppCtx {
  /** 보는 지점 */
  branch: BranchKey;
  /** 이 지점의 아이 (마이페이지에서 고른 아이) */
  child: MyChild | null;
  /** 아이를 바꾸거나 다시 불러올 때마다 1씩 — 탭 화면이 이걸 보고 다시 불러온다 */
  version: number;
}
const Ctx = createContext<AppCtx>({ branch: 'eunpyeong', child: null, version: 0 });
export const useApp = () => useContext(Ctx);

const TABS = [
  { href: '/app', label: '홈', icon: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" /> },
  { href: '/app/book', label: '수업신청', icon: <><rect x="3" y="4.5" width="18" height="16.5" rx="2" /><line x1="3" y1="9.5" x2="21" y2="9.5" /><line x1="8" y1="2.5" x2="8" y2="6.5" /><line x1="16" y1="2.5" x2="16" y2="6.5" /><line x1="12" y1="12.5" x2="12" y2="18" /><line x1="9.25" y1="15.25" x2="14.75" y2="15.25" /></> },
  { href: '/app/pay', label: '결제', icon: <><rect x="2.5" y="5" width="19" height="14" rx="2" /><line x1="2.5" y1="10" x2="21.5" y2="10" /><line x1="6" y1="15" x2="10" y2="15" /></> },
  { href: '/app/more', label: '더보기', icon: <><line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" /></> },
];

const Chevron = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
);

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { userId, profile, loading, teacher, needsNickname, canUse, logout } = useMember();
  // 서비스워커(앱 푸시) — 앱을 열 때 등록
  useEffect(() => { registerAppSw(); }, []);

  // 아이가 이어진 지점 — 가입 승인이 없어도 그 지점 아이가 이어져 있으면 볼 수 있다 (마이페이지와 같은 규칙)
  const [linked, setLinked] = useState<BranchKey[] | null>(null);
  useEffect(() => {
    if (!userId || !profile) { setLinked(null); return; }
    getMyChildCenters().then(setLinked).catch(() => setLinked([]));
  }, [userId, profile]);
  const viewable = useCallback((b: BranchKey) => canUse(b) || !!linked?.includes(b), [canUse, linked]);
  const usable = BRANCHES.filter(b => viewable(b.key));

  const primary: BranchKey = profile?.center === 'uijeongbu' ? 'uijeongbu' : 'eunpyeong';
  const [sel, setSel] = useState<BranchKey | null>(null);
  const branch: BranchKey = sel && viewable(sel) ? sel : viewable(primary) ? primary : usable[0]?.key ?? primary;

  const [child, setChild] = useState<MyChild | null>(null);
  const [kids, setKids] = useState<MyKid[]>([]);
  const [version, setVersion] = useState(0);
  const ready = !!userId && !!profile && usable.length > 0;
  useEffect(() => {
    if (!ready) return;
    getMyChild(branch).then(setChild).catch(() => setChild(null));
    getMyChildren().then(setKids).catch(() => setKids([]));
  }, [ready, branch, version]);
  const kidsHere = kids.filter(k => k.center === branch);

  const pickKid = async (id: string) => {
    try { await setActiveChild(id); setVersion(v => v + 1); }
    catch (e) { showAlert(`아이를 바꾸지 못했어요.\n${(e as Error).message}`); }
  };

  // ── 문지기: 로그인 → 가입 → 승인 ──
  if (loading) return <AppSplash />;
  if (!userId) return <AppLogin />;
  if (teacher) return <AppPending teacherName={teacher.name} onLogout={logout} />;
  if (needsNickname) return <AppJoin />;
  if (!profile) return <AppSplash failed />;
  if (linked === null) return <AppSplash />;
  if (usable.length === 0) return <AppPending onLogout={logout} />;

  const selectCls = 'h-9 pl-3.5 pr-8 rounded-full text-[15px] appearance-none bg-no-repeat bg-[right_10px_center]';
  return (
    <Ctx.Provider value={{ branch, child, version }}>
      <div className="min-h-[100dvh] bg-[#F7F8FA] text-[#0a0a0a]">
        {/* 위 — 아이 이름(둘 이상이면 고르기) · 로고 · 지점(둘 이상이면 고르기) */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-[#ebebeb] pt-[env(safe-area-inset-top)]">
          <div className="max-w-[560px] mx-auto h-[60px] px-4 grid grid-cols-[1fr_auto_1fr] items-center">
            <div className="justify-self-start relative">
              {kidsHere.length > 1 ? (
                <label className="relative flex items-center">
                  <span className="sr-only">아이 고르기</span>
                  <select value={kidsHere.find(k => k.name === child?.childName)?.id ?? ''} onChange={e => pickKid(e.target.value)}
                    className={`${selectCls} border border-[#e5e5e5] bg-white`}>
                    {kidsHere.map(k => <option key={k.id} value={k.id}>{k.name}{k.number ?? ''}</option>)}
                  </select>
                  <span className="pointer-events-none absolute right-3 text-[#999]"><Chevron /></span>
                </label>
              ) : (
                <span className="text-[16px]">{child?.childName ?? profile.nickname}</span>
              )}
            </div>
            <Link href="/app" aria-label="홈"><img src="/logo-we-heart.png" alt="We 센터" className="w-10 h-10 object-contain" /></Link>
            <div className="justify-self-end">
              {usable.length > 1 ? (
                <label className="relative flex items-center">
                  <span className="sr-only">지점 고르기</span>
                  <select value={branch} onChange={e => setSel(e.target.value as BranchKey)}
                    className={`${selectCls} text-[14px] bg-[#EAF3FE] text-[var(--brand)]`}>
                    {usable.map(b => <option key={b.key} value={b.key}>{b.label.replace('점', '')}</option>)}
                  </select>
                  <span className="pointer-events-none absolute right-3 text-[var(--brand)]"><Chevron /></span>
                </label>
              ) : (
                <span className="h-9 px-3.5 inline-flex items-center rounded-full text-[14px] bg-[#EAF3FE] text-[var(--brand)]">{BRANCHES.find(b => b.key === branch)?.label.replace('점', '')}</span>
              )}
            </div>
          </div>
        </header>

        <main className="max-w-[560px] mx-auto px-4 pt-5 pb-[calc(96px+env(safe-area-inset-bottom))]">
          {children}
        </main>

        {/* 아래 탭 */}
        <nav className="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-[#ebebeb] pb-[env(safe-area-inset-bottom)]">
          <div className="max-w-[560px] mx-auto h-[64px] grid grid-cols-4">
            {TABS.map(t => {
              const on = t.href === '/app' ? pathname === '/app' : pathname.startsWith(t.href);
              return (
                <Link key={t.href} href={t.href} aria-current={on ? 'page' : undefined}
                  className={`flex flex-col items-center justify-center gap-1 text-[11px] ${on ? 'text-[var(--brand)]' : 'text-[#9a9aa2]'}`}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{t.icon}</svg>
                  {t.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </Ctx.Provider>
  );
}
