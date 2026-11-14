import { redirect } from 'next/navigation';

// We슐랭은 글 화면이 따로 없다 — 목록으로
export default function Page() {
  redirect('/app/site/we-slang');
}
