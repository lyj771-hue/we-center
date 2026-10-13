'use client';

import TimetableView from '@/components/TimetableView';

// 시간표(테스트, 의정부) — 의정부 명단의 김유담 수업만 보이고 고칠 수 있다. 저장은 실제 디비에(마이페이지 의정부점까지 이어서 확인하려고).
export default function TimetableTestUijeongbuPage() {
  return <TimetableView testChildName="김유담" fixedCenter="uijeongbu" />;
}
