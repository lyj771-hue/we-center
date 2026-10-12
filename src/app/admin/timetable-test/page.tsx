'use client';

import TimetableView from '@/components/TimetableView';

// 시간표(테스트) — 김유담 수업만 보이고 고칠 수 있다. 저장은 실제 디비에(마이페이지까지 이어서 확인하려고).
export default function TimetableTestPage() {
  return <TimetableView testChildName="김유담" fixedCenter="eunpyeong" />;
}
