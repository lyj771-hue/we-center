'use client';

import { useEffect, useState } from 'react';

// "홈 화면에 추가" 안내 — 앱처럼 설치하지 않고 브라우저로 열었을 때만.
// 안드로이드(크롬)는 [설치] 버튼으로 바로, 아이폰은 공유 버튼 → 홈 화면에 추가 안내. [닫기]하면 이 기기에선 다시 안 띄운다.

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
const KEY = 'appInstallHintClosed';

export default function InstallHint({ always }: { /** 더보기 탭 — 닫은 적 있어도 보여 준다 */ always?: boolean }) {
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);
  const [evt, setEvt] = useState<InstallEvent | null>(null);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
    if (standalone) return;
    let closed = false;
    try { closed = localStorage.getItem(KEY) === '1'; } catch { /* 저장소를 못 써도 괜찮다 */ }
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    setShow(always || !closed);
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as InstallEvent); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, [always]);

  if (!show) return null;
  const close = () => { setShow(false); try { localStorage.setItem(KEY, '1'); } catch { /* 무시 */ } };
  const install = async () => { if (!evt) return; await evt.prompt(); await evt.userChoice; setEvt(null); setShow(false); };

  return (
    <section className="bg-white rounded-[18px] p-[18px] flex items-start gap-3 border border-[#e3eefc]">
      <img src="/app/icon-192.png" alt="" className="w-11 h-11 rounded-xl shrink-0 border border-[#eee]" />
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-[15px] text-[#27272a]">홈 화면에 추가하면 앱처럼 쓸 수 있어요</p>
        {evt ? (
          <button type="button" onClick={install} className="mt-1 h-9 px-4 rounded-full bg-[var(--brand)] text-white text-[13px]">설치하기</button>
        ) : ios ? (
          <p className="text-[12px] leading-[1.7] text-[#888]">사파리 아래쪽 <b className="font-normal text-[#555]">공유 버튼(□↑)</b> → <b className="font-normal text-[#555]">홈 화면에 추가</b>를 눌러 주세요.</p>
        ) : (
          <p className="text-[12px] leading-[1.7] text-[#888]">브라우저 메뉴(⋮)에서 <b className="font-normal text-[#555]">홈 화면에 추가</b> 또는 <b className="font-normal text-[#555]">앱 설치</b>를 눌러 주세요.</p>
        )}
      </div>
      {!always && (
        <button type="button" onClick={close} aria-label="닫기" className="w-8 h-8 -mr-1 -mt-1 flex items-center justify-center text-[#bbb]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>
        </button>
      )}
    </section>
  );
}
