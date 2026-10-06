'use client';

import { useState } from 'react';
import { createRoot } from 'react-dom/client';

// 사이트 자체 확인·알림 창 — 브라우저 기본 confirm()/alert() 대신 쓴다.
// 카카오톡 안의 브라우저(인앱 브라우저)는 기본 창을 막아서, confirm() 이 창 없이 바로 "취소"가 돼 버린다.

interface Opts {
  message: string;
  ok?: string;
  cancel?: string | null;   // null 이면 확인 버튼만(알림)
}

function open({ message, ok = '확인', cancel = '취소' }: Opts): Promise<boolean> {
  return new Promise(resolve => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const close = (v: boolean) => {
      root.unmount();
      host.remove();
      resolve(v);
    };
    root.render(
      <div role="alertdialog" aria-modal="true" aria-label={message}
        className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/30 px-6"
        onClick={() => close(false)}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-6 text-center" onClick={e => e.stopPropagation()}>
          <p className="text-[15px] leading-[1.9] text-[#333] whitespace-pre-line mb-5">{message}</p>
          <div className="flex gap-2">
            {cancel !== null && (
              <button type="button" onClick={() => close(false)}
                className="flex-1 border border-[#e5e5e5] text-[#555] text-[14px] py-2.5 rounded-full">{cancel}</button>
            )}
            <button type="button" autoFocus onClick={() => close(true)}
              className="flex-1 bg-[var(--brand)] text-white text-[14px] py-2.5 rounded-full">{ok}</button>
          </div>
        </div>
      </div>,
    );
  });
}

/** 확인 창 — 확인을 누르면 true */
export const askConfirm = (message: string, ok?: string) => open({ message, ok });

/** 알림 창 — 확인 버튼 하나 */
export const showAlert = (message: string) => open({ message, cancel: null }).then(() => undefined);

/** 글 입력 창 — 확인하면 적은 글, 취소하면 null */
export function askPrompt(message: string, initial = ''): Promise<string | null> {
  return new Promise(resolve => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const close = (v: string | null) => { root.unmount(); host.remove(); resolve(v); };
    root.render(<PromptBox message={message} initial={initial} onClose={close} />);
  });
}

function PromptBox({ message, initial, onClose }: { message: string; initial: string; onClose: (v: string | null) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <div role="dialog" aria-modal="true" aria-label={message}
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/30 px-6" onClick={() => onClose(null)}>
      <form className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-6 text-center" onClick={e => e.stopPropagation()}
        onSubmit={e => { e.preventDefault(); onClose(value); }}>
        <p className="text-[15px] leading-[1.9] text-[#333] whitespace-pre-line mb-4">{message}</p>
        <input value={value} onChange={e => setValue(e.target.value)} autoFocus maxLength={20}
          className="w-full border-b border-[#ddd] py-2 mb-5 text-[15px] text-center outline-none focus:border-[var(--brand)]" />
        <div className="flex gap-2">
          <button type="button" onClick={() => onClose(null)} className="flex-1 border border-[#e5e5e5] text-[#555] text-[14px] py-2.5 rounded-full">취소</button>
          <button type="submit" className="flex-1 bg-[var(--brand)] text-white text-[14px] py-2.5 rounded-full">확인</button>
        </div>
      </form>
    </div>
  );
}
