'use client';

import { useState, useEffect } from 'react';
import { useAdmin } from '@/components/AdminContext';
import { Subject } from '@/lib/types';
import { getSubjects, addSubject, updateSubject, deleteSubject } from '@/lib/store';
import { WE_SUBJECTS } from '@/lib/content';

export default function WeSubjectsPage() {
  const { isAdmin } = useAdmin();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [editTarget, setEditTarget] = useState<Subject | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });

  const refresh = async () => setSubjects(await getSubjects());
  useEffect(() => { refresh(); }, []);

  const handleAdd = async () => {
    if (!form.name.trim()) return;
    await addSubject({ name: form.name, description: form.description, order: subjects.length + 1 });
    setForm({ name: '', description: '' });
    setAdding(false);
    refresh();
  };

  const handleEdit = async () => {
    if (!editTarget) return;
    await updateSubject(editTarget.id, form);
    setEditTarget(null);
    refresh();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return;
    await deleteSubject(id);
    refresh();
  };

  const openEdit = (s: Subject) => {
    setEditTarget(s);
    setForm({ name: s.name, description: s.description });
  };

  const isModal = adding || editTarget !== null;

  return (
    <div className="max-w-5xl mx-auto px-8 pt-8 pb-14 md:pt-14 fade-up">
      <div className="mb-14">
        <p className="md:hidden text-[11px] tracking-[0.3em] text-[#aaa] uppercase mb-5">{WE_SUBJECTS.eyebrow}</p>
        <div className="flex items-end justify-between gap-6">
          <div>
            <h1 className="display-heading mb-3">{WE_SUBJECTS.heading}</h1>
            <p className="text-[14px] text-[#666] leading-relaxed">{WE_SUBJECTS.subtext}</p>
          </div>
          {isAdmin && (
            <button onClick={() => { setAdding(true); setForm({ name: '', description: '' }); }}
              className="text-[11px] border border-[#0a0a0a] px-5 py-1.5 tracking-widest hover:bg-[#0a0a0a] hover:text-white transition-colors shrink-0">
              + 과목 추가
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-[#f0f0f0]">
        {subjects.map((s, i) => (
          <div key={s.id} className="group bg-white p-8 relative">
            <div className="flex items-start justify-between mb-4">
              <span className="text-[10px] tracking-[0.3em] text-[#ccc] font-light">{String(i + 1).padStart(2, '0')}</span>
              {isAdmin && (
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(s)} className="text-[10px] border border-[#e5e5e5] px-2.5 py-1 hover:bg-[#f8f8f8]">수정</button>
                  <button onClick={() => handleDelete(s.id)} className="text-[10px] border border-red-100 text-red-400 px-2.5 py-1 hover:bg-red-50">삭제</button>
                </div>
              )}
            </div>
            <h2 className="text-[17px] font-medium mb-3">{s.name}</h2>
            <p className="text-[13px] text-[#666] leading-[1.8]">{s.description}</p>
          </div>
        ))}
      </div>

      {isModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/20 backdrop-blur-sm px-4" onClick={() => { setAdding(false); setEditTarget(null); }}>
          <div className="bg-white border border-[#e5e5e5] w-full max-w-md p-8 shadow-2xl" onClick={e => e.stopPropagation()}>
            <p className="text-[11px] tracking-[0.2em] text-[#888] mb-6">{editTarget ? '과목 수정' : '과목 추가'}</p>
            <div className="space-y-4">
              <input type="text" placeholder="과목명" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border-b border-[#ddd] py-2 text-sm outline-none focus:border-[#0a0a0a] placeholder:text-[#ccc]" />
              <textarea placeholder="설명" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={6}
                className="w-full border border-[#e5e5e5] p-3 text-sm outline-none focus:border-[#0a0a0a] resize-none placeholder:text-[#ccc]" />
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
