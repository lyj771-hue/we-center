'use client';

import { useState } from 'react';
import MyPageView from '@/components/MyPageView';
import { useApp } from '@/components/app/AppShell';
import { useMyPay, useMyWeek } from '@/components/app/useMyData';
import { thisMonday, toYmd } from '@/lib/schedule';

// 보호자 앱(선생님) — 볼 수 있게 정해 둔 아이(예: 설영수 선생님 → 김유담)의 보호자 화면, 보기만.
// 데이터는 그 아이 보호자 기준으로 마이페이지 함수를 대신 부른다(supabase/teacher-view-child.sql, lib/viewAs.ts)

export default function AppChildView() {
  const { branch, child } = useApp();
  const [week, setWeek] = useState(thisMonday());
  const { lessons, failed: f1 } = useMyWeek(week);
  const { payments, ledger, history, failed: f2 } = useMyPay();
  if (!child) return <p className="py-16 text-center text-[13px] text-[#bbb]">불러오는 중…</p>;
  return (
    <MyPageView child={child} approved week={week} setWeek={setWeek} weekLessons={lessons} payments={payments}
      ledger={ledger} history={history} today={toYmd(new Date())} center={branch} failed={f1 || f2} />
  );
}
