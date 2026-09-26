'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Post } from '@/lib/types';
import { toParagraphs, extractImages } from '@/lib/postText';

// We재활생각 스크랩북 — rehab-thoughts.html 디자인. 재활생각 글 하나가 스크랩북 하나.
// 모눈종이 위 가운데 본문 카드(본문 + 더보기), 오른쪽에 본문 사진들, 압정 꽂힌 메모(제목·날짜).
// 좌표·크기는 원본 파일 단위로 적고, 전체는 CSS(.scrap-stage의 transform)로 1/3 축소한다.
// 사진은 본문에 들어 있는 사진 수만큼 흩뿌린다. 마우스를 올리면 살짝 커지며 앞으로 나오고,
// 클릭하면 화면 가운데에 크게 띄운다.

interface PhotoSlot {
  x: number; y: number; r: number; w: number;
  ratio: [number, number];
  clipped?: boolean;
  behind?: boolean;
}

// 3장까지는 원본 파일의 자리를 왼쪽으로 당긴 것 — 본문 쪽 사진은 카드(오른쪽 끝 270)에 살짝 걸친다
const BASE_SLOTS: PhotoSlot[] = [
  { x: 250, y: 50,  r: 6,  w: 200, ratio: [1, 1], clipped: true },
  { x: 400, y: 200, r: 2,  w: 200, ratio: [4, 3], behind: true },
  { x: 225, y: 210, r: -3, w: 170, ratio: [3, 4] },
];

// 4장부터는 오른쪽에 두 줄로 이어서 흩뿌린다 (안쪽 줄은 카드에 살짝 걸친다)
const EXTRA_TILTS = [-4, 3, -2, 5, -5, 2];
const EXTRA_RATIOS: [number, number][] = [[4, 3], [1, 1], [3, 4]];

function layoutPhotos(count: number): PhotoSlot[] {
  if (count <= BASE_SLOTS.length) return BASE_SLOTS.slice(0, count);
  return Array.from({ length: count }, (_, i) => ({
    x: i % 2 === 0 ? 235 : 420,
    y: 20 + Math.floor(i / 2) * 190 + (i % 2) * 40,
    r: EXTRA_TILTS[i % EXTRA_TILTS.length],
    w: 170,
    ratio: EXTRA_RATIOS[i % EXTRA_RATIOS.length],
    clipped: i === 0,
  }));
}

// 스크랩북 한 칸의 기본 높이(원본 단위): 위 여백 30 + 카드 675 + 아래 여백 100
const STAGE_HEIGHT = 805;

const place = (x: number, y: number, r: number, w: number) =>
  ({ '--x': `${x}px`, '--y': `${y}px`, '--r': `${r}deg`, '--w': `${w}px` }) as React.CSSProperties;

const fmt = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};

/** 사진 크게 보기 — 줌이 걸린 스크랩북 밖(body)에 띄운다. 바깥 클릭·✕·Esc로 닫는다 */
function PhotoViewer({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="사진 크게 보기"
      onClick={onClose}
      className="fixed inset-0 z-[400] flex items-center justify-center bg-black/70 p-6"
    >
      <img
        src={src}
        alt=""
        onClick={e => e.stopPropagation()}
        className="max-w-[90vw] max-h-[85vh] object-contain rounded-md bg-white shadow-2xl"
      />
      <button
        type="button"
        onClick={onClose}
        aria-label="닫기"
        className="absolute top-4 right-4 w-11 h-11 flex items-center justify-center text-white text-[22px] hover:opacity-70"
      >
        ✕
      </button>
    </div>,
    document.body
  );
}

interface EntryProps {
  post: Post;
  basePath: string;
  isAdmin: boolean;
  onDelete: (id: string) => void;
}

function ScrapbookEntry({ post, basePath, isAdmin, onDelete }: EntryProps) {
  const [viewing, setViewing] = useState<string | null>(null);

  const images = extractImages(post.content);
  const slots = layoutPhotos(images.length);
  // 사진이 많아 아래로 내려가면 그만큼 칸을 늘린다
  const photosBottom = Math.max(0, ...slots.map(s => 30 + s.y + (s.w * s.ratio[1]) / s.ratio[0] + 60));
  const height = Math.max(STAGE_HEIGHT, photosBottom);

  return (
    // 축소 전 높이는 stage에, 축소 후(1/3) 높이는 frame에 준다
    <article className="scrap-frame" style={{ height: `${height / 3}px` }}>
    <div className="scrap-stage" style={{ height: `${height}px` }}>
      {/* 가운데 본문 카드 — 왼쪽 아래는 메모가 살짝 덮고, 더보기는 메모가 닿지 않는 오른쪽 아래 */}
      <div className="scrap-card">
        <div className="aspect-[4/5] flex flex-col px-[48px] pt-[52px] pb-[40px]">
          <div className="scrap-body flex-1 min-h-0 break-keep text-[#27272a] text-[30px] leading-[1.9] space-y-[34px]">
            {toParagraphs(post.content).map((para, i) => <p key={i}>{para}</p>)}
          </div>
          <Link
            href={`${basePath}/${post.id}`}
            className="self-end mt-[40px] text-[28px] text-[var(--brand)] underline underline-offset-[6px] hover:decoration-2"
          >
            더보기
          </Link>
        </div>
      </div>

      {/* 오른쪽 — 본문에 들어 있는 사진들 */}
      {images.map((src, i) => {
        const s = slots[i];
        return (
          <figure
            key={`${src}-${i}`}
            className={`scrap-piece scrap-photo${s.behind ? ' behind' : ''}`}
            style={place(s.x, s.y, s.r, s.w)}
          >
            {s.clipped && (
              <span aria-hidden="true" className="absolute z-[1] -top-[30px] left-1/2 -translate-x-1/2 rotate-[12deg] text-[40px] leading-none select-none pointer-events-none">📎</span>
            )}
            <button
              type="button"
              onClick={() => setViewing(src)}
              aria-label="사진 크게 보기"
              className="block w-full bg-[#dcdcdf] rounded-[3px] overflow-hidden cursor-zoom-in"
              style={{ aspectRatio: `${s.ratio[0]} / ${s.ratio[1]}` }}
            >
              <img src={src} alt="" className="w-full h-full object-cover" />
            </button>
          </figure>
        );
      })}
      {viewing && <PhotoViewer src={viewing} onClose={() => setViewing(null)} />}

      {/* 왼쪽 메모 — 제목과 작성 날짜, 가로로 넓게. 본문 아래쪽을 살짝 가리고, 오른쪽 더보기 앞에서 끝난다 */}
      <div className="scrap-piece scrap-note" style={place(-690, 540, -2, 587)}>
        <span aria-hidden="true" className="absolute -top-[28px] left-[56px] text-[38px] select-none">📌</span>
        <h2 className="scrap-note-title break-keep text-[var(--brand)] text-[31px] leading-[2.2]">{post.title}</h2>
        <div className="mt-3 flex items-center gap-4">
          <span className="text-[#71717b] text-[16px]">{fmt(post.createdAt)}</span>
          {isAdmin && (
            <button
              type="button"
              onClick={() => onDelete(post.id)}
              className="ml-auto px-3 py-2 text-[33px] text-[#aaa] hover:text-red-400 transition-colors"
            >
              삭제
            </button>
          )}
        </div>
      </div>
    </div>
    </article>
  );
}

interface Props {
  posts: Post[];
  basePath: string;
  isAdmin: boolean;
  onDelete: (id: string) => void;
}

/** 재활생각 글들을 스크랩북으로 차례로 쌓는다 — 새 글을 쓰면 하나씩 늘어난다 */
export default function ThoughtsScrapbook({ posts, basePath, isAdmin, onDelete }: Props) {
  if (posts.length === 0) {
    return <div className="py-24 text-center text-sm text-[#bbb] tracking-widest">등록된 게시물이 없습니다</div>;
  }
  return (
    // 넓은 화면은 한 줄에 최대 2개(스크랩북 한 칸 ≈ 437px × 2 + 간격), 좁으면 한 줄에 하나
    <div className="max-w-[890px] mx-auto flex flex-wrap justify-center gap-x-4 gap-y-16 md:gap-y-20">
      {posts.map(post => (
        <ScrapbookEntry key={post.id} post={post} basePath={basePath} isAdmin={isAdmin} onDelete={onDelete} />
      ))}
    </div>
  );
}
