'use client';

import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle, FontFamily, Color, FontSize } from '@tiptap/extension-text-style';
import TextAlign from '@tiptap/extension-text-align';
import Image from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import { uploadImage } from '@/lib/imageUpload';

interface Props {
  initialContent: string;
  onChange: (html: string) => void;
}

const FONTS = [
  { label: '기본', value: '' },
  { label: '명조', value: 'var(--font-noto-serif)' },
  { label: '고운돋움', value: 'var(--font-gowun-dodum)' },
  { label: '나눔명조', value: 'var(--font-nanum-myeongjo)' },
  { label: '블랙한산스', value: 'var(--font-black-han-sans)' },
];

const SIZES = [
  { label: '기본', value: '' },
  { label: '작게', value: '12px' },
  { label: '크게', value: '18px' },
  { label: '아주 크게', value: '24px' },
];

export default function RichTextEditor({ initialContent, onChange }: Props) {
  const [, forceRender] = useState(0);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      TextStyle,
      FontFamily,
      FontSize,
      Color,
      TextAlign.configure({ types: ['paragraph', 'heading'] }),
      Image,
      TableKit.configure({ table: { resizable: false } }),
    ],
    content: initialContent,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  useEffect(() => {
    if (!editor) return;
    const rerender = () => forceRender(n => n + 1);
    editor.on('transaction', rerender);
    return () => { editor.off('transaction', rerender); };
  }, [editor]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editor) return;
    setUploading(true);
    try {
      const url = await uploadImage(file, 'posts');
      editor.chain().focus().setImage({ src: url }).run();
    } catch {
      alert('사진 업로드에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleLink = () => {
    if (!editor) return;
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('링크 주소를 입력하세요', prev ?? 'https://');
    if (url === null) return;
    if (!url.trim()) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
  };

  if (!editor) return null;

  const btnCls = (active: boolean) =>
    [
      'text-[11px] border px-2.5 py-1 transition-colors',
      active ? 'bg-[#0a0a0a] text-white border-[#0a0a0a]' : 'border-[#ddd] hover:bg-[#f8f8f8]',
    ].join(' ');

  return (
    <div className="rich-editor border border-[#e5e5e5]">
      {/* Toolbar */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1.5 border-b border-[#e5e5e5] bg-[#fafafa] p-2">
        <button type="button" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} className="text-[11px] border border-[#ddd] px-2.5 py-1 hover:bg-[#f8f8f8] transition-colors disabled:opacity-30">
          실행취소
        </button>
        <button type="button" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} className="text-[11px] border border-[#ddd] px-2.5 py-1 hover:bg-[#f8f8f8] transition-colors disabled:opacity-30">
          다시실행
        </button>

        <span className="w-px h-4 bg-[#e5e5e5] mx-1" />

        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={btnCls(editor.isActive('bold'))}>굵게</button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={btnCls(editor.isActive('italic'))}>기울임</button>
        <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()} className={btnCls(editor.isActive('underline'))}>밑줄</button>
        <button type="button" onClick={() => editor.chain().focus().toggleStrike().run()} className={btnCls(editor.isActive('strike'))}>취소선</button>

        <span className="w-px h-4 bg-[#e5e5e5] mx-1" />

        <button type="button" onClick={() => editor.chain().focus().setTextAlign('left').run()} className={btnCls(editor.isActive({ textAlign: 'left' }))}>좌</button>
        <button type="button" onClick={() => editor.chain().focus().setTextAlign('center').run()} className={btnCls(editor.isActive({ textAlign: 'center' }))}>중</button>
        <button type="button" onClick={() => editor.chain().focus().setTextAlign('right').run()} className={btnCls(editor.isActive({ textAlign: 'right' }))}>우</button>

        <span className="w-px h-4 bg-[#e5e5e5] mx-1" />

        <select
          value={editor.getAttributes('textStyle').fontSize ?? ''}
          onChange={e => {
            const v = e.target.value;
            v ? editor.chain().focus().setFontSize(v).run() : editor.chain().focus().unsetFontSize().run();
          }}
          className="text-[11px] border border-[#ddd] px-2 py-1 bg-white outline-none"
          title="글자 크기"
        >
          {SIZES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>

        <select
          value={editor.getAttributes('textStyle').fontFamily ?? ''}
          onChange={e => {
            const v = e.target.value;
            v ? editor.chain().focus().setFontFamily(v).run() : editor.chain().focus().unsetFontFamily().run();
          }}
          className="text-[11px] border border-[#ddd] px-2 py-1 bg-white outline-none"
          title="폰트"
        >
          {FONTS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>

        <input
          type="color"
          value={editor.getAttributes('textStyle').color ?? '#0a0a0a'}
          onChange={e => editor.chain().focus().setColor(e.target.value).run()}
          className="w-7 h-7 border border-[#ddd] p-0.5 bg-white cursor-pointer"
          title="글자 색상"
        />
        {editor.getAttributes('textStyle').color && (
          <button type="button" onClick={() => editor.chain().focus().unsetColor().run()} className="text-[11px] border border-[#ddd] px-2.5 py-1 hover:bg-[#f8f8f8] transition-colors">
            기본색
          </button>
        )}

        <span className="w-px h-4 bg-[#e5e5e5] mx-1" />

        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={btnCls(editor.isActive('bulletList'))}>목록</button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btnCls(editor.isActive('orderedList'))}>번호목록</button>
        <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()} className={btnCls(editor.isActive('blockquote'))}>인용구</button>
        <button type="button" onClick={() => editor.chain().focus().setHorizontalRule().run()} className="text-[11px] border border-[#ddd] px-2.5 py-1 hover:bg-[#f8f8f8] transition-colors">구분선</button>

        <span className="w-px h-4 bg-[#e5e5e5] mx-1" />

        <button type="button" onClick={handleLink} className={btnCls(editor.isActive('link'))}>링크</button>
        {editor.isActive('link') && (
          <button type="button" onClick={() => editor.chain().focus().unsetLink().run()} className="text-[11px] border border-[#ddd] px-2.5 py-1 hover:bg-[#f8f8f8] transition-colors">
            링크 해제
          </button>
        )}

        <span className="w-px h-4 bg-[#e5e5e5] mx-1" />

        <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="text-[11px] border border-[#ddd] px-2.5 py-1 hover:bg-[#f8f8f8] transition-colors disabled:opacity-50">
          {uploading ? '업로드 중...' : '사진 추가'}
        </button>

        <button type="button" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} className="text-[11px] border border-[#ddd] px-2.5 py-1 hover:bg-[#f8f8f8] transition-colors">
          표 삽입
        </button>
        {editor.isActive('table') && (
          <>
            <button type="button" onClick={() => editor.chain().focus().addRowAfter().run()} className="text-[11px] border border-[#ddd] px-2.5 py-1 hover:bg-[#f8f8f8] transition-colors">행 추가</button>
            <button type="button" onClick={() => editor.chain().focus().deleteRow().run()} className="text-[11px] border border-[#ddd] px-2.5 py-1 hover:bg-[#f8f8f8] transition-colors">행 삭제</button>
            <button type="button" onClick={() => editor.chain().focus().addColumnAfter().run()} className="text-[11px] border border-[#ddd] px-2.5 py-1 hover:bg-[#f8f8f8] transition-colors">열 추가</button>
            <button type="button" onClick={() => editor.chain().focus().deleteColumn().run()} className="text-[11px] border border-[#ddd] px-2.5 py-1 hover:bg-[#f8f8f8] transition-colors">열 삭제</button>
            <button type="button" onClick={() => editor.chain().focus().deleteTable().run()} className="text-[11px] border border-red-200 text-red-400 px-2.5 py-1 hover:bg-red-50 transition-colors">표 삭제</button>
          </>
        )}
      </div>

      <EditorContent editor={editor} className="rich-content min-h-[320px] p-4" />
    </div>
  );
}
