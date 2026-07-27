'use client';

import { useState, useEffect, useRef } from 'react';
import { useAdmin } from '@/components/AdminContext';
import { getLocation, saveLocation, LocationData } from '@/lib/store';
import { LOCATION } from '@/lib/content';

export default function LocationPage() {
  const { isAdmin } = useAdmin();
  const [data, setData] = useState<LocationData>({ content: '', imageUrls: [] });
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<LocationData>({ content: '', imageUrls: [] });
  const [newUrl, setNewUrl] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { const d = getLocation(); setData(d); setForm(d); }, []);

  const handleSave = () => {
    saveLocation(form);
    setData(form);
    setEditing(false);
  };

  const addImageUrl = () => {
    if (!newUrl.trim()) return;
    setForm(f => ({ ...f, imageUrls: [...f.imageUrls, newUrl.trim()] }));
    setNewUrl('');
  };

  const removeImage = (idx: number) => {
    setForm(f => ({ ...f, imageUrls: f.imageUrls.filter((_, i) => i !== idx) }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => {
        const url = ev.target?.result as string;
        setForm(f => ({ ...f, imageUrls: [...f.imageUrls, url] }));
      };
      reader.readAsDataURL(file);
    });
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="max-w-3xl mx-auto px-8 py-14 fade-up">
      <div className="mb-14">
        <p className="text-[11px] tracking-[0.3em] text-[#aaa] uppercase mb-5">{LOCATION.eyebrow}</p>
        <div className="flex items-end justify-between gap-6">
          <div>
            <h1 className="display-heading mb-3">{LOCATION.heading}</h1>
            <p className="text-[14px] text-[#666] leading-relaxed">{LOCATION.subtext}</p>
          </div>
          {isAdmin && !editing && (
            <button onClick={() => setEditing(true)}
              className="text-[11px] border border-[#0a0a0a] px-5 py-1.5 tracking-widest hover:bg-[#0a0a0a] hover:text-white transition-colors shrink-0">
              편집
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <div className="space-y-6">
          <textarea
            value={form.content}
            onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
            rows={12}
            placeholder="위치 정보, 교통편, 주차 안내 등을 입력하세요"
            className="w-full border border-[#e5e5e5] p-4 text-sm leading-relaxed outline-none focus:border-[#0a0a0a] resize-none placeholder:text-[#ccc]"
          />

          {/* Image management */}
          <div>
            <p className="text-[11px] tracking-[0.2em] text-[#aaa] mb-3">이미지</p>
            <div className="flex gap-2 mb-3">
              <input type="url" value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="이미지 URL 입력"
                className="flex-1 border-b border-[#ddd] py-2 text-sm outline-none focus:border-[#0a0a0a] placeholder:text-[#ccc]" />
              <button onClick={addImageUrl} className="text-[11px] border border-[#0a0a0a] px-4 py-1 hover:bg-[#0a0a0a] hover:text-white transition-colors">추가</button>
            </div>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-[11px] text-[#aaa]">또는</span>
              <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleFileChange} className="hidden" />
              <button onClick={() => fileRef.current?.click()} className="text-[11px] border border-[#ddd] px-4 py-1.5 hover:bg-[#f8f8f8] transition-colors">
                파일 업로드
              </button>
            </div>
            {form.imageUrls.length > 0 && (
              <div className="grid grid-cols-3 gap-3">
                {form.imageUrls.map((url, i) => (
                  <div key={i} className="relative aspect-[4/3] overflow-hidden bg-[#f2f2f2]">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => removeImage(i)} className="absolute top-1 right-1 bg-white/90 text-red-400 text-[10px] w-5 h-5 flex items-center justify-center hover:bg-white shadow-sm">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={handleSave} className="bg-[#0a0a0a] text-white text-[11px] px-8 py-3 tracking-widest hover:bg-[#333] transition-colors">저장</button>
            <button onClick={() => { setEditing(false); setForm(data); }} className="border border-[#e5e5e5] text-[11px] px-8 py-3 tracking-widest hover:bg-[#f8f8f8] transition-colors">취소</button>
          </div>
        </div>
      ) : (
        <div>
          {/* Text content */}
          <div className="text-[14px] leading-[1.95] text-[#444] whitespace-pre-wrap mb-10">
            {data.content || <span className="text-[#ccc]">내용이 없습니다</span>}
          </div>

          {/* Images */}
          {data.imageUrls.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {data.imageUrls.map((url, i) => (
                <div key={i} className="overflow-hidden bg-[#f2f2f2] aspect-[4/3]">
                  <img src={url} alt={`위치 이미지 ${i + 1}`} className="w-full h-full object-cover hover:scale-[1.03] transition-transform duration-500" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
