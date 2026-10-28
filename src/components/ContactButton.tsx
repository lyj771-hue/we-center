'use client';

import { useState } from 'react';
import Portal from './Portal';

// 문의하기 — 누르면 지점별 전화번호 창(번호를 누르면 전화, [복사]로 번호 복사). 바깥을 누르면 닫힌다
const PHONES = [
  { label: '수색(은평)점', phone: '010-4842-3164' },
  { label: '의정부점', phone: '010-4799-3164' },
];

export default function ContactButton({ className = '', onOpen }: { className?: string; onOpen?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => { onOpen?.(); setOpen(true); }} className={className}>문의하기</button>
      {open && <ContactDialog onClose={() => setOpen(false)} />}
    </>
  );
}

/** 지점별 전화번호 창 — We당근당근 [+ 센터에게]도 같은 창(안내 문구만 다르게) */
export function ContactDialog({ onClose, title = '문의하기', note = '지점으로 전화나 문자 주세요.' }: { onClose: () => void; title?: string; note?: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (phone: string) => {
    try { await navigator.clipboard.writeText(phone); }
    catch {
      // 클립보드를 못 쓰는 브라우저 — 숨은 글 칸으로 복사
      const t = document.createElement('textarea'); t.value = phone; document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); } finally { t.remove(); }
    }
    setCopied(phone); setTimeout(() => setCopied(c => (c === phone ? null : c)), 1500);
  };
  return (
    <Portal>
      <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[500] flex items-center justify-center bg-black/30 px-6" onClick={onClose}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-6" onClick={e => e.stopPropagation()}>
          <p className="text-[16px] text-[#27272a] mb-1">{title}</p>
          <p className="text-[12px] text-[#888] mb-4 break-keep">{note}</p>
          <ul className="space-y-3">
            {PHONES.map(p => (
              <li key={p.phone} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] text-[#888]">{p.label}</p>
                  <a href={`tel:${p.phone.replace(/-/g, '')}`} className="text-[17px] tabular-nums text-[var(--brand)] hover:underline underline-offset-2">{p.phone}</a>
                </div>
                <button type="button" onClick={() => copy(p.phone)}
                  className="shrink-0 inline-flex items-center gap-1 rounded-md border border-[#d4d4d8] bg-white px-2.5 py-1.5 text-[12px] text-[var(--brand)] hover:bg-[#fafafa]">
                  <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  {copied === p.phone ? '복사됨' : '복사'}
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={onClose} className="mt-5 w-full border border-[#e5e5e5] text-[#555] text-[14px] py-2.5 rounded-full">닫기</button>
        </div>
      </div>
    </Portal>
  );
}
