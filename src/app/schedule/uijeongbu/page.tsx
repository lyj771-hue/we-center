'use client';

import ScheduleListView from '@/components/schedule/ScheduleListView';

// 수업스케쥴(의정부) — /schedule/[id] 보다 이 고정 주소가 먼저 잡힌다
export default function ScheduleUijeongbuPage() {
  return <ScheduleListView center="uijeongbu" />;
}
