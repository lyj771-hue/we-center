'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Post } from '@/lib/types';
import { excerpt, extractImages, toText } from '@/lib/postText';
import { showAlert } from '@/lib/dialog';
import Portal from './Portal';

// We당근당근 — 당근마켓 목록 모양. 왼쪽 네모 사진(본문 첫 사진) · 오른쪽 제목(두 줄) · 회색 한 줄(센터 · 언제) · 본문 앞부분.
// 주황 [+ 센터에게] — 누구나 보인다(휴대폰에선 오른쪽 아래에 떠 있다). 관리자는 새 글, 그 밖엔 "올리는건 저희가 해요^^" 팝업. 관리자: 오른쪽 위 ⋮ → 삭제

const CARROT = '#ff6f0f';
/** 한 쪽에 보이는 글 수 */
const PER_PAGE = 3;

/** "방금 전 · 3시간 전 · 1일 전 · 2026.10.24" */
function ago(iso: string) {
  const d = new Date(iso);
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (min < 1) return '방금 전';
  if (min < 60) return `${min}분 전`;
  if (min < 60 * 24) return `${Math.floor(min / 60)}시간 전`;
  if (min < 60 * 24 * 30) return `${Math.floor(min / 60 / 24)}일 전`;
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export default function CarrotBoard({ posts, basePath, isAdmin, onDelete, onWrite }: {
  posts: Post[]; basePath: string; isAdmin: boolean; onDelete: (id: string) => void; onWrite: () => void;
}) {
  const [menu, setMenu] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(posts.length / PER_PAGE));
  const cur = Math.min(page, pages - 1);
  const shown = posts.slice(cur * PER_PAGE, cur * PER_PAGE + PER_PAGE);
  const go = (p: number) => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const writeBtn = (cls: string) => (
    <button type="button" onClick={() => (isAdmin ? onWrite() : showAlert('올리는건 저희가 해요^^'))} style={{ background: CARROT }}
      className={`inline-flex items-center gap-1 rounded-full text-white font-semibold shadow-[0_3px_8px_rgba(255,111,15,0.35)] hover:brightness-95 transition ${cls}`}>
      <span aria-hidden="true" className="text-[1.2em] leading-none">+</span>센터에게
    </button>
  );

  return (
    <div>
      {posts.length === 0 ? (
        <div className="py-24 text-center text-sm text-[#ccc] tracking-widest">등록된 게시물이 없습니다</div>
      ) : (
        <ul className="divide-y divide-[#eee]">
          {shown.map(post => {
            const img = post.imageUrl ?? extractImages(post.content)[0];
            const text = excerpt(toText(post.content), 60);
            return (
              <li key={post.id} className="relative py-4 md:py-5">
                <Link href={`${basePath}/${post.id}`} className="flex gap-4 md:gap-5 group">
                  <div className="w-[110px] h-[110px] md:w-[140px] md:h-[140px] shrink-0 rounded-xl overflow-hidden bg-[#f2f2f2]">
                    {img
                      ? <img src={img} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300" />
                      : <div className="w-full h-full flex items-center justify-center text-[30px]" aria-hidden="true">🥕</div>}
                  </div>
                  <div className="min-w-0 flex-1 pr-7 pt-0.5">
                    {/* 회색(센터 · 언제) → 제목 → 본문 */}
                    <p className="text-[11px] md:text-[12px] text-[#9ca3af]">We센터 · {ago(post.createdAt)}</p>
                    <p className="mt-0.5 text-[13px] md:text-[15px] leading-[1.4] text-[#18181b] font-medium line-clamp-2 break-keep">{post.title}</p>
                    {text && <p className="mt-1 text-[11px] md:text-[12px] text-[#52525b] line-clamp-2">{text}</p>}
                  </div>
                </Link>
                {isAdmin && (
                  <div className="absolute right-0 top-4 md:top-5">
                    <button type="button" aria-label="더보기" onClick={() => setMenu(m => (m === post.id ? null : post.id))}
                      className="w-7 h-7 flex items-center justify-center text-[#9ca3af] hover:text-[#18181b] text-[18px] leading-none">⋮</button>
                    {menu === post.id && (
                      <div className="absolute right-0 mt-1 z-10 bg-white border border-[#e5e5e5] rounded-lg shadow-lg py-1 min-w-[80px]">
                        <button type="button" onClick={() => { setMenu(null); onDelete(post.id); }}
                          className="w-full px-4 py-2 text-left text-[13px] text-red-500 hover:bg-[#fafafa]">삭제</button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* 쪽 넘기기 — 한 쪽에 3개 */}
      {pages > 1 && (
        <nav aria-label="쪽 넘기기" className="mt-6 flex items-center justify-center gap-1.5">
          <button type="button" onClick={() => go(cur - 1)} disabled={cur === 0} aria-label="앞 쪽"
            className="w-9 h-9 rounded-full border border-[#e5e5e5] text-[#555] disabled:opacity-30">‹</button>
          {Array.from({ length: pages }, (_, i) => (
            <button key={i} type="button" onClick={() => go(i)} aria-current={i === cur ? 'page' : undefined}
              className={`w-9 h-9 rounded-full text-[14px] tabular-nums ${i === cur ? 'text-white font-semibold' : 'text-[#555] hover:bg-[#f4f4f5]'}`}
              style={i === cur ? { background: CARROT } : undefined}>{i + 1}</button>
          ))}
          <button type="button" onClick={() => go(cur + 1)} disabled={cur === pages - 1} aria-label="다음 쪽"
            className="w-9 h-9 rounded-full border border-[#e5e5e5] text-[#555] disabled:opacity-30">›</button>
        </nav>
      )}

      {/* 화면 오른쪽 아래에 떠 있는 버튼 — 폰·PC 모두. 페이지의 fade-up(transform) 밖(body)에 그려야 화면 기준으로 고정된다 */}
      <Portal>
        <div className="fixed right-4 md:right-8 z-[150]" style={{ bottom: 'calc(20px + env(safe-area-inset-bottom, 0px))' }}>
          {writeBtn('px-3 py-1.5 text-[12px]')}
        </div>
      </Portal>
      <div className="h-20" aria-hidden="true" />{/* 마지막 글이 버튼에 가리지 않게 */}
    </div>
  );
}
