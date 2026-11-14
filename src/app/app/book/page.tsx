import { redirect } from 'next/navigation';

// 수업 신청 목록은 [수업] 탭(/app/class)으로 합쳤다 — 예전 주소로 오면 그리로
export default function AppBookRedirect() {
  redirect('/app/class');
}
