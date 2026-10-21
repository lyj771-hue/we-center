'use client';

import { useEffect, useState } from 'react';

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

  return <div className="rich-content" dangerouslySetInnerHTML={{ __html: clean }} />;
}
