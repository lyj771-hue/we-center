'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAdmin } from './AdminContext';
import { Post, Category } from '@/lib/types';
import { getAllPosts, addPost, deletePost } from '@/lib/store';

interface Props {
  category: Category;
  basePath: string;
}

export default function PostBoard({ category, basePath }: Props) {
  const { isAdmin } = useAdmin();
  const [posts, setPosts] = useState<Post[]>([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ title: '', content: '', imageUrl: '' });

  const refresh = () => setPosts(getAllPosts(category));
  useEffect(() => { refresh(); }, [category]);

  const handleAdd = () => {
    if (!form.title.trim()) return;
    addPost(category, { title: form.title, content: form.content, imageUrl: form.imageUrl || undefined });
    setForm({ title: '', content: '', imageUrl: '' });
    setEditing(false);
    refresh();
  };

  const handleDelete = (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return;
    deletePost(category, id);
    refresh();
  };

  const fmt = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  };

  return (
    <section className="fade-up">
      {/* Header row */}
      <div className="flex items-center justify-between mb-10">
        <p className="text-[11px] tracking-[0.2em] text-[#aaa]">
          총 {posts.length}건
        </p>
        {isAdmin && (
          <button
            onClick={() => setEditing(true)}
            className="text-[11px] border border-[#0a0a0a] px-5 py-1.5 tracking-widest hover:bg-[#0a0a0a] hover:text-white transition-colors"
          >
            + 작성
          </button>
        )}
      </div>

      {/* Write modal */}
      {editing && (
        <div
          className="fixed inset-0 z-[200] flex items-start justify-center bg-black/20 backdrop-blur-sm overflow-y-auto py-20 px-4"
          onClick={() => setEditing(false)}
        >
          <div
            className="bg-white border border-[#e5e5e5] w-full max-w-xl p-8 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <p className="text-[11px] tracking-[0.2em] text-[#888] mb-6">새 글 작성</p>
            <div className="space-y-4">
              <input
                type="text"
                placeholder="제목"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                className="w-full border-b border-[#ddd] py-2 text-[15px] outline-none focus:border-[#0a0a0a] transition-colors placeholder:text-[#ccc]"
              />
              <textarea
                placeholder="내용"
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                rows={10}
                className="w-full border border-[#e5e5e5] p-4 text-sm leading-relaxed outline-none focus:border-[#0a0a0a] resize-none transition-colors placeholder:text-[#ccc]"
              />
              <input
                type="url"
                placeholder="이미지 URL (선택)"
                value={form.imageUrl}
                onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))}
                className="w-full border-b border-[#ddd] py-2 text-sm outline-none focus:border-[#0a0a0a] transition-colors placeholder:text-[#ccc]"
              />
            </div>
            <div className="flex gap-2 mt-7">
              <button
                onClick={handleAdd}
                className="flex-1 bg-[#0a0a0a] text-white text-[11px] py-3 tracking-widest hover:bg-[#333] transition-colors"
              >
                저장
              </button>
              <button
                onClick={() => setEditing(false)}
                className="flex-1 border border-[#e5e5e5] text-[11px] py-3 tracking-widest hover:bg-[#f8f8f8] transition-colors"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* List */}
      {posts.length === 0 ? (
        <div className="py-24 text-center text-sm text-[#ccc] tracking-widest">
          등록된 게시물이 없습니다
        </div>
      ) : (
        <div className="divide-y divide-[#f0f0f0]">
          {posts.map((post, i) => (
            <div key={post.id} className="group flex items-center gap-5 py-4 hover:bg-[#fafafa] -mx-8 px-8 transition-colors">
              <span className="text-[11px] text-[#ccc] w-7 shrink-0 tabular-nums">
                {String(posts.length - i).padStart(2, '0')}
              </span>
              <div className="flex-1 min-w-0">
                <Link
                  href={`${basePath}/${post.id}`}
                  className="text-[14px] hover:underline underline-offset-2 block truncate"
                >
                  {post.title}
                </Link>
              </div>
              <span className="text-[11px] text-[#bbb] shrink-0">{fmt(post.createdAt)}</span>
              {isAdmin && (
                <button
                  onClick={() => handleDelete(post.id)}
                  className="text-[11px] text-[#ccc] hover:text-red-400 shrink-0 transition-colors"
                >
                  삭제
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
