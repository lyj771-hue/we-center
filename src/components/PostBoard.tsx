'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useAdmin } from './AdminContext';
import { Post, Category } from '@/lib/types';
import { getAllPosts, addPost, deletePost, updatePost } from '@/lib/store';
import NoteBoard, { PinnedNote } from './NoteBoard';
import ThoughtsScrapbook from './ThoughtsScrapbook';
import WeslangBoard from './WeslangBoard';
import CarrotBoard from './CarrotBoard';
import PostTags from './PostTags';
import type { MessageRow } from '@/lib/messages';
import { CENTER_LABEL, EMPTY_SELECTION, getNoticeKinds, needsCenter, needsHoliday, noticeRecipients, selectionProblem, selectionToTags, sendNotice, type NoticeSelection } from '@/lib/noticeAlimtalk';
import NoticePicker from './NoticePicker';
import { askConfirm, showAlert } from '@/lib/dialog';

const RichTextEditor = dynamic(() => import('./RichTextEditor'), {
  ssr: false,
  loading: () => <div className="border border-[#e5e5e5] p-4 text-[12px] text-[#bbb]">에디터 불러오는 중...</div>,
});

interface Props {
  category: Category;
  basePath: string;
  /** 'notes': 메모 보드(We재활생각), 'scrapbook': 스크랩북, 'weslang': We슐랭(가운데 사진 하나씩), 'carrot': We당근당근(당근마켓 목록 모양), 'list': 목록(공지사항) */
  variant?: 'list' | 'notes' | 'scrapbook' | 'weslang' | 'carrot';
  /** notes 모드에서 맨 앞에 고정할 메모 */
  pinnedNote?: PinnedNote;
}

export default function PostBoard({ category, basePath, variant = 'list', pinnedNote }: Props) {
  const { isAdmin } = useAdmin();
  const [posts, setPosts] = useState<Post[]>([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ title: '', content: '', location: '' });
  const isWeslang = category === 'weslang';
  // 공지사항 — 글을 올리며 공지 메시지(알림톡)를 보낼지. 종류에 #{센터}가 있으면 센터 필수, #{명절}이 있으면 명절 필수
  const isNotice = category === 'notices';
  const [kinds, setKinds] = useState<MessageRow[]>([]);
  const [notice, setNotice] = useState<NoticeSelection>(EMPTY_SELECTION);
  useEffect(() => { if (isNotice && isAdmin && editing && !kinds.length) getNoticeKinds().then(setKinds).catch(() => {}); }, [isNotice, isAdmin, editing, kinds.length]);
  const kind = kinds.find(k => k.id === notice.kind);
  const wantCenter = !!kind && needsCenter(kind);
  const wantHoliday = !!kind && needsHoliday(kind);

  const refresh = async () => setPosts(await getAllPosts(category));
  useEffect(() => { refresh(); }, [category]);

  const handleAdd = async () => {
    // 제목은 꼭 — 비우면 저장하지 않고 알려 준다
    if (!form.title.trim()) { await showAlert(isWeslang ? '가게 이름을 적어 주세요.' : '제목을 적어 주세요.'); return; }
    // 공지 메시지 — 꼭 채울 칸을 비우면 저장하지 않는다
    const problem = selectionProblem(notice, kind);
    if (problem) { await showAlert(problem); return; }
    let who: Awaited<ReturnType<typeof noticeRecipients>> | null = null;
    if (kind) {
      try { who = await noticeRecipients(wantCenter ? notice.center : null); }
      catch (e) { await showAlert(`받을 보호자를 불러오지 못했어요.\n${(e as Error).message}`); return; }
      const where = wantCenter && notice.center ? `${CENTER_LABEL[notice.center]} ` : '';
      if (!(await askConfirm(`글을 올리고 "${kind.label}" 알림톡을 보낼까요?\n\n받는 사람: ${where}승인된 보호자 ${who.list.length}명${who.noPhone ? `\n(전화번호 없는 ${who.noPhone}명은 빠져요)` : ''}`, '올리고 보내기'))) return;
    }
    // 고른 것 — 지점만 게시글 제목 앞에 보이고, 종류·명절은 수정 화면에서 다시 보이게 숨겨 둔다
    const tags = selectionToTags(notice, kind);
    const post = await addPost(category, { title: form.title, content: form.content, tags, ...(isWeslang ? { location: form.location } : {}) });
    if (kind && who) {
      try {
        const r = await sendNotice(kind, post.id, wantCenter ? notice.center : null, wantHoliday ? notice.holiday : '', who.list);
        await showAlert(`글을 올렸어요.\n알림톡 — 보냄 ${r.sent}건${r.failed ? ` · 실패 ${r.failed}건` : ''}${r.skipped ? ` · 번호 없음 ${r.skipped}건` : ''}${r.waiting ? ` · 템플릿 심사 전이라 남겨만 둠 ${r.waiting}건` : ''}\n(알림 → 보호자 알림 내역에서 볼 수 있어요)`);
      } catch (e) {
        await showAlert(`글은 올렸지만 알림톡을 보내지 못했어요.\n${(e as Error).message}`);
      }
    }
    setForm({ title: '', content: '', location: '' });
    setNotice(EMPTY_SELECTION);
    setEditing(false);
    refresh();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return;
    await deletePost(category, id);
    refresh();
  };

  const fmt = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  };

  return (
    <section className="fade-up">
      {/* Header row — 메모 보드·스크랩북에선 관리자일 때만 (작성 버튼) */}
      {(variant === 'list' || (isAdmin && variant !== 'carrot')) && (
        <div className={`flex items-center mb-10 ${variant === 'list' ? 'justify-between' : 'justify-end'}`}>
          {variant === 'list' && (
            <p className="text-[11px] tracking-[0.2em] text-[#aaa]">
              총 {posts.length}건
            </p>
          )}
          {isAdmin && (
            <button
              onClick={() => setEditing(true)}
              className="text-[11px] border border-[#0a0a0a] px-5 py-1.5 tracking-widest hover:bg-[#0a0a0a] hover:text-white transition-colors"
            >
              + 작성
            </button>
          )}
        </div>
      )}

      {/* Write modal */}
      {editing && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/20 backdrop-blur-sm p-4"
          onClick={() => setEditing(false)}
        >
          <div
            className="bg-white border border-[#e5e5e5] w-full max-w-4xl max-h-[92vh] shadow-2xl flex flex-col rounded-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-8 pb-4 shrink-0">
              <p className="text-[11px] tracking-[0.2em] text-[#888] mb-6">새 글 작성</p>
              <input
                type="text"
                placeholder={isWeslang ? '가게 이름 (필수)' : '제목 (필수)'}
                aria-required="true"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                className="w-full border-b border-[#ddd] py-2 text-[15px] outline-none focus:border-[#0a0a0a] transition-colors placeholder:text-[#ccc]"
              />
              {/* We슐랭 — 가게 위치. 본문 첫 사진이 목록 가운데 큰 사진이 된다 */}
              {isWeslang && (
                <input type="text" placeholder="위치 (예: 은평구 수색동, 수색역 2번 출구 앞)" value={form.location}
                  onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                  className="mt-3 w-full border-b border-[#ddd] py-2 text-[14px] outline-none focus:border-[#0a0a0a] transition-colors placeholder:text-[#ccc]" />
              )}
              {isWeslang && <p className="mt-2 text-[11px] text-[#aaa]">본문 첫 사진이 목록 가운데 큰 사진, 나머지 사진은 오른쪽 작은 사진이 돼요.</p>}
              {/* 공지사항 — 공지 메시지(알림톡) 고르기 */}
              {isNotice && isAdmin && (
                <div className="mt-4"><NoticePicker kinds={kinds} value={notice} onChange={setNotice} note="저장하면 글을 올리고, 받을 사람 수를 확인한 뒤 알림톡을 보내요. 버튼은 이 공지 글로 가요." /></div>
              )}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-8">
              <RichTextEditor
                initialContent={form.content}
                onChange={html => setForm(f => ({ ...f, content: html }))}
              />
            </div>
            <div className="flex gap-2 p-8 pt-4 shrink-0">
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
      {variant === 'carrot' ? (
        <CarrotBoard posts={posts} basePath={basePath} isAdmin={isAdmin} onDelete={handleDelete} onWrite={() => setEditing(true)}
          onToggleSold={async p => {
            const sold = !!p.tags?.includes('sold');
            if (!(await askConfirm(sold ? `"${p.title}"을(를) 거래 중으로 되돌릴까요?` : `"${p.title}"을(를) 거래완료로 표시할까요?`))) return;
            try { await updatePost(category, p.id, { tags: sold ? (p.tags ?? []).filter(t => t !== 'sold') : [...(p.tags ?? []), 'sold'] }); refresh(); }
            catch (e) { showAlert(`바꾸지 못했어요 — SQL(supabase/post-tags.sql)을 실행했는지 확인해 주세요.\n${(e as Error).message}`); }
          }} />
      ) : variant === 'weslang' ? (
        <WeslangBoard posts={posts} basePath={basePath} isAdmin={isAdmin} onDelete={handleDelete} />
      ) : variant === 'scrapbook' ? (
        <ThoughtsScrapbook posts={posts} basePath={basePath} isAdmin={isAdmin} onDelete={handleDelete} />
      ) : variant === 'notes' ? (
        <NoteBoard posts={posts} pinned={pinnedNote} basePath={basePath} isAdmin={isAdmin} onDelete={handleDelete} />
      ) : posts.length === 0 ? (
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
                  <PostTags tags={post.tags} className="mr-1.5" />{post.title}
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
