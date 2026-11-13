'use client';

import { useCallback, useEffect, useState } from 'react';
import type { MyLedgers } from '@/lib/prepaid';
import { getMyLedger, NO_LEDGERS } from '@/lib/prepaid';
import type { MyLesson, MyPayment, MyPaymentUse } from '@/lib/mypage';
import { getMyLessons, getMyPaymentHistory, getMyPayments } from '@/lib/mypage';
import { addDays } from '@/lib/schedule';
import { useApp } from './AppShell';

// 보호자 앱 탭 화면 데이터 — 마이페이지(app/mypage/page.tsx)와 같은 함수로 불러온다.
// 'week' = 그 주 수업, 'pay' = 결제 현황·선결제 카드·결제별 사용 기록. 보는 지점 것만 남긴다.

export function useMyWeek(week: string) {
  const { branch, version } = useApp();
  const [lessons, setLessons] = useState<MyLesson[]>([]);
  const [failed, setFailed] = useState('');
  const load = useCallback(async () => {
    try { setLessons((await getMyLessons(week, addDays(week, 5))).filter(l => l.center === branch)); setFailed(''); }
    catch (e) { setFailed((e as Error).message); }
  }, [week, branch]);
  useEffect(() => { load(); }, [load, version]);
  return { lessons, failed, reload: load };
}

export function useMyPay() {
  const { branch, version } = useApp();
  const [payments, setPayments] = useState<MyPayment[]>([]);
  const [ledger, setLedger] = useState<MyLedgers>(NO_LEDGERS);
  const [history, setHistory] = useState<MyPaymentUse[]>([]);
  const [failed, setFailed] = useState('');
  const load = useCallback(async () => {
    try {
      setPayments(await getMyPayments(branch)); setFailed('');
      setLedger(await getMyLedger(branch).catch(() => NO_LEDGERS));
      setHistory((await getMyPaymentHistory().catch(() => [])).filter(h => h.center === branch));
    } catch (e) { setFailed((e as Error).message); }
  }, [branch]);
  useEffect(() => { load(); }, [load, version]);
  return { payments, ledger, history, failed, reload: load };
}
