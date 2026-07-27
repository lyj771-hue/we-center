'use client';

import { useEffect, useState } from 'react';

interface Props {
  html: string;
}

export default function RichContent({ html }: Props) {
  const [clean, setClean] = useState('');

  useEffect(() => {
    import('dompurify').then(({ default: DOMPurify }) => {
      setClean(DOMPurify.sanitize(html));
    });
  }, [html]);

  return <div className="rich-content" dangerouslySetInnerHTML={{ __html: clean }} />;
}
