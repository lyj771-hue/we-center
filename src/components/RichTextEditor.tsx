'use client';

import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle, FontFamily, Color, FontSize } from '@tiptap/extension-text-style';
import TextAlign from '@tiptap/extension-text-align';
import Image from '@tiptap/extension-image';
import Highlight from '@tiptap/extension-highlight';
import Youtube from '@tiptap/extension-youtube';
import { TableKit } from '@tiptap/extension-table';
import { supabase } from '@/lib/supabaseClient';
import { uploadImage } from '@/lib/imageUpload';
import {
  DIVIDER_STYLES, Gallery, LINE_HEIGHTS, LineHeight, LinkCard, PlaceCard, QUOTE_STYLES, StyledBlockquote, StyledHorizontalRule,
} from '@/lib/editorExtensions';

// 글쓰기 에디터 — 네이버 블로그처럼. Tiptap·HTML 저장이라 예전 에디터로 쓴 글도 그대로 열린다.
//  위 줄(넣기): 사진(한 장 · 나란히 · 슬라이드) · 동영상(유튜브) · 이모지 · 인용구(4가지) · 구분선(5가지) · 장소 · 링크 카드 · 표
//  아래 줄(꾸미기): 문단 · 글꼴 · 크기 · 굵게/기울임/밑줄/취소선 · 글자색 · 배경색 · 정렬 · 줄 간격 · 목록 · 링크 · 되돌리기
//  글자를 고르면 위에 작은 서식 메뉴, 사진은 끌어다 놓거나 붙여넣어도 올라간다.

interface Props {
  initialContent: string;
  onChange: (html: string) => void;
  /** 미리보기 — 사진을 실제로 올리지 않고 화면에만 넣는다 */
  preview?: boolean;
}

const FONTS = [
  { label: '기본 글꼴', value: '' },
  { label: '명조', value: 'var(--font-noto-serif)' },
  { label: '고운돋움', value: 'var(--font-gowun-dodum)' },
  { label: '나눔명조', value: 'var(--font-nanum-myeongjo)' },
  { label: '블랙한산스', value: 'var(--font-black-han-sans)' },
];
const SIZES = [
  { label: '보통', value: '' },
  { label: '작게', value: '13px' },
  { label: '크게', value: '19px' },
  { label: '아주 크게', value: '24px' },
  { label: '제일 크게', value: '30px' },
];
const COLORS = ['#27272a', '#2a4a95', '#e11d48', '#f59e0b', '#16a34a', '#7c3aed', '#71717a'];
const HIGHLIGHTS = ['#fef08a', '#fecdd3', '#bbf7d0', '#bfdbfe', '#e9d5ff'];
const EMOJIS = ['😀', '😊', '😍', '🥰', '😋', '🤤', '😆', '😂', '🥹', '😮', '👍', '👏', '🙏', '💪', '❤️', '🧡', '💛', '💚', '💙', '💜', '⭐', '✨', '🎉', '🎈', '🌸', '🌷', '🍀', '☀️', '🌈', '🍜', '🍞', '🍰', '☕', '🍓', '🍽️', '📍', '📌', '✅', '❗', '👶', '🧒', '🏃', '🧸', '📚'];

// 선 아이콘 (24 칸 기준)
const P: Record<string, string> = {
  undo: 'M9 14 4 9l5-5 M4 9h11a5 5 0 0 1 0 10h-3',
  redo: 'm15 14 5-5-5-5 M20 9H9a5 5 0 0 0 0 10h3',
  bold: 'M6 4h8a4 4 0 0 1 0 8H6z M6 12h9a4 4 0 0 1 0 8H6z',
  italic: 'M19 4h-9 M14 20H5 M15 4 9 20',
  underline: 'M6 4v6a6 6 0 0 0 12 0V4 M4 20h16',
  strike: 'M16 4H9a3 3 0 0 0-2.83 4 M14 12a4 4 0 0 1 0 8H6 M4 12h16',
  alignLeft: 'M21 6H3 M15 12H3 M17 18H3',
  alignCenter: 'M21 6H3 M17 12H7 M19 18H5',
  alignRight: 'M21 6H3 M21 12H9 M21 18H7',
  alignJustify: 'M3 6h18 M3 12h18 M3 18h18',
  lineHeight: 'M3 6h4 M5 4v16 M3 18h4 M11 6h10 M11 12h10 M11 18h10',
  list: 'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
  ordered: 'M10 6h11 M10 12h11 M10 18h11 M4 6h1v4 M4 10h2 M6 18H4c0-1 2-2 2-3s-1-1.5-2-1',
  link: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  photo: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 9m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0 M21 15l-5-5L5 21',
  video: 'M2.5 7.1C2.6 5.6 3.8 4.4 5.3 4.3 7.4 4.1 9.7 4 12 4s4.6.1 6.7.3c1.5.1 2.7 1.3 2.8 2.8.1 1.6.2 3.2.2 4.9s-.1 3.3-.2 4.9c-.1 1.5-1.3 2.7-2.8 2.8-2.1.2-4.4.3-6.7.3s-4.6-.1-6.7-.3c-1.5-.1-2.7-1.3-2.8-2.8C2.4 15.3 2.3 13.7 2.3 12s.1-3.3.2-4.9z M10 15l5-3-5-3z',
  emoji: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M8 14s1.5 2 4 2 4-2 4-2 M9 9h.01 M15 9h.01',
  quote: 'M3 21c3 0 7-1 7-8V5c0-1.25-.76-2.02-2-2H4c-1.25 0-2 .75-2 1.97V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .01-1 1.03V20c0 1 0 1 1 1z M15 21c3 0 7-1 7-8V5c0-1.25-.76-2.02-2-2h-4c-1.25 0-2 .75-2 1.97V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z',
  divider: 'M3 12h4 M10 12h4 M17 12h4',
  place: 'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z M12 10m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
  linkCard: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M7 8h6 M7 12h10 M7 16h4',
  table: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M3 9h18 M3 15h18 M9 3v18 M15 3v18',
  chevron: 'm6 9 6 6 6-6',
};
function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name]} />
    </svg>
  );
}

/** 꾸미기 줄 버튼 */
function Btn({ icon, label, active, disabled, onClick }: { icon: string; label: string; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={label} aria-label={label} aria-pressed={active}
      className={`w-8 h-8 inline-flex items-center justify-center rounded-lg transition-colors disabled:opacity-30 ${active ? 'bg-[#eef2fb] text-[var(--brand)]' : 'text-[#52525b] hover:bg-[#f4f4f5] hover:text-[#18181b]'}`}>
      <Icon name={icon} />
    </button>
  );
}
/** 넣기 줄 버튼 — 아이콘 + 이름 */
function Insert({ icon, label, active, onClick }: { icon: string; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-expanded={active}
      className={`flex flex-col items-center justify-center gap-1 w-[64px] py-1.5 rounded-xl transition-colors ${active ? 'bg-[#eef2fb] text-[var(--brand)]' : 'text-[#3f3f46] hover:bg-[#f4f4f5]'}`}>
      <Icon name={icon} size={22} />
      <span className="text-[11px] leading-none">{label}</span>
    </button>
  );
}
const Sep = () => <span className="w-px h-5 bg-[#e4e4e7] mx-1" />;

type Panel = null | 'emoji' | 'quote' | 'divider' | 'color' | 'highlight' | 'lineHeight';
type Dialog =
  | null
  | { kind: 'youtube'; url: string }
  | { kind: 'place'; name: string; address: string }
  | { kind: 'linkCard'; url: string; loading?: boolean }
  | { kind: 'gallery'; srcs: string[] };

export default function RichTextEditor({ initialContent, onChange, preview }: Props) {
  const [, forceRender] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<Editor | null>(null);

  // 사진 올리기 — 미리보기는 화면에만, 실제는 저장소에 올린 주소
  const upload = async (files: File[]) => {
    const imgs = files.filter(f => f.type.startsWith('image/'));
    if (!imgs.length) return [];
    setUploading(true);
    try {
      const out: string[] = [];
      for (const f of imgs) out.push(preview ? URL.createObjectURL(f) : await uploadImage(f, 'posts'));
      return out;
    } catch {
      alert('사진 업로드에 실패했어요. 다시 시도해 주세요.');
      return [];
    } finally {
      setUploading(false);
    }
  };
  // 한 장이면 바로, 여러 장이면 어떻게 놓을지 고른다
  const addPhotos = async (files: File[]) => {
    const srcs = await upload(files);
    const ed = editorRef.current;
    if (!ed || !srcs.length) return;
    if (srcs.length === 1) ed.chain().focus().setImage({ src: srcs[0] }).run();
    else setDialog({ kind: 'gallery', srcs });
  };

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, blockquote: false, horizontalRule: false }),
      StyledBlockquote, StyledHorizontalRule, LineHeight,
      TextStyle, FontFamily, FontSize, Color, Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['paragraph', 'heading'] }),
      Image, Gallery, PlaceCard, LinkCard,
      Youtube.configure({ nocookie: true, width: 640, height: 360 }),
      TableKit.configure({ table: { resizable: false } }),
    ],
    content: initialContent,
    editorProps: {
      attributes: { class: 'outline-none' },
      handleDrop: (_view, event) => {
        const files = Array.from((event as DragEvent).dataTransfer?.files ?? []);
        if (!files.some(f => f.type.startsWith('image/'))) return false;
        event.preventDefault();
        addPhotos(files);
        return true;
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []);
        if (!files.some(f => f.type.startsWith('image/'))) return false;
        addPhotos(files);
        return true;
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });
  editorRef.current = editor;
  // 처음 연 글도 에디터가 정리한 HTML로 한 번 알려 준다 (장소·링크 카드 속까지)
  useEffect(() => { if (editor) onChange(editor.getHTML()); }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!editor) return;
    const rerender = () => forceRender(n => n + 1);
    editor.on('transaction', rerender);
    return () => { editor.off('transaction', rerender); };
  }, [editor]);

  if (!editor) return null;
  const c = () => editor.chain().focus();
  const toggle = (p: Panel) => setPanel(x => (x === p ? null : p));

  const handleLink = () => {
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('링크 주소를 입력하세요', prev ?? 'https://');
    if (url === null) return;
    if (!url.trim()) { c().extendMarkRange('link').unsetLink().run(); return; }
    c().extendMarkRange('link').setLink({ href: url.trim() }).run();
  };
  const fetchLinkCard = async (url: string) => {
    setDialog({ kind: 'linkCard', url, loading: true });
    let meta = { title: '', description: '', image: '' };
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch(`/api/link-preview?${new URLSearchParams({ url })}`, { headers: data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {} });
      if (res.ok) meta = await res.json();
    } catch { /* 제목 없이 주소만 */ }
    c().insertContent({ type: 'linkCard', attrs: { url, ...meta } }).run();
    setDialog(null);
  };

  const block = editor.isActive('heading', { level: 2 }) ? 'h2' : editor.isActive('heading', { level: 3 }) ? 'h3' : 'p';
  const select = 'h-8 rounded-lg bg-transparent pl-2 pr-1 text-[13px] text-[#3f3f46] hover:bg-[#f4f4f5] outline-none cursor-pointer';
  const color = editor.getAttributes('textStyle').color as string | undefined;
  const mark = editor.getAttributes('highlight').color as string | undefined;
  const lh = (editor.getAttributes('paragraph').lineHeight ?? editor.getAttributes('heading').lineHeight ?? '') as string;
  const pop = 'absolute top-[calc(100%+6px)] z-30 rounded-2xl border border-[#e4e4e7] bg-white p-2 shadow-[0_12px_32px_rgba(0,0,0,0.12)]';
  const field = 'w-full border-b border-[#e4e4e7] py-2 text-[14px] outline-none focus:border-[var(--brand)] placeholder:text-[#c4c4cc]';

  return (
    <div className="rich-editor relative rounded-2xl border border-[#e4e4e7] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] focus-within:border-[#c7d2ee] focus-within:shadow-[0_0_0_4px_rgba(42,74,149,0.08)] transition-shadow"
      onClick={() => panel && setPanel(null)}>
      <div className="sticky top-0 z-20 rounded-t-2xl bg-white/95 backdrop-blur" onClick={e => e.stopPropagation()}>
        {/* 넣기 줄 — 네이버 블로그처럼 큰 아이콘 */}
        <div className="flex flex-wrap items-center justify-center gap-0.5 px-2 pt-2 pb-1.5 border-b border-[#f0f0f2]">
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
            onChange={async e => { await addPhotos(Array.from(e.target.files ?? [])); if (fileRef.current) fileRef.current.value = ''; }} />
          <Insert icon="photo" label={uploading ? '올리는 중' : '사진'} onClick={() => fileRef.current?.click()} />
          <Insert icon="video" label="동영상" onClick={() => setDialog({ kind: 'youtube', url: '' })} />
          <span className="relative">
            <Insert icon="emoji" label="이모지" active={panel === 'emoji'} onClick={() => toggle('emoji')} />
            {panel === 'emoji' && (
              <div className={`${pop} left-1/2 -translate-x-1/2 w-[292px] grid grid-cols-8 gap-0.5`}>
                {EMOJIS.map(em => (
                  <button key={em} type="button" onClick={() => { c().insertContent(em).run(); }} className="h-8 rounded-lg text-[19px] hover:bg-[#f4f4f5]">{em}</button>
                ))}
              </div>
            )}
          </span>
          <span className="relative">
            <Insert icon="quote" label="인용구" active={panel === 'quote'} onClick={() => toggle('quote')} />
            {panel === 'quote' && (
              <div className={`${pop} left-1/2 -translate-x-1/2 w-[220px] space-y-1`}>
                {QUOTE_STYLES.map(q => (
                  <button key={q.key} type="button" onClick={() => {
                    if (!editor.isActive('blockquote')) c().toggleBlockquote().run();
                    c().updateAttributes('blockquote', { variant: q.key }).run();
                    setPanel(null);
                  }} className="block w-full text-left rounded-xl px-2 py-1.5 hover:bg-[#f4f4f5]">
                    <span className={`quote-sample quote-sample-${q.key}`}>{q.label}</span>
                  </button>
                ))}
                {editor.isActive('blockquote') && (
                  <button type="button" onClick={() => { c().toggleBlockquote().run(); setPanel(null); }} className="block w-full text-left rounded-xl px-2 py-1.5 text-[12px] text-[#a1a1aa] hover:bg-[#f4f4f5]">인용구 풀기</button>
                )}
              </div>
            )}
          </span>
          <span className="relative">
            <Insert icon="divider" label="구분선" active={panel === 'divider'} onClick={() => toggle('divider')} />
            {panel === 'divider' && (
              <div className={`${pop} left-1/2 -translate-x-1/2 w-[200px] space-y-1`}>
                {DIVIDER_STYLES.map(d => (
                  <button key={d.key} type="button" onClick={() => { c().insertContent({ type: 'horizontalRule', attrs: { variant: d.key } }).run(); setPanel(null); }}
                    className="block w-full rounded-xl px-3 py-2 hover:bg-[#f4f4f5]" title={d.label}>
                    <span className={`divider-sample divider-sample-${d.key}`} />
                  </button>
                ))}
              </div>
            )}
          </span>
          <Insert icon="place" label="장소" onClick={() => setDialog({ kind: 'place', name: '', address: '' })} />
          <Insert icon="linkCard" label="링크" onClick={() => setDialog({ kind: 'linkCard', url: '' })} />
          <Insert icon="table" label="표" onClick={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />
        </div>

        {/* 꾸미기 줄 */}
        <div className="flex flex-wrap items-center justify-center gap-x-1 gap-y-0.5 px-2 py-1.5 border-b border-[#f0f0f2]">
          <span className="fmt-group">
          <select value={block} title="문단 모양" className={select}
            onChange={e => { const v = e.target.value; if (v === 'p') c().setParagraph().run(); else c().toggleHeading({ level: v === 'h2' ? 2 : 3 }).run(); }}>
            <option value="p">본문</option>
            <option value="h2">큰 제목</option>
            <option value="h3">작은 제목</option>
          </select>
          <select value={editor.getAttributes('textStyle').fontFamily ?? ''} title="글꼴" className={select}
            onChange={e => { const v = e.target.value; if (v) c().setFontFamily(v).run(); else c().unsetFontFamily().run(); }}>
            {FONTS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          <select value={editor.getAttributes('textStyle').fontSize ?? ''} title="글자 크기" className={select}
            onChange={e => { const v = e.target.value; if (v) c().setFontSize(v).run(); else c().unsetFontSize().run(); }}>
            {SIZES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          </span>
          <span className="fmt-group">
          <Btn icon="bold" label="굵게" active={editor.isActive('bold')} onClick={() => c().toggleBold().run()} />
          <Btn icon="italic" label="기울임" active={editor.isActive('italic')} onClick={() => c().toggleItalic().run()} />
          <Btn icon="underline" label="밑줄" active={editor.isActive('underline')} onClick={() => c().toggleUnderline().run()} />
          <Btn icon="strike" label="취소선" active={editor.isActive('strike')} onClick={() => c().toggleStrike().run()} />
          {/* 글자 색 */}
          <span className="relative">
            <button type="button" title="글자 색" aria-label="글자 색" onClick={() => toggle('color')}
              className="w-8 h-8 inline-flex flex-col items-center justify-center rounded-lg text-[#52525b] hover:bg-[#f4f4f5]">
              <span className="text-[14px] font-semibold leading-none">A</span>
              <span className="mt-0.5 w-4 h-[3px] rounded-full" style={{ background: color ?? '#27272a' }} />
            </button>
            {panel === 'color' && (
              <span className={`${pop} left-0 flex gap-1.5`}>
                {COLORS.map(col => (
                  <button key={col} type="button" aria-label={`글자 색 ${col}`} onClick={() => { if (col === '#27272a') c().unsetColor().run(); else c().setColor(col).run(); setPanel(null); }}
                    className={`w-6 h-6 rounded-full ring-offset-2 ${color === col ? 'ring-2 ring-[#a1a1aa]' : ''}`} style={{ background: col }} />
                ))}
              </span>
            )}
          </span>
          {/* 배경색(형광펜) */}
          <span className="relative">
            <button type="button" title="배경색" aria-label="배경색" onClick={() => toggle('highlight')}
              className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-[#52525b] hover:bg-[#f4f4f5]">
              <span className="px-1 text-[13px] font-semibold leading-tight rounded" style={{ background: mark ?? '#fef08a' }}>가</span>
            </button>
            {panel === 'highlight' && (
              <span className={`${pop} left-0 flex items-center gap-1.5`}>
                {HIGHLIGHTS.map(col => (
                  <button key={col} type="button" aria-label={`배경색 ${col}`} onClick={() => { c().setHighlight({ color: col }).run(); setPanel(null); }}
                    className={`w-6 h-6 rounded-md ring-offset-2 ${mark === col ? 'ring-2 ring-[#a1a1aa]' : ''}`} style={{ background: col }} />
                ))}
                <button type="button" onClick={() => { c().unsetHighlight().run(); setPanel(null); }} className="ml-1 text-[12px] text-[#a1a1aa] whitespace-nowrap hover:text-[#3f3f46]">없음</button>
              </span>
            )}
          </span>
          </span>
          <span className="fmt-group">
          <Btn icon="alignLeft" label="왼쪽 정렬" active={editor.isActive({ textAlign: 'left' })} onClick={() => c().setTextAlign('left').run()} />
          <Btn icon="alignCenter" label="가운데 정렬" active={editor.isActive({ textAlign: 'center' })} onClick={() => c().setTextAlign('center').run()} />
          <Btn icon="alignRight" label="오른쪽 정렬" active={editor.isActive({ textAlign: 'right' })} onClick={() => c().setTextAlign('right').run()} />
          <Btn icon="alignJustify" label="양쪽 정렬" active={editor.isActive({ textAlign: 'justify' })} onClick={() => c().setTextAlign('justify').run()} />
          {/* 줄 간격 */}
          <span className="relative">
            <Btn icon="lineHeight" label="줄 간격" active={!!lh} onClick={() => toggle('lineHeight')} />
            {panel === 'lineHeight' && (
              <span className={`${pop} left-0 w-[120px] flex flex-col`}>
                {LINE_HEIGHTS.map(l => (
                  <button key={l.label} type="button" onClick={() => {
                    const v = l.value || null;
                    c().updateAttributes('paragraph', { lineHeight: v }).updateAttributes('heading', { lineHeight: v }).run();
                    setPanel(null);
                  }} className={`text-left rounded-lg px-2.5 py-1.5 text-[13px] hover:bg-[#f4f4f5] ${lh === l.value ? 'text-[var(--brand)]' : 'text-[#3f3f46]'}`}>{l.label}</button>
                ))}
              </span>
            )}
          </span>
          </span>
          <span className="fmt-group">
          <Btn icon="list" label="글머리 목록" active={editor.isActive('bulletList')} onClick={() => c().toggleBulletList().run()} />
          <Btn icon="ordered" label="번호 목록" active={editor.isActive('orderedList')} onClick={() => c().toggleOrderedList().run()} />
          <Btn icon="link" label="글자에 링크" active={editor.isActive('link')} onClick={handleLink} />
          </span>
          <span className="fmt-group">
          <Btn icon="undo" label="실행 취소" disabled={!editor.can().undo()} onClick={() => c().undo().run()} />
          <Btn icon="redo" label="다시 실행" disabled={!editor.can().redo()} onClick={() => c().redo().run()} />
          </span>
        </div>

        {/* 표 안에 있을 때만 — 표 손보기 */}
        {editor.isActive('table') && (
          <div className="flex flex-wrap justify-center gap-1 border-b border-[#f0f0f2] bg-[#fafafa] px-3 py-1.5 text-[12px]">
            {([['줄 추가', () => c().addRowAfter().run()], ['줄 삭제', () => c().deleteRow().run()], ['칸 추가', () => c().addColumnAfter().run()], ['칸 삭제', () => c().deleteColumn().run()]] as const).map(([l, f]) => (
              <button key={l} type="button" onClick={f} className="rounded-md px-2 py-1 text-[#52525b] hover:bg-white">{l}</button>
            ))}
            <button type="button" onClick={() => c().deleteTable().run()} className="rounded-md px-2 py-1 text-red-400 hover:bg-white">표 삭제</button>
          </div>
        )}
      </div>

      {/* 글자를 고르면 바로 위에 뜨는 작은 서식 메뉴 */}
      <BubbleMenu editor={editor} shouldShow={({ editor: e, from, to }) => from !== to && !e.isActive('image') && !e.isActive('gallery') && !e.isActive('placeCard') && !e.isActive('linkCard')}
        className="flex items-center gap-0.5 rounded-xl border border-[#e4e4e7] bg-white px-1 py-1 shadow-lg">
        <Btn icon="bold" label="굵게" active={editor.isActive('bold')} onClick={() => c().toggleBold().run()} />
        <Btn icon="italic" label="기울임" active={editor.isActive('italic')} onClick={() => c().toggleItalic().run()} />
        <Btn icon="underline" label="밑줄" active={editor.isActive('underline')} onClick={() => c().toggleUnderline().run()} />
        <Btn icon="link" label="링크" active={editor.isActive('link')} onClick={handleLink} />
        <span className="w-px h-5 bg-[#e4e4e7] mx-0.5" />
        {COLORS.slice(1, 4).map(col => (
          <button key={col} type="button" aria-label={`색 ${col}`} onClick={() => c().setColor(col).run()} className="w-5 h-5 mx-0.5 rounded-full" style={{ background: col }} />
        ))}
        <button type="button" aria-label="형광펜" onClick={() => c().toggleHighlight({ color: HIGHLIGHTS[0] }).run()} className="w-5 h-5 mx-0.5 rounded-md" style={{ background: HIGHLIGHTS[0] }} />
      </BubbleMenu>

      {/* 글 쓰는 곳 — 실제 게시글처럼 가운데 폭에 맞춰 */}
      <EditorContent editor={editor} className="rich-content rich-content-editor min-h-[420px] px-5 md:px-10 py-8" />

      {/* 넣기 창 — 동영상 · 장소 · 링크 카드 · 사진 여러 장 */}
      {dialog && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/25 px-4" onClick={() => setDialog(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl space-y-4" onClick={e => e.stopPropagation()}>
            {dialog.kind === 'youtube' && (<>
              <p className="text-[15px] text-[#27272a]">동영상 넣기</p>
              <input autoFocus value={dialog.url} onChange={e => setDialog({ kind: 'youtube', url: e.target.value })} placeholder="유튜브 주소 (https://youtu.be/…)" className={field} />
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setDialog(null)} className="px-4 py-2 text-[13px] text-[#888]">취소</button>
                <button type="button" disabled={!dialog.url.trim()} onClick={() => { c().setYoutubeVideo({ src: dialog.url.trim() }).run(); setDialog(null); }}
                  className="px-4 py-2 rounded-full bg-[var(--brand)] text-white text-[13px] disabled:opacity-40">넣기</button>
              </div>
            </>)}
            {dialog.kind === 'place' && (<>
              <p className="text-[15px] text-[#27272a]">장소 넣기</p>
              <input autoFocus value={dialog.name} onChange={e => setDialog({ ...dialog, name: e.target.value })} placeholder="가게·장소 이름" className={field} />
              <input value={dialog.address} onChange={e => setDialog({ ...dialog, address: e.target.value })} placeholder="주소 (예: 서울 은평구 수색로 217-1)" className={field} />
              <p className="text-[11px] text-[#a1a1aa]">네이버지도·카카오맵 바로가기가 함께 붙어요.</p>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setDialog(null)} className="px-4 py-2 text-[13px] text-[#888]">취소</button>
                <button type="button" disabled={!dialog.name.trim()} onClick={() => { c().insertContent({ type: 'placeCard', attrs: { name: dialog.name.trim(), address: dialog.address.trim() } }).run(); setDialog(null); }}
                  className="px-4 py-2 rounded-full bg-[var(--brand)] text-white text-[13px] disabled:opacity-40">넣기</button>
              </div>
            </>)}
            {dialog.kind === 'linkCard' && (<>
              <p className="text-[15px] text-[#27272a]">링크 카드 넣기</p>
              <input autoFocus value={dialog.url} disabled={dialog.loading} onChange={e => setDialog({ kind: 'linkCard', url: e.target.value })} placeholder="https://" className={field} />
              <p className="text-[11px] text-[#a1a1aa]">그 사이트의 제목·설명·대표 그림을 읽어 카드로 넣어요.</p>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setDialog(null)} className="px-4 py-2 text-[13px] text-[#888]">취소</button>
                <button type="button" disabled={!/^https?:\/\/\S+/.test(dialog.url.trim()) || dialog.loading} onClick={() => fetchLinkCard(dialog.url.trim())}
                  className="px-4 py-2 rounded-full bg-[var(--brand)] text-white text-[13px] disabled:opacity-40">{dialog.loading ? '읽는 중…' : '넣기'}</button>
              </div>
            </>)}
            {dialog.kind === 'gallery' && (<>
              <p className="text-[15px] text-[#27272a]">사진 {dialog.srcs.length}장을 어떻게 놓을까요?</p>
              <div className="grid grid-cols-3 gap-2 text-[12px] text-[#3f3f46]">
                <button type="button" onClick={() => { const ch = c(); dialog.srcs.forEach(src => ch.setImage({ src })); ch.run(); setDialog(null); }}
                  className="rounded-xl border border-[#e4e4e7] p-2 hover:border-[var(--brand)]"><span className="gal-icon gal-icon-one" />한 장씩</button>
                <button type="button" onClick={() => { c().insertContent({ type: 'gallery', attrs: { layout: 'row', images: dialog.srcs } }).run(); setDialog(null); }}
                  className="rounded-xl border border-[#e4e4e7] p-2 hover:border-[var(--brand)]"><span className="gal-icon gal-icon-row" />나란히</button>
                <button type="button" onClick={() => { c().insertContent({ type: 'gallery', attrs: { layout: 'slide', images: dialog.srcs } }).run(); setDialog(null); }}
                  className="rounded-xl border border-[#e4e4e7] p-2 hover:border-[var(--brand)]"><span className="gal-icon gal-icon-slide" />슬라이드</button>
              </div>
            </>)}
          </div>
        </div>
      )}
    </div>
  );
}
