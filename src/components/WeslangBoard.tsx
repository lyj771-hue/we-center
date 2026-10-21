'use client';

import Link from 'next/link';
import { useState } from 'react';
import PhotoViewer from './PhotoViewer';
import { Post } from '@/lib/types';
import { extractImages } from '@/lib/postText';
import { layoutPhotos, place } from './ThoughtsScrapbook';

// 가운데 사진이 재활생각 카드보다 커서(680) 칸 높이·오른쪽 사진·메모 자리를 그만큼 옮긴다
const STAGE_HEIGHT = 30 + 850 + 100;
const PHOTO_SHIFT = 70;

// We슐랭 — 재활생각 스크랩북 모양을 빌려 쓴다. 가게 하나가 한 줄(가운데 하나씩).
// 가운데 큰 사진 = 본문 첫 사진(누르면 게시글로), 오른쪽 작은 사진 = 나머지 사진(누르면 크게), 왼쪽 메모 = 가게 이름 · 위치.

function WeslangEntry({ post, basePath, isAdmin, onDelete }: { post: Post; basePath: string; isAdmin: boolean; onDelete: (id: string) => void }) {
  const [viewing, setViewing] = useState<string | null>(null);
  const images = extractImages(post.content);
  const main = post.imageUrl ?? images[0];
  const rest = (post.imageUrl ? images : images.slice(1));
  const slots = layoutPhotos(rest.length).map(s => ({ ...s, x: s.x + PHOTO_SHIFT }));
  const photosBottom = Math.max(0, ...slots.map(s => 30 + s.y + (s.w * s.ratio[1]) / s.ratio[0] + 60));
  const height = Math.max(STAGE_HEIGHT, photosBottom);

  return (
    // 높이 — PC(1/2 축소)·휴대폰(1/3 축소)
    <article className="scrap-frame scrap-lg h-[var(--h3)] md:h-[var(--h2)]" style={{ '--h2': `${height / 2}px`, '--h3': `${height / 3}px` } as React.CSSProperties}>
      <div className="scrap-stage" style={{ height: `${height}px` }}>
        {/* 가운데 — 대표 사진. 누르면 게시글로 */}
        <Link href={`${basePath}/${post.id}`} className="scrap-card block group" aria-label={`${post.title} 게시글 보기`}>
          <div className="aspect-[4/5] bg-[#e4e4e7] overflow-hidden">
            {main
              ? <img src={main} alt={post.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
              : <div className="w-full h-full flex items-center justify-center text-[40px] text-[#a1a1aa]">{post.title}</div>}
          </div>
        </Link>

        {/* 오른쪽 — 나머지 사진들 (누르면 크게) */}
        {rest.map((src, i) => {
          const s = slots[i];
          return (
            <figure key={`${src}-${i}`} className={`scrap-piece scrap-photo${s.behind ? ' behind' : ''}`} style={place(s.x, s.y, s.r, s.w)}>
              {s.clipped && (
                <span aria-hidden="true" className="absolute z-[1] -top-[30px] left-1/2 -translate-x-1/2 rotate-[12deg] text-[40px] leading-none select-none pointer-events-none">📎</span>
              )}
              <button type="button" onClick={() => setViewing(src)} aria-label="사진 크게 보기"
                className="block w-full bg-[#dcdcdf] rounded-[3px] overflow-hidden cursor-zoom-in" style={{ aspectRatio: `${s.ratio[0]} / ${s.ratio[1]}` }}>
                <img src={src} alt="" className="w-full h-full object-cover" />
              </button>
            </figure>
          );
        })}
        {viewing && <PhotoViewer src={viewing} onClose={() => setViewing(null)} />}

        {/* 왼쪽 메모 — 가게 이름 · 위치 */}
        <div className="scrap-piece scrap-note" style={place(-690, 700, -2, 587)}>
          <span aria-hidden="true" className="absolute -top-[28px] left-[56px] text-[38px] select-none">📌</span>
          <h2 className="scrap-note-title break-keep text-[var(--brand)] text-[31px] leading-[2.2]">{post.title}</h2>
          <div className="mt-3 flex items-center gap-4">
            {post.location && <span className="text-[#52525b] text-[24px] break-keep">📍 {post.location}</span>}
            {isAdmin && (
              <button type="button" onClick={() => onDelete(post.id)} className="ml-auto px-3 py-2 text-[33px] text-[#aaa] hover:text-red-400 transition-colors">삭제</button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

/** We슐랭 가게 글들 — 가운데에 하나씩, 새 글이 위로 */
export default function WeslangBoard({ posts, basePath, isAdmin, onDelete }: { posts: Post[]; basePath: string; isAdmin: boolean; onDelete: (id: string) => void }) {
  if (posts.length === 0) return <div className="py-24 text-center text-sm text-[#bbb] tracking-widest">등록된 가게가 없습니다</div>;
  return (
    <div className="flex flex-col items-center gap-y-16 md:gap-y-20">
      {posts.map(post => <WeslangEntry key={post.id} post={post} basePath={basePath} isAdmin={isAdmin} onDelete={onDelete} />)}
    </div>
  );
}
