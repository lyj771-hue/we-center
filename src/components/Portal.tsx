'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// 창(모달·드롭다운)을 body 바로 아래에 그린다.
// 페이지의 fade-up 애니메이션(transform)이 position: fixed 의 기준을 바꿔서, 긴 페이지에선 창이 화면 밖으로 밀려나기 때문.
export default function Portal({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready ? createPortal(children, document.body) : null;
}
