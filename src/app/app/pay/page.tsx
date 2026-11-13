'use client';

import { useState } from 'react';
import MyPageView from '@/components/MyPageView';
import { useApp } from '@/components/app/AppShell';
import { useMyPay } from '@/components/app/useMyData';
import { thisMonday, toYmd } from '@/lib/schedule';

// 보호자 앱 — 결제 탭: 결제 현황 · 선결제 카드 · 결제별 사용 카드 (마이페이지와 같은 화면)

export default function AppPay() {
  const { branch, child } = useApp();
  const { payments, ledger, history, failed } = useMyPay();
  const [week, setWeek] = useState(thisMonday());
  return (
    <MyPageView only="pay" child={child} approved week={week} setWeek={setWeek} weekLessons={[]} payments={payments}
      ledger={ledger} history={history} today={toYmd(new Date())} center={branch} failed={failed} />
  );
}
