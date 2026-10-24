'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Post } from '@/lib/types';
import { excerpt, extractImages, toText } from '@/lib/postText';

// We당근당근 — 당근마켓 목록 모양. 왼쪽 네모 사진(본문 첫 사진) · 오른쪽 제목(두 줄) · 회색 한 줄(센터 · 언제) · 본문 앞부분.
// 관리자: 오른쪽 위 ⋮ → 삭제, 주황 [+ 센터에게] = 새 글 (휴대폰에선 오른쪽 아래에 떠 있다)

const CARROT = '#ff6f0f';

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
  const writeBtn = (cls: string) => (
    <button type="button" onClick={onWrite} style={{ background: CARROT }}
      className={`inline-flex items-center gap-1.5 rounded-full text-white font-semibold shadow-[0_6px_16px_rgba(255,111,15,0.35)] hover:brightness-95 transition ${cls}`}>
      <span aria-hidden="true" className="text-[1.25em] leading-none">+</span> 센터에게
    </button>
  );

  return (
    <div>
      {/* PC — 목록 위 오른쪽 */}
      {isAdmin && <div className="hidden md:flex justify-end mb-4">{writeBtn('px-6 py-3 text-[15px]')}</div>}

      {posts.length === 0 ? (
        <div className="py-24 text-center text-sm text-[#ccc] tracking-widest">등록된 게시물이 없습니다</div>
      ) : (
        <ul className="divide-y divide-[#eee]">
          {posts.map(post => {
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
                    <p className="text-[16px] md:text-[18px] leading-[1.4] text-[#18181b] font-medium line-clamp-2 break-keep">{post.title}</p>
                    <p className="mt-1 text-[13px] text-[#9ca3af]">We센터 · {ago(post.createdAt)}</p>
                    {text && <p className="mt-1.5 text-[13px] md:text-[14px] text-[#52525b] line-clamp-2">{text}</p>}
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

      {/* 휴대폰 — 오른쪽 아래에 떠 있는 버튼 */}
      {isAdmin && (
        <div className="md:hidden fixed right-4 z-[150]" style={{ bottom: 'calc(20px + env(safe-area-inset-bottom, 0px))' }}>
          {writeBtn('px-6 py-3.5 text-[17px]')}
        </div>
      )}
    </div>
  );
}
