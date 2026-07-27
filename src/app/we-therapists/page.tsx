'use client';

import { useState, useEffect } from 'react';
import { useAdmin } from '@/components/AdminContext';
import { Therapist } from '@/lib/types';
import { getTherapists, addTherapist, updateTherapist, deleteTherapist } from '@/lib/store';

export default function WeTherapistsPage() {
  const { isAdmin } = useAdmin();
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [editTarget, setEditTarget] = useState<Therapist | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', role: '', description: '', photoUrl: '' });

  const refresh = () => setTherapists(getTherapists());
  useEffect(() => { refresh(); }, []);

  const handleAdd = () => {
    if (!form.name.trim()) return;
    addTherapist({ name: form.name, role: form.role, description: form.description, photoUrl: form.photoUrl || undefined, order: therapists.length + 1 });
    setForm({ name: '', role: '', description: '', photoUrl: '' });
    setAdding(false);
    refresh();
  };

  const handleEdit = () => {
    if (!editTarget) return;
    updateTherapist(editTarget.id, { ...form, photoUrl: form.photoUrl || undefined });
    setEditTarget(null);
    refresh();
  };

  const handleDelete = (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return;
    deleteTherapist(id);
    refresh();
  };

  const openEdit = (t: Therapist) => {
    setEditTarget(t);
    setForm({ name: t.name, role: t.role, description: t.description, photoUrl: t.photoUrl ?? '' });
  };

  const isModal = adding || editTarget !== null;

  return (
    <div className="max-w-5xl mx-auto px-8 py-14 fade-up">
      <div className="mb-14">
        <p className="text-[11px] tracking-[0.3em] text-[#aaa] uppercase mb-5">We 재활사</p>
        <div className="flex items-end justify-between gap-6">
          <div>
            <h1 className="display-heading mb-3">아이와 함께 걷는 사람들</h1>
            <p className="text-[14px] text-[#666] leading-relaxed">
              각 재활사는 아이의 속도를 존중하며, 발달의 모든 순간에 함께합니다.
            </p>
          </div>
          {isAdmin && (
            <button onClick={() => { setAdding(true); setForm({ name: '', role: '', description: '', photoUrl: '' }); }}
              className="text-[11px] border border-[#0a0a0a] px-5 py-1.5 tracking-widest hover:bg-[#0a0a0a] hover:text-white transition-colors shrink-0">
              + 재활사 추가
            </button>
          )}
        </div>
      </div>

      {therapists.length === 0 ? (
        <div className="py-24 text-center text-sm text-[#ccc]">등록된 재활사가 없습니다</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-10">
          {therapists.map(t => (
            <div key={t.id} className="group text-center">
              {/* Photo */}
              <div className="w-36 h-36 mx-auto rounded-full overflow-hidden bg-[#f0f0f0] mb-5 relative">
                {t.photoUrl ? (
                  <img src={t.photoUrl} alt={t.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full img-placeholder flex items-center justify-center">
                    <svg className="w-14 h-14 text-[#d5d5d5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                )}
                {isAdmin && (
                  <div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
                    <button onClick={() => openEdit(t)} className="bg-white/90 text-[10px] px-2 py-0.5">수정</button>
                    <button onClick={() => handleDelete(t.id)} className="bg-white/90 text-[10px] px-2 py-0.5 text-red-400">삭제</button>
                  </div>
                )}
              </div>
              <p className="text-[15px] font-medium mb-1">{t.name}</p>
              <p className="text-[11px] text-[#aaa] tracking-widest mb-4">{t.role}</p>
              <p className="text-[12px] text-[#666] leading-relaxed">{t.description}</p>
            </div>
          ))}
        </div>
      )}

      {isModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/20 backdrop-blur-sm px-4" onClick={() => { setAdding(false); setEditTarget(null); }}>
          <div className="bg-white border border-[#e5e5e5] w-full max-w-md p-8 shadow-2xl" onClick={e => e.stopPropagation()}>
            <p className="text-[11px] tracking-[0.2em] text-[#888] mb-6">{editTarget ? '재활사 수정' : '재활사 추가'}</p>
            <div className="space-y-4">
              <input type="text" placeholder="이름" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border-b border-[#ddd] py-2 text-sm outline-none focus:border-[#0a0a0a] placeholder:text-[#ccc]" />
              <input type="text" placeholder="직책 (예: 심리운동 재활사)" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                className="w-full border-b border-[#ddd] py-2 text-sm outline-none focus:border-[#0a0a0a] placeholder:text-[#ccc]" />
              <textarea placeholder="소개" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={5}
                className="w-full border border-[#e5e5e5] p-3 text-sm outline-none focus:border-[#0a0a0a] resize-none placeholder:text-[#ccc]" />
              <input type="url" placeholder="사진 URL (선택)" value={form.photoUrl} onChange={e => setForm(f => ({ ...f, photoUrl: e.target.value }))}
                className="w-full border-b border-[#ddd] py-2 text-sm outline-none focus:border-[#0a0a0a] placeholder:text-[#ccc]" />
            </div>
            <div className="flex gap-2 mt-7">
              <button onClick={editTarget ? handleEdit : handleAdd} className="flex-1 bg-[#0a0a0a] text-white text-[11px] py-3 tracking-widest hover:bg-[#333] transition-colors">저장</button>
              <button onClick={() => { setAdding(false); setEditTarget(null); }} className="flex-1 border border-[#e5e5e5] text-[11px] py-3 tracking-widest hover:bg-[#f8f8f8] transition-colors">취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
