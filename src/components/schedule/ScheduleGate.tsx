'use client';

import { useAdmin } from '@/components/AdminContext';
import { OtherAccountLogin, useMember } from '@/components/MemberContext';

// 수업스케쥴은 관리자·선생님(두 지점 모두)과 승인된 보호자만 본다. 그 밖엔 로그인·승인 안내를 보여 준다.
// view 를 주면 '보기' 안내(We재활생각·공지사항·We당근당근·We슐랭 — 어느 지점이든 승인된 보호자면 본다).

const card = 'bg-white rounded-[18px] shadow-[0_2px_6px_rgba(0,0,0,0.05),0_10px_24px_rgba(0,0,0,0.05)] px-6 py-12 text-center space-y-4';

/** center 를 주면 그 지점에 가입·승인된 보호자만 (없으면 처음 가입한 지점 승인 기준) */
export default function ScheduleGate({ children, center, view }: { children: React.ReactNode; center?: 'eunpyeong' | 'uijeongbu'; /** 보기만 하는 메뉴 — 안내 문구가 '볼 수 있어요' */ view?: boolean }) {
  const { isAdmin } = useAdmin();
  const { userId, profile, loading, login, branches, canUse, teacher } = useMember();

  const approved = center ? canUse(center) : !!profile?.approvedAt || (view && (canUse('eunpyeong') || canUse('uijeongbu')));
  if (isAdmin || teacher || (userId && approved)) return <>{children}</>;
  const act = view ? '볼 수 있어요' : '수업을 신청할 수 있어요';
  const st = center ? branches.find(b => b.key === center)?.status : undefined;
  const branchName = center === 'uijeongbu' ? '의정부점' : '수색점';

  return (
    <div className={card}>
      {loading ? (
        <p className="text-[14px] text-[#aaa]">불러오는 중…</p>
      ) : !userId ? (
        <>
          <p className="text-[15px] leading-[var(--lh-prose)] text-[#555]">{view ? '이 메뉴는' : '수업 신청은'} 카카오 로그인 후<br />센터 승인을 받은 보호자만 {view ? '볼' : '할'} 수 있어요.</p>
          <button onClick={login} className="inline-flex items-center gap-2 bg-[#e11d48] text-white text-[15px] px-6 py-3 rounded-full hover:opacity-90">
            카카오 로그인/회원가입
          </button>
          <OtherAccountLogin />
        </>
      ) : !profile ? (
        <p className="text-[15px] text-[#555]">먼저 보호자 닉네임을 정해 주세요.</p>
      ) : st === 'none' ? (
        <p className="text-[15px] leading-[var(--lh-prose)] text-[#555]">{branchName}은 아직 가입하지 않았어요.<br />마이페이지 맨 아래에서 {branchName} 가입을 신청해 주세요.</p>
      ) : st === 'pending' ? (
        <p className="text-[15px] leading-[var(--lh-prose)] text-[#555]">{branchName} 가입 신청이 접수됐어요.<br />센터에서 승인하면 {act}.</p>
      ) : (
        <p className="text-[15px] leading-[var(--lh-prose)] text-[#555]">
          <span className="text-[var(--brand)]">{profile.nickname}</span> 보호자님, 가입 신청이 접수됐어요.<br />
          센터에서 승인하면 {act}.
        </p>
      )}
    </div>
  );
}
