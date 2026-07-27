'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAdmin } from './AdminContext';
import { Post, Category } from '@/lib/types';
import { getPost, updatePost, deletePost } from '@/lib/store';
import RichContent from './RichContent';

const RichTextEditor = dynamic(() => import('./RichTextEditor'), {
  ssr: false,
  loading: () => <div className="border border-[#e5e5e5] p-4 text-[12px] text-[#bbb]">에디터 불러오는 중...</div>,
});

interface Props {
  category: Category;
  id: string;
  backHref: string;
  backLabel: string;
}

export default function PostDetail({ category, id, backHref, backLabel }: Props) {
  const router = useRouter();
  const { isAdmin } = useAdmin();
  const [post, setPost] = useState<Post | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ title: '', content: '' });

  useEffect(() => {
    getPost(category, id).then(found => {
      if (found) {
        setPost(found);
        setForm({ title: found.title, content: found.content });
      }
    });
  }, [category, id]);

  const handleSave = async () => {
    if (!post) return;
    await updatePost(category, id, { title: form.title, content: form.content });
    setPost(p => p ? { ...p, ...form } : p);
    setEditing(false);
  };

  const handleDelete = async () => {
    if (!confirm('삭제하시겠습니까?')) return;
    await deletePost(category, id);
    router.push(backHref);
  };

  const fmt = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
  };

  if (!post) {
    return (
      <div className="py-24 text-center text-sm text-[#bbb]">게시물을 찾을 수 없습니다</div>
    );
  }

  return (
    <article className="max-w-2xl mx-auto fade-up">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-[11px] text-[#aaa] hover:text-[#0a0a0a] tracking-widest mb-10 transition-colors"
      >
        ← {backLabel}
      </Link>

      {editing ? (
        <div className="space-y-4">
          <input
            type="text"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            className="w-full border-b border-[#ddd] py-2 text-xl font-medium outline-none focus:border-[#0a0a0a]"
          />
          <RichTextEditor
            initialContent={form.content}
            onChange={html => setForm(f => ({ ...f, content: html }))}
          />
          <div className="flex gap-2 pt-2">
            <button onClick={handleSave} className="bg-[#0a0a0a] text-white text-[11px] px-7 py-2.5 tracking-widest hover:bg-[#333] transition-colors">저장</button>
            <button onClick={() => setEditing(false)} className="border border-[#e5e5e5] text-[11px] px-7 py-2.5 tracking-widest hover:bg-[#f8f8f8] transition-colors">취소</button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-4 mb-3">
            <h1 className="text-[22px] font-medium leading-snug flex-1">{post.title}</h1>
            {isAdmin && (
              <div className="flex gap-2 shrink-0">
                <button onClick={() => setEditing(true)} className="text-[11px] border border-[#e5e5e5] px-3.5 py-1.5 hover:bg-[#f8f8f8] transition-colors">수정</button>
                <button onClick={handleDelete} className="text-[11px] border border-red-200 text-red-400 px-3.5 py-1.5 hover:bg-red-50 transition-colors">삭제</button>
              </div>
            )}
          </div>

          <p className="text-[11px] text-[#bbb] tracking-widest mb-9">{fmt(post.createdAt)}</p>

          {post.imageUrl && (
            <div className="mb-9 overflow-hidden bg-[#f2f2f2] aspect-[16/9]">
              <img src={post.imageUrl} alt={post.title} className="w-full h-full object-cover" />
            </div>
          )}

          <RichContent html={post.content} />
        </>
      )}
    </article>
  );
}
