'use client';

import { useAdmin } from './AdminContext';
import { useMember } from './MemberContext';

// 맨 아래 — 저작권 + 보호자 카카오 로그인/로그아웃. (관리자 모드일 땐 로그인 줄을 숨긴다)

export default function Footer() {
  const { isAdmin } = useAdmin();
  const { userId, profile, loading, login, logout } = useMember();

  return (
    <footer className="border-t border-[#ebebeb] py-8 text-center text-[11px] text-[#aaa] tracking-widest">
      © {new Date().getFullYear()} WE 소아재활센터
      {!isAdmin && !loading && (
        <div className="mt-3">
          {userId ? (
            <span>
              {profile && <>{profile.nickname} 보호자님{!profile.approvedAt && ' · 센터 승인 대기 중'} · </>}
              <button onClick={logout} className="underline underline-offset-2 hover:text-[#555]">로그아웃</button>
            </span>
          ) : (
            <button onClick={login} className="underline underline-offset-2 hover:text-[#555]">보호자 카카오 로그인</button>
          )}
        </div>
      )}
    </footer>
  );
}
