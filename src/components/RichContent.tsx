'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  html: string;
}

export default function RichContent({ html }: Props) {
  const [clean, setClean] = useState('');

  useEffect(() => {
    import('dompurify').then(({ default: DOMPurify }) => {
      // 유튜브 동영상(iframe)은 youtube.com / youtube-nocookie.com 주소만 남긴다. 링크 카드·장소 카드는 새 창으로
      DOMPurify.addHook('uponSanitizeElement', (node, data) => {
        if (data.tagName === 'iframe') {
          const src = (node as Element).getAttribute('src') ?? '';
          if (!/^https:\/\/(www\.)?(youtube\.com|youtube-nocookie\.com)\/embed\//.test(src)) node.parentNode?.removeChild(node);
        }
      });
      setClean(DOMPurify.sanitize(html, { ADD_TAGS: ['iframe'], ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'target'] }));
      DOMPurify.removeHook('uponSanitizeElement');
    });
  }, [html]);

  // 슬라이드 사진 — 아래에 '1 / 5' · 점 · '옆으로 넘겨 보세요'를 붙여 넘길 수 있는 걸 알려 준다(넘기면 점이 따라간다)
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = box.current;
    if (!root) return;
    const undo: (() => void)[] = [];
    root.querySelectorAll<HTMLElement>('.post-gallery-slide').forEach(g => {
      const imgs = g.querySelectorAll<HTMLImageElement>('img');
      const n = imgs.length;
      if (n < 2) return;
      const bar = document.createElement('div');
      bar.className = 'slide-indicator';
      bar.innerHTML = `<span class="slide-count">1 / ${n}</span><span class="slide-dots">${'<i></i>'.repeat(n)}</span><span class="slide-hint">옆으로 넘겨 보세요 ›</span>`;
      g.after(bar);
      const dots = bar.querySelectorAll('i');
      const count = bar.querySelector('.slide-count');
      const update = () => {
        const step = (imgs[0].clientWidth || 1) + 8;
        const i = Math.max(0, Math.min(n - 1, Math.round(g.scrollLeft / step)));
        if (count) count.textContent = `${i + 1} / ${n}`;
        dots.forEach((d, j) => d.classList.toggle('on', j === i));
        bar.classList.toggle('moved', g.scrollLeft > 4);
      };
      update();
      g.addEventListener('scroll', update, { passive: true });
      undo.push(() => { g.removeEventListener('scroll', update); bar.remove(); });
    });
    return () => undo.forEach(f => f());
  }, [clean]);

  return <div ref={box} className="rich-content" dangerouslySetInnerHTML={{ __html: clean }} />;
}
