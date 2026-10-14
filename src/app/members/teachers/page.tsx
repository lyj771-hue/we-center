'use client';

import { useAdmin } from '@/components/AdminContext';
import TeachersTab from '@/components/TeachersTab';

// 회원관리(선생님) — 두 센터 선생님의 휴대전화 번호·회원 코드·카카오 인증. 화면은 components/TeachersTab.tsx
export default function MembersTeachersPage() {
  const { isAdmin } = useAdmin();
  if (!isAdmin) return <p className="text-center text-[14px] text-[#aaa] py-32">관리자만 볼 수 있는 화면이에요.</p>;
  return (
    <div className="px-5 md:px-8 pt-8 pb-14 md:pt-14 fade-up">
      <h1 className="display-heading mb-5">회원 관리 <span className="text-[0.7em] text-[#888]">(선생님)</span></h1>
      <TeachersTab />
    </div>
  );
}
