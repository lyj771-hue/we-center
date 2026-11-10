'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { savePostOrder } from '@/lib/store';
import { showAlert } from '@/lib/dialog';
import PhotoViewer from './PhotoViewer';
import Portal from './Portal';
import { Post } from '@/lib/types';
import { extractImages } from '@/lib/postText';
import { layoutPhotos, place } from './ThoughtsScrapbook';
import { addressLines } from './WeslangPhotos';

// 가운데 사진이 재활생각 카드보다 커서(680) 칸 높이·오른쪽 사진·메모 자리를 그만큼 옮긴다
// 가운데 사진 680 × 425 (가로 8 : 세로 5 — 예전 4:5의 세로 절반)
const STAGE_HEIGHT = 30 + 425 + 100;
const PHOTO_SHIFT = 70;
/** 사진 아래 크래프트지 메모와 사진 사이 (globals.css .weslang-memo margin-top) */
const MEMO_GAP = 14;

// We슐랭 — 재활생각 스크랩북 모양을 빌려 쓴다. 가게 하나가 한 줄(가운데 하나씩).
// 가운데 큰 사진 = 대표 사진(글쓰기에서 고른 것, 없으면 본문 첫 사진). 어느 사진을 눌러도 크게 — 옆으로 넘겨 이 글의 다른 사진도. 관리자는 메모의 [수정]으로 고친다, 오른쪽 작은 사진 = 나머지 사진(누르면 크게), 왼쪽 메모 = 가게 이름 · 위치(누르면 크게 — 크게 볼 때만 주소 복사).

function WeslangEntry({ post, isAdmin, onDelete, onEdit }: { post: Post; isAdmin: boolean; onDelete: (id: string) => void; onEdit?: (p: Post) => void }) {
  const [viewing, setViewing] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  // 한 줄 메모 높이 — 길면 여러 줄로 내려가니 그린 뒤 재서 칸을 그만큼 늘린다
  const memoRef = useRef<HTMLParagraphElement>(null);
  const [memoH, setMemoH] = useState(0);
  useLayoutEffect(() => {
    const el = memoRef.current;
    if (!el) { setMemoH(0); return; }
    const measure = () => setMemoH(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [post.memo]);
  const images = extractImages(post.content);
  // 대표 사진(글쓰기에서 고른 것, 없으면 본문 첫 사진) = 가운데 큰 사진, 나머지 = 오른쪽 작은 사진
  const main = post.imageUrl || images[0];
  const rest = images.filter(src => src !== main);
  const slots = layoutPhotos(rest.length).map(s => ({ ...s, x: s.x + PHOTO_SHIFT }));
  // 한 줄 메모 너비 — 오른쪽 작은 사진 끝까지(작은 사진이 없으면 대표 사진 너비). 휴대폰은 사진이 안쪽으로 모이니(--xk) 그만큼
  const edge = slots.reduce<typeof slots[number] | undefined>((a, s) => (!a || s.x + s.w > a.x + a.w ? s : a), undefined);
  const memoMax = edge && edge.x + edge.w > 340 ? `calc(340px + ${edge.x}px * var(--xk) + ${edge.w}px)` : undefined;
  const photosBottom = Math.max(0, ...slots.map(s => 30 + s.y + (s.w * s.ratio[1]) / s.ratio[0] + 60));
  // 한 줄 메모가 있으면 사진 아래 메모지 자리만큼 칸을 늘린다
  const height = Math.max(STAGE_HEIGHT + (post.memo ? MEMO_GAP + memoH : 0), photosBottom);

  return (
    // 높이 — PC(1/2 축소)·휴대폰(1/3 축소)
    <article className="scrap-frame scrap-lg h-[var(--h3)] md:h-[var(--h2)]" style={{ '--h2': `${height / 2}px`, '--h3': `${height / 3}px` } as React.CSSProperties}>
      <div className="scrap-stage" style={{ height: `${height}px` }}>
        {/* 가운데 — 대표 사진. 누르면 크게(옆으로 넘겨 다른 사진도) */}
        <button type="button" onClick={() => main && setViewing(main)} className="scrap-card block group w-full text-left cursor-zoom-in" aria-label={`${post.title} 사진 크게 보기`}>
          <div className="aspect-[8/5] bg-[#e4e4e7] overflow-hidden">
            {main
              ? <img src={main} alt={post.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
              : <div className="w-full h-full flex items-center justify-center text-[40px] text-[#a1a1aa]">{post.title}</div>}
          </div>
        </button>
        {/* 사진 아래 크래프트지 메모 — 사진 왼쪽 끝에서 글씨만큼 (오른쪽 작은 사진 끝까지, 넘으면 아래 줄로) */}
        {post.memo && <p ref={memoRef} className="weslang-memo" style={memoMax ? { maxWidth: memoMax } : undefined}>{post.memo}</p>}

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
        {/* 크게 보기 — 옆으로 넘겨 이 글의 다른 사진도 (대표 사진 먼저) */}
        {viewing && <PhotoViewer src={viewing} photos={[main, ...rest].filter(Boolean)} onClose={() => setViewing(null)} />}

        {/* 왼쪽 메모 — 가게 이름 · 위치 */}
        <div className="scrap-piece scrap-note cursor-zoom-in" style={place(-690, 275, -2, 587)}
          role="button" tabIndex={0} aria-label={`${post.title} 메모 크게 보기`}
          onClick={() => setNoteOpen(true)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setNoteOpen(true); } }}>
          <span aria-hidden="true" className="absolute -top-[28px] left-[56px] text-[38px] select-none">📌</span>
          <h2 className="scrap-note-title break-keep text-[var(--brand)] text-[31px] leading-[2.2]">{post.title}</h2>
          <div className="mt-3 flex items-center gap-4">
            {addressLines(post.location).length > 0 && <span className="scrap-note-loc text-[#52525b] text-[24px] break-keep">{addressLines(post.location).map((a, i) => <span key={i} className="block">📍 {a}</span>)}</span>}
          </div>
        </div>
      </div>
      {noteOpen && <Portal><NoteViewer title={post.title} location={post.location} onClose={() => setNoteOpen(false)} /></Portal>}
    </article>
  );
}

/** 메모 크게 보기 — 가게 이름 · 주소(도로명 · 지번, 적은 것만). 주소마다 복사 버튼(크게 볼 때만) */
function NoteViewer({ title, location, onClose }: { title: string; location?: string; onClose: () => void }) {
  const [copied, setCopied] = useState<number | null>(null);
  const lines = addressLines(location);
  const copy = async (i: number) => {
    const text = lines[i];
    if (!text) return;
    try { await navigator.clipboard.writeText(text); }
    catch {
      // 클립보드를 못 쓰는 브라우저 — 숨은 글 칸으로 복사
      const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); } finally { t.remove(); }
    }
    setCopied(i); setTimeout(() => setCopied(null), 1500);
  };
  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/40 px-5" onClick={onClose}>
      <div className="relative w-full max-w-[420px] rounded-md bg-[#f2f2f3] px-6 pt-8 pb-6 shadow-2xl -rotate-1" onClick={e => e.stopPropagation()}>
        <span aria-hidden="true" className="absolute -top-[16px] left-[28px] text-[26px] select-none">📌</span>
        <button type="button" onClick={onClose} aria-label="닫기" className="absolute top-2 right-3 text-[22px] leading-none text-[#999] hover:text-[#333]">×</button>
        <h2 className="break-keep text-[var(--brand)] text-[22px] leading-[1.7]">{title}</h2>
        {lines.map((line, i) => (
          <div key={i} className="mt-3 flex items-start gap-2 text-[16px] text-[#52525b]">
            <span className="break-keep leading-[1.7]">📍 {line}</span>
            <button type="button" onClick={() => copy(i)} aria-label="주소 복사" title="주소 복사"
              className="shrink-0 mt-0.5 inline-flex items-center gap-1 rounded-md border border-[#d4d4d8] bg-white px-2 py-1 text-[12px] text-[var(--brand)] hover:bg-[#fafafa]">
              <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              {copied === i ? '복사됨' : '복사'}
            </button>
          </div>
        ))}
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
export default function WeslangBoard({ posts, isAdmin, onDelete, onEdit }: { posts: Post[]; basePath: string; isAdmin: boolean; onDelete: (id: string) => void; onEdit?: (p: Post) => void }) {
  const [page, setPage] = useState(0);
  // 순서 — 처음엔 디비 순서, 관리자가 바꾸면 바로 저장하고 화면도 바로 바꾼다
  const [ids, setIds] = useState<string[]>([]);
  const [listPage, setListPage] = useState(0);   // 휴대폰 — 맨 아래 가게 목록의 쪽(3곳씩)
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
    setTimeout(() => document.getElementById(`weslang-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };
  const move = async (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= ordered.length) return;
    const next = ordered.map(p => p.id);
    [next[i], next[j]] = [next[j], next[i]];
    const prev = ids;
    setIds(next);
    setListPage(Math.floor(j / PER_PAGE));   // 휴대폰 목록 — 옮긴 가게가 있는 쪽으로
    setSaving(true);
    try { await savePostOrder(next); }
    catch (e) { setIds(prev); await showAlert(`순서를 저장하지 못했어요 — SQL(supabase/post-order.sql)을 실행했는지 확인해 주세요.\n${(e as Error).message}`); }
    finally { setSaving(false); }
  };
  // 가게 목록 — from ~ to 번째(PC는 전부, 휴대폰은 3곳씩)
  const listOf = (from: number, to: number) => (
    <ol className="space-y-0.5">
      {ordered.slice(from, to).map((p, k) => { const i = from + k; return (
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
      ); })}
    </ol>
  );
  const listPages = Math.max(1, Math.ceil(ordered.length / PER_PAGE));
  const lp = Math.min(listPage, listPages - 1);
  return (
    // 관리자 PC — 왼쪽 가게 목록과 같은 너비의 빈 칸을 오른쪽에도 둬서 게시글이 위 We슐랭 그림과 같은 가운데에 오게
    <div className={isAdmin ? 'md:grid md:grid-cols-[210px_minmax(0,1fr)_210px] md:items-start md:gap-6' : ''}>
      {/* 왼쪽 가게 목록 — 관리자 화면에서만. PC는 옆에 고정(휴대폰은 맨 아래) */}
      {isAdmin && (
      <aside className="hidden md:block w-[210px] sticky top-28 self-start rounded-xl bg-[#f6f6f7] p-3">
        <p className="px-2 pb-2 text-[11px] tracking-[0.15em] text-[#999]">가게 목록<span className="ml-1 tracking-normal text-[#bbb]">· ▲▼ 순서 바꾸기</span></p>
        {listOf(0, ordered.length)}
      </aside>
      )}
      <div className="min-w-0">
      <div className="flex flex-col items-center gap-y-16 md:gap-y-20">
        {shown.map(post => <div key={post.id} id={`weslang-${post.id}`} className="scroll-mt-28 w-full flex justify-center"><div className="relative"><WeslangEntry post={post} isAdmin={isAdmin} onDelete={onDelete} onEdit={onEdit} />
          {/* 관리자 — 게시물 오른쪽 [수정](같은 글쓰기 창으로) · [삭제] */}
          {isAdmin && (
            <div className="absolute right-0 top-2 z-10 flex flex-col gap-1.5 translate-x-[calc(100%+8px)] max-md:flex-row max-md:translate-x-0 max-md:-top-2">
              {onEdit && <button type="button" onClick={() => onEdit(post)} className="rounded-full border border-[#e5e5e5] bg-white px-3 py-1.5 text-[12px] text-[#555] shadow-sm hover:border-[var(--brand)] hover:text-[var(--brand)]">수정</button>}
              <button type="button" onClick={() => onDelete(post.id)} className="rounded-full border border-[#e5e5e5] bg-white px-3 py-1.5 text-[12px] text-red-400 shadow-sm hover:border-red-300 hover:bg-red-50">삭제</button>
            </div>
          )}
        </div></div>)}
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
      {/* 휴대폰 관리자 — 가게 목록은 맨 아래, 3곳씩 넘겨 보기 */}
      {isAdmin && (
        <div className="md:hidden mt-10 rounded-xl bg-[#f6f6f7] p-3">
          <p className="px-2 pb-2 text-[11px] tracking-[0.15em] text-[#999]">가게 목록 {ordered.length}곳<span className="ml-1 tracking-normal text-[#bbb]">· ▲▼ 순서 바꾸기</span></p>
          {listOf(lp * PER_PAGE, lp * PER_PAGE + PER_PAGE)}
          {listPages > 1 && (
            <div className="mt-2 flex items-center justify-center gap-1">
              <button type="button" onClick={() => setListPage(lp - 1)} disabled={lp === 0} aria-label="앞 목록"
                className="w-7 h-7 rounded-full border border-[#e5e5e5] bg-white text-[12px] text-[#555] disabled:opacity-30">‹</button>
              <span className="min-w-[48px] text-center text-[12px] text-[#666] tabular-nums">{lp + 1} / {listPages}</span>
              <button type="button" onClick={() => setListPage(lp + 1)} disabled={lp >= listPages - 1} aria-label="다음 목록"
                className="w-7 h-7 rounded-full border border-[#e5e5e5] bg-white text-[12px] text-[#555] disabled:opacity-30">›</button>
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
