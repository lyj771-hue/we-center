'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Post } from '@/lib/types';
import { excerpt, extractImages, toText } from '@/lib/postText';
import { showAlert } from '@/lib/dialog';

// We당근당근 — 당근마켓 목록 모양. 왼쪽 네모 사진(본문 첫 사진) · 오른쪽 제목(두 줄) · 회색 한 줄(센터 · 언제) · 본문 앞부분.
// 거래완료 — 관리자 ⋮ → [거래완료로 표시]. 목록에선 사진 위 "거래완료"·제목 앞 회색 표시, 글에서도 제목 앞에.
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

/** 거래완료 — 글의 tags 에 'sold' */
export const isSold = (p: Post) => !!p.tags?.includes('sold');

export default function CarrotBoard({ posts, basePath, isAdmin, onDelete, onWrite, onToggleSold }: {
  posts: Post[]; basePath: string; isAdmin: boolean; onDelete: (id: string) => void; onWrite: () => void;
  /** 관리자 — 거래완료로 표시 / 거래 중으로 되돌리기 */
  onToggleSold?: (post: Post) => void;
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
            const sold = isSold(post);
            return (
              <li key={post.id} className="relative py-6 md:py-7">
                <Link href={`${basePath}/${post.id}`} className="flex gap-4 md:gap-5 group">
                  <div className="relative w-[110px] h-[110px] md:w-[140px] md:h-[140px] shrink-0 rounded-xl overflow-hidden bg-[#f2f2f2]">
                    {img
                      ? <img src={img} alt="" loading="lazy" className={`w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300 ${sold ? 'grayscale opacity-60' : ''}`} />
                      : <div className="w-full h-full flex items-center justify-center text-[30px]" aria-hidden="true">🥕</div>}
                    {/* 거래완료 — 사진 위에 */}
                    {sold && <span className="absolute inset-0 flex items-center justify-center bg-black/35 text-white text-[13px] md:text-[14px] font-semibold">거래완료</span>}
                  </div>
                  <div className="min-w-0 flex-1 pr-7 pt-0.5">
                    {/* 회색(센터 · 언제) → 제목 → 본문 */}
                    <p className="text-[11px] md:text-[12px] leading-[1.8] text-[#9ca3af]">We센터 · {ago(post.createdAt)}</p>
                    <p className={`mt-2.5 text-[13px] md:text-[15px] leading-[1.8] font-medium line-clamp-2 break-keep ${sold ? 'opacity-60' : ''}`} style={{ color: CARROT }}>
                      {sold && <span className="mr-1.5 align-middle text-[11px] px-1.5 py-0.5 rounded bg-[#e4e4e7] text-[#52525b] no-underline">거래완료</span>}{post.title}
                    </p>
                    {text && <p className="mt-2.5 text-[11px] md:text-[12px] leading-[2] text-[#52525b] line-clamp-2">{text}</p>}
                  </div>
                </Link>
                {isAdmin && (
                  <div className="absolute right-0 top-6 md:top-7">
                    <button type="button" aria-label="더보기" onClick={() => setMenu(m => (m === post.id ? null : post.id))}
                      className="w-7 h-7 flex items-center justify-center text-[#9ca3af] hover:text-[#18181b] text-[18px] leading-none">⋮</button>
                    {menu === post.id && (
                      <div className="absolute right-0 mt-1 z-10 bg-white border border-[#e5e5e5] rounded-lg shadow-lg py-1 min-w-[120px]">
                        {onToggleSold && (
                          <button type="button" onClick={() => { setMenu(null); onToggleSold(post); }}
                            className="w-full px-4 py-2 text-left text-[13px] text-[#333] hover:bg-[#fafafa] whitespace-nowrap">{sold ? '거래 중으로 되돌리기' : '거래완료로 표시'}</button>
                        )}
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

      {/* 화면 오른쪽 아래에 떠 있는 버튼 — 목록을 내리는 동안 따라오다가, 쪽 넘기기 버튼 바로 위(없으면 목록 끝)에서 멈춘다(sticky) */}
      <div className={`sticky z-[150] flex justify-end pointer-events-none mt-4`}
        style={{ bottom: 'calc(84px + env(safe-area-inset-bottom, 0px))' }}>
        <span className="pointer-events-auto">{writeBtn('px-3 py-1.5 text-[12px]')}</span>
      </div>

      {/* 쪽 넘기기 — 한 쪽에 3개 */}
      {pages > 1 && (
        <nav aria-label="쪽 넘기기" className="mt-4 flex items-center justify-center gap-1">
          <button type="button" onClick={() => go(cur - 1)} disabled={cur === 0} aria-label="앞 쪽"
            className="w-7 h-7 rounded-full border border-[#e5e5e5] text-[12px] text-[#555] disabled:opacity-30">‹</button>
          {Array.from({ length: pages }, (_, i) => (
            <button key={i} type="button" onClick={() => go(i)} aria-current={i === cur ? 'page' : undefined}
              className={`w-7 h-7 rounded-full text-[12px] tabular-nums ${i === cur ? 'text-white font-semibold' : 'text-[#555] hover:bg-[#f4f4f5]'}`}
              style={i === cur ? { background: CARROT } : undefined}>{i + 1}</button>
          ))}
          <button type="button" onClick={() => go(cur + 1)} disabled={cur === pages - 1} aria-label="다음 쪽"
            className="w-7 h-7 rounded-full border border-[#e5e5e5] text-[12px] text-[#555] disabled:opacity-30">›</button>
        </nav>
      )}
    </div>
  );
}
