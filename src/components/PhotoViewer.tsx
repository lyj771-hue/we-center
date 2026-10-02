'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// 사진 크게 보기 — 화면 가운데 팝업. 바깥·✕·Esc로 닫는다. (We재활생각 사진, 오시는길 지도)
// pan: 휴대폰에서 가로로 긴 사진(지도)을 화면 높이에 맞춰 크게 띄우고 좌우로 밀어 보게 한다. 처음엔 가운데를 보여준다.
export default function PhotoViewer({ src, onClose, pan = false }: { src: string; onClose: () => void; pan?: boolean }) {
  const scroller = useRef<HTMLDivElement>(null);
  const centerScroll = () => {
    const el = scroller.current;
    if (el) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  };

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
      className="fixed inset-0 z-[400] flex items-center justify-center bg-black/70 p-6 max-md:px-0"
    >
      {pan ? (
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
