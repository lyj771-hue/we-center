'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { savePostOrder } from '@/lib/store';
import { showAlert } from '@/lib/dialog';
import PhotoViewer from './PhotoViewer';
import Portal from './Portal';
import { Post } from '@/lib/types';
import { extractImages } from '@/lib/postText';
import { layoutPhotos, place } from './ThoughtsScrapbook';

// 가운데 사진이 재활생각 카드보다 커서(680) 칸 높이·오른쪽 사진·메모 자리를 그만큼 옮긴다
// 가운데 사진 680 × 425 (가로 8 : 세로 5 — 예전 4:5의 세로 절반)
const STAGE_HEIGHT = 30 + 425 + 100;
const PHOTO_SHIFT = 70;

// We슐랭 — 재활생각 스크랩북 모양을 빌려 쓴다. 가게 하나가 한 줄(가운데 하나씩).
// 가운데 큰 사진 = 본문 첫 사진(누르면 게시글로), 오른쪽 작은 사진 = 나머지 사진(누르면 크게), 왼쪽 메모 = 가게 이름 · 위치(누르면 크게 — 크게 볼 때만 주소 복사).

function WeslangEntry({ post, basePath, isAdmin, onDelete }: { post: Post; basePath: string; isAdmin: boolean; onDelete: (id: string) => void }) {
  const [viewing, setViewing] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
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
          <div className="aspect-[8/5] bg-[#e4e4e7] overflow-hidden">
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
        <div className="scrap-piece scrap-note cursor-zoom-in" style={place(-690, 275, -2, 587)}
          role="button" tabIndex={0} aria-label={`${post.title} 메모 크게 보기`}
          onClick={() => setNoteOpen(true)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setNoteOpen(true); } }}>
          <span aria-hidden="true" className="absolute -top-[28px] left-[56px] text-[38px] select-none">📌</span>
          <h2 className="scrap-note-title break-keep text-[var(--brand)] text-[31px] leading-[2.2]">{post.title}</h2>
          <div className="mt-3 flex items-center gap-4">
            {post.location && <span className="scrap-note-loc text-[#52525b] text-[24px] break-keep">📍 {post.location}</span>}
            {isAdmin && (
              <button type="button" onClick={e => { e.stopPropagation(); onDelete(post.id); }} className="ml-auto px-3 py-2 text-[33px] text-[#aaa] hover:text-red-400 transition-colors">삭제</button>
            )}
          </div>
        </div>
      </div>
      {noteOpen && <Portal><NoteViewer title={post.title} location={post.location} onClose={() => setNoteOpen(false)} /></Portal>}
    </article>
  );
}

/** 메모 크게 보기 — 가게 이름 · 위치. 위치 옆 복사 아이콘(크게 볼 때만) */
function NoteViewer({ title, location, onClose }: { title: string; location?: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!location) return;
    try { await navigator.clipboard.writeText(location); }
    catch {
      // 클립보드를 못 쓰는 브라우저 — 숨은 글 칸으로 복사
      const t = document.createElement('textarea'); t.value = location; document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); } finally { t.remove(); }
    }
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/40 px-5" onClick={onClose}>
      <div className="relative w-full max-w-[420px] rounded-md bg-[#f2f2f3] px-6 pt-8 pb-6 shadow-2xl -rotate-1" onClick={e => e.stopPropagation()}>
        <span aria-hidden="true" className="absolute -top-[16px] left-[28px] text-[26px] select-none">📌</span>
        <button type="button" onClick={onClose} aria-label="닫기" className="absolute top-2 right-3 text-[22px] leading-none text-[#999] hover:text-[#333]">×</button>
        <h2 className="break-keep text-[var(--brand)] text-[22px] leading-[1.7]">{title}</h2>
        {location && (
          <div className="mt-3 flex items-start gap-2 text-[16px] text-[#52525b]">
            <span className="break-keep leading-[1.7]">📍 {location}</span>
            <button type="button" onClick={copy} aria-label="주소 복사" title="주소 복사"
              className="shrink-0 mt-0.5 inline-flex items-center gap-1 rounded-md border border-[#d4d4d8] bg-white px-2 py-1 text-[12px] text-[var(--brand)] hover:bg-[#fafafa]">
              <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              {copied ? '복사됨' : '복사'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** 한 쪽에 보이는 가게 수 */
const PER_PAGE = 3;

/** 보이는 순서 — 관리자가 정한 순서(작을수록 위). 아직 순서가 없는 새 글은 맨 위에 새 글부터 */
const sortPosts = (posts: Post[]) => [...posts].sort((a, b) =>
  (a.order === undefined) !== (b.order === undefined) ? (a.order === undefined ? -1 : 1)
    : a.order !== undefined && b.order !== undefined ? a.order - b.order
    : b.createdAt.localeCompare(a.createdAt));

/** We슐랭 가게 글들 — 왼쪽 가게 목록(누르면 그 가게로, 관리자는 ▲▼로 순서 바꾸기) + 가운데에 하나씩 */
export default function WeslangBoard({ posts, basePath, isAdmin, onDelete }: { posts: Post[]; basePath: string; isAdmin: boolean; onDelete: (id: string) => void }) {
  const [page, setPage] = useState(0);
  // 순서 — 처음엔 디비 순서, 관리자가 바꾸면 바로 저장하고 화면도 바로 바꾼다
  const [ids, setIds] = useState<string[]>([]);
  const [listOpen, setListOpen] = useState(false);   // 휴대폰 — 목록 펼치기
  const [saving, setSaving] = useState(false);
  useEffect(() => { setIds(sortPosts(posts).map(p => p.id)); }, [posts]);
  if (posts.length === 0) return <div className="py-24 text-center text-sm text-[#bbb] tracking-widest">등록된 가게가 없습니다</div>;
  const ordered = ids.map(id => posts.find(p => p.id === id)).filter((p): p is Post => !!p);
  const pages = Math.ceil(ordered.length / PER_PAGE);
  const cur = Math.min(page, pages - 1);
  const shown = ordered.slice(cur * PER_PAGE, cur * PER_PAGE + PER_PAGE);
  const go = (p: number) => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  // 목록에서 가게를 누르면 — 그 쪽으로 넘기고 그 가게로 스크롤
  const jump = (id: string) => {
    const i = ordered.findIndex(p => p.id === id);
    setPage(Math.floor(i / PER_PAGE));
    setListOpen(false);
    setTimeout(() => document.getElementById(`weslang-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };
  const move = async (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= ordered.length) return;
    const next = ordered.map(p => p.id);
    [next[i], next[j]] = [next[j], next[i]];
    const prev = ids;
    setIds(next);
    setSaving(true);
    try { await savePostOrder(next); }
    catch (e) { setIds(prev); await showAlert(`순서를 저장하지 못했어요 — SQL(supabase/post-order.sql)을 실행했는지 확인해 주세요.\n${(e as Error).message}`); }
    finally { setSaving(false); }
  };
  const list = (
    <ol className="space-y-0.5">
      {ordered.map((p, i) => (
        <li key={p.id} className={`group flex items-center gap-1 rounded-md px-2 py-1.5 text-[13px] ${shown.some(s => s.id === p.id) ? 'bg-white/80' : ''}`}>
          <span className="w-5 shrink-0 text-[11px] text-[#bbb] tabular-nums">{i + 1}</span>
          <button type="button" onClick={() => jump(p.id)} className="flex-1 min-w-0 text-left truncate text-[#333] hover:text-[var(--brand)]">{p.title}</button>
          {isAdmin && (
            <span className="shrink-0 flex">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0 || saving} aria-label={`${p.title} 위로`}
                className="w-6 h-6 text-[11px] text-[#888] hover:text-[var(--brand)] disabled:opacity-25">▲</button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === ordered.length - 1 || saving} aria-label={`${p.title} 아래로`}
                className="w-6 h-6 text-[11px] text-[#888] hover:text-[var(--brand)] disabled:opacity-25">▼</button>
            </span>
          )}
        </li>
      ))}
    </ol>
  );
  return (
    <div className="md:flex md:items-start md:gap-6">
      {/* 왼쪽 가게 목록 — PC는 옆에 고정, 휴대폰은 위에 [목록]으로 펼치기 */}
      <aside className="hidden md:block w-[210px] shrink-0 sticky top-28 self-start rounded-xl bg-[#f6f6f7] p-3">
        <p className="px-2 pb-2 text-[11px] tracking-[0.15em] text-[#999]">가게 목록{isAdmin && <span className="ml-1 tracking-normal text-[#bbb]">· ▲▼ 순서 바꾸기</span>}</p>
        {list}
      </aside>
      <div className="md:hidden mb-6">
        <button type="button" onClick={() => setListOpen(o => !o)} className="w-full rounded-xl bg-[#f6f6f7] px-4 py-2.5 text-left text-[13px] text-[#555]">
          가게 목록 {ordered.length}곳 <span className="float-right text-[#999]">{listOpen ? '▲' : '▼'}</span>
        </button>
        {listOpen && <div className="mt-1 rounded-xl bg-[#f6f6f7] p-2">{list}</div>}
      </div>
      <div className="flex-1 min-w-0">
      <div className="flex flex-col items-center gap-y-16 md:gap-y-20">
        {shown.map(post => <div key={post.id} id={`weslang-${post.id}`} className="scroll-mt-28 w-full flex justify-center"><WeslangEntry post={post} basePath={basePath} isAdmin={isAdmin} onDelete={onDelete} /></div>)}
      </div>
      {/* 쪽 넘기기 — 한 쪽에 3개 */}
      {pages > 1 && (
        <nav aria-label="쪽 넘기기" className="mt-10 flex items-center justify-center gap-1">
          <button type="button" onClick={() => go(cur - 1)} disabled={cur === 0} aria-label="앞 쪽"
            className="w-7 h-7 rounded-full border border-[#e5e5e5] bg-white text-[12px] text-[#555] disabled:opacity-30">‹</button>
          {Array.from({ length: pages }, (_, i) => (
            <button key={i} type="button" onClick={() => go(i)} aria-current={i === cur ? 'page' : undefined}
              className={`w-7 h-7 rounded-full text-[12px] tabular-nums ${i === cur ? 'bg-[var(--brand)] text-white font-semibold' : 'text-[#555] hover:bg-[#f4f4f5]'}`}>{i + 1}</button>
          ))}
          <button type="button" onClick={() => go(cur + 1)} disabled={cur === pages - 1} aria-label="다음 쪽"
            className="w-7 h-7 rounded-full border border-[#e5e5e5] bg-white text-[12px] text-[#555] disabled:opacity-30">›</button>
        </nav>
      )}
      </div>
    </div>
  );
}
