import { redirect } from 'next/navigation';

// We슐랭은 게시글 화면이 따로 없다 — 목록에서 사진을 크게 보고, 관리자는 목록의 [수정]으로 고친다. 예전 주소로 오면 목록으로
export default function WeSlangDetailPage() {
  redirect('/we-slang');
}
