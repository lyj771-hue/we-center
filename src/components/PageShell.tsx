'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useAdmin } from './AdminContext';
import { getPageSetting, savePageSetting } from '@/lib/store';

// 페이지 틀 — 페이지별 제목·소개 문구·본문 폭을 DB(page_settings)에서 불러와 쓴다.
// 본문 폭은 CSS 변수 --page-w 로 내려주므로, 페이지 안의 영역은 max-w-[var(--page-w)] 를 쓴다.
// 관리자는 <PageTitle>의 "제목·폭 수정" 버튼으로 바꾼다. 표가 없거나 값이 비면 기본 문구를 쓴다.

export const CONTENT_WIDTHS = [
  { label: '좁게', px: 768 },
  { label: '보통', px: 896 },
  { label: '넓게', px: 1024 },
  { label: '더 넓게', px: 1152 },
  { label: '가장 넓게', px: 1280 },
];

interface Ctx {
  heading: string;
  subtext: string;
  openEditor: () => void;
}

const PageCtx = createContext<Ctx>({ heading: '', subtext: '', openEditor: () => {} });

interface ShellProps {
  page: string;
  heading: string;
  subtext?: string;
  defaultWidth: number;
  /** 본문 폭 선택을 보여줄지 (폭이 따로 정해진 페이지는 false) */
  widthAdjustable?: boolean;
  children: React.ReactNode;
}

export default function PageShell({ page, heading, subtext = '', defaultWidth, widthAdjustable = true, children }: ShellProps) {
  const [saved, setSaved] = useState({ heading, subtext, width: defaultWidth });
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(saved);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getPageSetting(page)
      .then(s => setSaved({
        heading: s.heading || heading,
        subtext: s.subtext ?? subtext,
        width: s.contentWidth || defaultWidth,
      }))
      .catch(() => {});  // 표가 아직 없으면 기본값 그대로
  }, [page, heading, subtext, defaultWidth]);

  const openEditor = () => { setForm(saved); setEditing(true); };

  const handleSave = async () => {
    if (!form.heading.trim()) return;
    setSaving(true);
    try {
      await savePageSetting(page, { heading: form.heading, subtext: form.subtext, contentWidth: form.width });
      setSaved(form);
      setEditing(false);
    } catch {
      alert('저장에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageCtx.Provider value={{ heading: saved.heading, subtext: saved.subtext, openEditor }}>
      <div style={{ '--page-w': `${saved.width}px` } as React.CSSProperties}>{children}</div>

      {editing && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/20 backdrop-blur-sm px-4" onClick={() => setEditing(false)}>
          <div className="bg-white border border-[#e5e5e5] w-full max-w-lg p-8 shadow-2xl" onClick={e => e.stopPropagation()}>
            <p className="text-[11px] tracking-[0.2em] text-[#888] mb-6">페이지 제목 · 폭 수정</p>
            <div className="space-y-5">
              <div>
                <p className="text-[11px] tracking-[0.2em] text-[#aaa] mb-1">제목</p>
                <input type="text" value={form.heading} onChange={e => setForm(f => ({ ...f, heading: e.target.value }))}
                  className="w-full border-b border-[#ddd] py-2 text-sm outline-none focus:border-[#0a0a0a]" />
              </div>
              <div>
                <p className="text-[11px] tracking-[0.2em] text-[#aaa] mb-1">소개 문구 (비워 두면 숨겨져요 · 줄바꿈 그대로 보여요)</p>
                <textarea value={form.subtext} onChange={e => setForm(f => ({ ...f, subtext: e.target.value }))} rows={3}
                  className="w-full border border-[#e5e5e5] p-3 text-sm leading-relaxed outline-none focus:border-[#0a0a0a] resize-y" />
              </div>
              {widthAdjustable && (
                <div>
                  <p className="text-[11px] tracking-[0.2em] text-[#aaa] mb-2">본문 폭 (PC 화면 기준)</p>
                  <div role="radiogroup" className="flex flex-wrap gap-1.5">
                    {CONTENT_WIDTHS.map(w => (
                      <button key={w.px} type="button" role="radio" aria-checked={form.width === w.px}
                        onClick={() => setForm(f => ({ ...f, width: w.px }))}
                        className={[
                          'text-[11px] px-3 py-1.5 border transition-colors',
                          form.width === w.px ? 'border-[#0a0a0a] bg-[#0a0a0a] text-white' : 'border-[#e5e5e5] hover:bg-[#f8f8f8]',
                        ].join(' ')}>
                        {w.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-7">
              <button onClick={handleSave} disabled={saving}
                className="flex-1 bg-[#0a0a0a] text-white text-[11px] py-3 tracking-widest hover:bg-[#333] transition-colors disabled:opacity-50">
                {saving ? '저장 중...' : '저장'}
              </button>
              <button onClick={() => setEditing(false)}
                className="flex-1 border border-[#e5e5e5] text-[11px] py-3 tracking-widest hover:bg-[#f8f8f8] transition-colors">취소</button>
            </div>
          </div>
        </div>
      )}
    </PageCtx.Provider>
  );
}

interface TitleProps {
  /** 휴대폰에서만 보이는 작은 메뉴 이름 */
  eyebrow?: string;
  /** 'notice': 가운데 정렬, PC에선 제목을 화면에서 숨김(공지사항 메모 보드) */
  variant?: 'default' | 'notice';
  className?: string;
  /** 제목 오른쪽에 둘 버튼(예: 관리자 + 추가) */
  actions?: React.ReactNode;
}

/** 페이지 제목 + 소개 문구. 관리자에게는 "제목·폭 수정" 버튼이 보인다 */
export function PageTitle({ eyebrow, variant = 'default', className = '', actions }: TitleProps) {
  const { heading, subtext, openEditor } = useContext(PageCtx);
  const { isAdmin } = useAdmin();
  const editBtn = isAdmin && (
    <button onClick={openEditor}
      className="text-[11px] border border-[#0a0a0a] px-4 py-1.5 tracking-widest hover:bg-[#0a0a0a] hover:text-white transition-colors shrink-0">
      제목·폭 수정
    </button>
  );

  if (variant === 'notice') {
    return (
      <div className={`text-center ${className}`}>
        {eyebrow && <p className="md:hidden text-[11px] tracking-[0.3em] text-[#aaa] uppercase mb-5">{eyebrow}</p>}
        <h1 className="md:sr-only font-serif font-black text-[32px] leading-[1.2] tracking-[-0.03em] text-[var(--brand)] mb-4">{heading}</h1>
        {subtext && <p className="text-[14px] leading-[1.9] text-[#555] whitespace-pre-line">{subtext}</p>}
        {editBtn && <div className="mt-4">{editBtn}</div>}
      </div>
    );
  }

  return (
    <div className={className}>
      {eyebrow && <p className="md:hidden text-[11px] tracking-[0.3em] text-[#aaa] uppercase mb-5">{eyebrow}</p>}
      <div className="flex items-end justify-between gap-6">
        <div className="min-w-0">
          <h1 className={`display-heading ${subtext ? 'mb-3' : ''}`}>{heading}</h1>
          {subtext && <p className="text-[14px] text-[#666] leading-[1.9] whitespace-pre-line">{subtext}</p>}
        </div>
        {(editBtn || actions) && (
          <div className="flex flex-wrap justify-end gap-2 shrink-0">
            {editBtn}
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
