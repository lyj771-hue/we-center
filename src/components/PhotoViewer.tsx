'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// 사진 크게 보기 — 화면 가운데 팝업. 바깥·✕·Esc로 닫는다. (We재활생각 사진, We슐랭 사진, 오시는길 지도)
// pan: 휴대폰에서 가로로 긴 사진(지도)을 화면 높이에 맞춰 크게 띄우고 좌우로 밀어 보게 한다. 처음엔 가운데를 보여준다.
// photos: 같은 글의 사진들 — 주면 옆으로 밀어(휴대폰)·‹ ›·←→ 키로 다른 사진을 본다. 아래에 '2 / 5'
export default function PhotoViewer({ src, onClose, pan = false, photos }: { src: string; onClose: () => void; pan?: boolean; photos?: string[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const centerScroll = () => {
    const el = scroller.current;
    if (el) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  };
  const list = photos && photos.length > 1 ? photos : null;
  const [index, setIndex] = useState(() => Math.max(0, list?.indexOf(src) ?? 0));
  const track = useRef<HTMLDivElement>(null);
  const go = (i: number) => {
    const el = track.current;
    if (!el || !list) return;
    const n = Math.max(0, Math.min(list.length - 1, i));
    el.scrollTo({ left: n * el.clientWidth, behavior: 'smooth' });
  };
  // 처음엔 누른 사진으로
  useEffect(() => {
    const el = track.current;
    if (el && list) el.scrollLeft = index * el.clientWidth;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (list && e.key === 'ArrowRight') go(index + 1);
      if (list && e.key === 'ArrowLeft') go(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const arrow = 'absolute top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-full bg-black/40 text-white text-[26px] hover:bg-black/60 disabled:opacity-0 max-md:hidden';

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="사진 크게 보기"
      onClick={onClose}
      className="fixed inset-0 z-[400] flex items-center justify-center bg-black/70 p-6 max-md:px-0"
    >
      {list ? (
        <>
          {/* 사진들 — 한 장씩 옆으로 (스크롤 스냅) */}
          <div ref={track} onClick={onClose}
            onScroll={e => { const el = e.currentTarget; setIndex(Math.round(el.scrollLeft / (el.clientWidth || 1))); }}
            className="w-full h-[85vh] flex overflow-x-auto snap-x snap-mandatory overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {list.map((p, i) => (
              <div key={`${p}-${i}`} className="shrink-0 w-full h-full flex items-center justify-center snap-center px-6 max-md:px-2">
                <img src={p} alt="" onClick={e => e.stopPropagation()} className="max-w-full max-h-full object-contain rounded-md bg-white shadow-2xl" />
              </div>
            ))}
          </div>
          <button type="button" onClick={e => { e.stopPropagation(); go(index - 1); }} disabled={index === 0} aria-label="앞 사진" className={`${arrow} left-4`}>‹</button>
          <button type="button" onClick={e => { e.stopPropagation(); go(index + 1); }} disabled={index >= list.length - 1} aria-label="다음 사진" className={`${arrow} right-4`}>›</button>
          {/* 몇 번째 사진인지 — 휴대폰은 옆으로 밀어서 넘긴다 */}
          <p className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-[13px] text-white tabular-nums" onClick={e => e.stopPropagation()}>
            {index + 1} / {list.length}<span className="md:hidden ml-2 text-white/70">옆으로 넘겨 보세요</span>
          </p>
        </>
      ) : pan ? (
        <div ref={scroller} onClick={e => e.stopPropagation()}
          className="max-w-[90vw] max-md:max-w-full max-h-[85vh] overflow-auto rounded-md bg-white shadow-2xl overscroll-contain">
          <img src={src} alt="" onLoad={centerScroll}
            className="block max-w-[90vw] max-h-[85vh] object-contain max-md:h-[70vh] max-md:w-auto max-md:max-w-none max-md:max-h-none" />
        </div>
      ) : (
        <img
          src={src}
          alt=""
          onClick={e => e.stopPropagation()}
          className="max-w-[90vw] max-h-[85vh] object-contain rounded-md bg-white shadow-2xl"
        />
      )}
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
