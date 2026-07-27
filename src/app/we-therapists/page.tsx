'use client';

import { useState, useEffect, useRef } from 'react';
import { useAdmin } from '@/components/AdminContext';
import { Therapist } from '@/lib/types';
import { getTherapists, addTherapist, updateTherapist, deleteTherapist } from '@/lib/store';
import { uploadImage } from '@/lib/imageUpload';
import { WE_THERAPISTS } from '@/lib/content';
import ViewToggle from '@/components/ViewToggle';

export default function WeTherapistsPage() {
  const { isAdmin } = useAdmin();
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [viewCols, setViewCols] = useState<1 | 2>(2);
  const [editTarget, setEditTarget] = useState<Therapist | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', role: '', description: '', photoUrl: '' });
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = async () => setTherapists(await getTherapists());
  useEffect(() => { refresh(); }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImage(file, 'therapists');
      setForm(f => ({ ...f, photoUrl: url }));
    } catch {
      alert('사진 업로드에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleAdd = async () => {
    if (!form.name.trim()) return;
    await addTherapist({ name: form.name, role: form.role, description: form.description, photoUrl: form.photoUrl || undefined, order: therapists.length + 1 });
    setForm({ name: '', role: '', description: '', photoUrl: '' });
    setAdding(false);
    refresh();
  };

  const handleEdit = async () => {
    if (!editTarget) return;
    await updateTherapist(editTarget.id, { ...form, photoUrl: form.photoUrl || undefined });
    setEditTarget(null);
    refresh();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return;
    await deleteTherapist(id);
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
        <p className="text-[11px] tracking-[0.3em] text-[#aaa] uppercase mb-5">{WE_THERAPISTS.eyebrow}</p>
        <div className="flex items-end justify-between gap-6">
          <div>
            <h1 className="display-heading mb-3">{WE_THERAPISTS.heading}</h1>
            <p className="text-[14px] text-[#666] leading-relaxed">{WE_THERAPISTS.subtext}</p>
          </div>
          {isAdmin && (
            <button onClick={() => { setAdding(true); setForm({ name: '', role: '', description: '', photoUrl: '' }); }}
              className="text-[11px] border border-[#0a0a0a] px-5 py-1.5 tracking-widest hover:bg-[#0a0a0a] hover:text-white transition-colors shrink-0">
              + 재활사 추가
            </button>
          )}
        </div>
      </div>

      <ViewToggle cols={viewCols} onChange={setViewCols} />

      {therapists.length === 0 ? (
        <div className="py-24 text-center text-sm text-[#ccc]">등록된 재활사가 없습니다</div>
      ) : (
        <div className={`grid ${viewCols === 1 ? 'grid-cols-1' : 'grid-cols-2'} sm:grid-cols-2 lg:grid-cols-3 gap-10`}>
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
              <div>
                <p className="text-[11px] tracking-[0.2em] text-[#aaa] mb-2">사진 (선택)</p>
                {form.photoUrl && (
                  <div className="relative w-24 h-24 rounded-full overflow-hidden bg-[#f2f2f2] mb-2">
                    <img src={form.photoUrl} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => setForm(f => ({ ...f, photoUrl: '' }))}
                      className="absolute top-0.5 right-0.5 bg-white/90 text-red-400 text-[10px] w-5 h-5 flex items-center justify-center rounded-full hover:bg-white shadow-sm">✕</button>
                  </div>
                )}
                <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                <button onClick={() => fileRef.current?.click()} disabled={uploading}
                  className="text-[11px] border border-[#ddd] px-4 py-1.5 hover:bg-[#f8f8f8] transition-colors disabled:opacity-50">
                  {uploading ? '업로드 중...' : '사진 선택'}
                </button>
              </div>
            </div>
            <div className="flex gap-2 mt-7">
              <button onClick={editTarget ? handleEdit : handleAdd} disabled={uploading} className="flex-1 bg-[#0a0a0a] text-white text-[11px] py-3 tracking-widest hover:bg-[#333] transition-colors disabled:opacity-50">저장</button>
              <button onClick={() => { setAdding(false); setEditTarget(null); }} className="flex-1 border border-[#e5e5e5] text-[11px] py-3 tracking-widest hover:bg-[#f8f8f8] transition-colors">취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
