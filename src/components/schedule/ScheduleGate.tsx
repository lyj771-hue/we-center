'use client';

import { useAdmin } from '@/components/AdminContext';
import { useMember } from '@/components/MemberContext';

// 수업스케쥴은 관리자와 승인된 보호자만 본다. 그 밖엔 로그인·승인 안내를 보여 준다.

const card = 'bg-white rounded-[18px] shadow-[0_2px_6px_rgba(0,0,0,0.05),0_10px_24px_rgba(0,0,0,0.05)] px-6 py-12 text-center space-y-4';

export default function ScheduleGate({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAdmin();
  const { userId, profile, loading, login } = useMember();

  if (isAdmin || (userId && profile?.approvedAt)) return <>{children}</>;

  return (
    <div className={card}>
      {loading ? (
        <p className="text-[14px] text-[#aaa]">불러오는 중…</p>
      ) : !userId ? (
        <>
          <p className="text-[15px] leading-[2] text-[#555]">수업 신청은 카카오 로그인 후<br />센터 승인을 받은 보호자만 할 수 있어요.</p>
          <button onClick={login} className="inline-flex items-center gap-2 bg-[#e11d48] text-white text-[15px] px-6 py-3 rounded-full hover:opacity-90">
            카카오 로그인/회원가입
          </button>
        </>
      ) : !profile ? (
        <p className="text-[15px] text-[#555]">먼저 보호자 닉네임을 정해 주세요.</p>
      ) : (
        <p className="text-[15px] leading-[2] text-[#555]">
          <span className="text-[var(--brand)]">{profile.nickname}</span> 보호자님, 가입 신청이 접수됐어요.<br />
          센터에서 승인하면 수업을 신청할 수 있어요.
        </p>
      )}
    </div>
  );
}
