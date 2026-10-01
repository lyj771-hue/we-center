'use client';

import { useState, useEffect, useRef } from 'react';
import { useAdmin } from './AdminContext';
import { PaymentMethod } from '@/lib/types';
import { getPaymentMethods, addPaymentMethod, updatePaymentMethod, deletePaymentMethod } from '@/lib/store';
import { uploadImage } from '@/lib/imageUpload';

// 결제정보 카드 목록 — 왼쪽 카드 사진, 오른쪽 이름·설명.
// 관리자는 추가·수정(사진·이름·설명)·삭제·순서 변경(↑↓)을 할 수 있다.

const emptyForm = { name: '', description: '', imageUrl: '' };

function CardPlaceholder() {
  return (
    <div className="w-full h-full bg-[#eef6fe] flex items-center justify-center">
      <svg width="40%" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <line x1="2" y1="10" x2="22" y2="10" />
        <line x1="6" y1="15" x2="10" y2="15" />
      </svg>
    </div>
  );
}

export default function PaymentBoard() {
  const { isAdmin } = useAdmin();
  const [items, setItems] = useState<PaymentMethod[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [editTarget, setEditTarget] = useState<PaymentMethod | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [uploading, setUploading] = useState(false);
  const [moving, setMoving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    try {
      setItems(await getPaymentMethods());
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  };
  useEffect(() => { refresh(); }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImage(file, 'payment');
      setForm(f => ({ ...f, imageUrl: url }));
    } catch {
      alert('사진 업로드에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const closeModal = () => { setAdding(false); setEditTarget(null); };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    try {
      if (editTarget) {
        await updatePaymentMethod(editTarget.id, { name: form.name, description: form.description, imageUrl: form.imageUrl || undefined });
      } else {
        await addPaymentMethod({ name: form.name, description: form.description, imageUrl: form.imageUrl || undefined, order: items.length + 1 });
      }
      closeModal();
      refresh();
    } catch {
      alert('저장에 실패했습니다. 다시 시도해 주세요.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return;
    await deletePaymentMethod(id);
    refresh();
  };

  // 한 칸 위(-1)/아래(+1)로 옮기고, 화면 순서대로 번호를 다시 매겨 저장한다
  const handleMove = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (moving || target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
    setMoving(true);
    try {
      await Promise.all(
        next.map((m, i) => (m.order === i + 1 ? null : updatePaymentMethod(m.id, { order: i + 1 }))).filter(Boolean)
      );
    } catch {
      alert('순서 변경에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setMoving(false);
      refresh();
    }
  };

  const openEdit = (m: PaymentMethod) => {
    setEditTarget(m);
    setForm({ name: m.name, description: m.description, imageUrl: m.imageUrl ?? '' });
  };

  const isModal = adding || editTarget !== null;
  const smallBtn = 'text-[10px] border border-[#e5e5e5] px-2.5 py-1 hover:bg-[#f8f8f8] disabled:opacity-30';

  return (
    <section>
      {isAdmin && (
        <div className="flex justify-end mb-6">
          <button
            onClick={() => { setAdding(true); setForm(emptyForm); }}
            className="text-[11px] border border-[#0a0a0a] px-5 py-1.5 tracking-widest hover:bg-[#0a0a0a] hover:text-white transition-colors"
          >
            + 결제 수단 추가
          </button>
        </div>
      )}

      {loadError ? (
        <div className="py-24 text-center text-sm text-[#ccc]">결제 정보를 불러오지 못했습니다</div>
      ) : items.length === 0 ? (
        <div className="py-24 text-center text-sm text-[#ccc]">등록된 결제 수단이 없습니다</div>
      ) : (
        <div className="border-b border-[#f0f0f0]">
          {items.map((m, index) => (
            <div key={m.id} className="flex items-start gap-4 md:gap-10 py-6 md:py-10 border-t border-[#f0f0f0]">
              <div className="w-32 md:w-[300px] shrink-0 aspect-[856/540] rounded-lg md:rounded-[14px] overflow-hidden shadow-[0_2px_6px_rgba(0,0,0,0.08),0_10px_24px_rgba(0,0,0,0.06)]">
                {m.imageUrl ? (
                  <img src={m.imageUrl} alt={`${m.name} 사진`} className="w-full h-full object-cover" />
                ) : (
                  <CardPlaceholder />
                )}
              </div>
              <div className="flex-1 min-w-0 md:pt-2">
                <div className="flex items-start justify-between gap-3 mb-2 md:mb-3">
                  <span className="text-[10px] tracking-[0.3em] text-[#ccc]">{String(index + 1).padStart(2, '0')}</span>
                  {isAdmin && (
                    <div className="flex flex-wrap justify-end gap-1">
                      <button onClick={() => handleMove(index, -1)} disabled={moving || index === 0}
                        aria-label={`${m.name} 위로 옮기기`} className={smallBtn}>↑</button>
                      <button onClick={() => handleMove(index, 1)} disabled={moving || index === items.length - 1}
                        aria-label={`${m.name} 아래로 옮기기`} className={smallBtn}>↓</button>
                      <button onClick={() => openEdit(m)} className={smallBtn}>수정</button>
                      <button onClick={() => handleDelete(m.id)} className="text-[10px] border border-red-100 text-red-400 px-2.5 py-1 hover:bg-red-50">삭제</button>
                    </div>
                  )}
                </div>
                <h2 className="font-serif font-bold text-[17px] md:text-[22px] leading-snug tracking-tight text-[var(--brand)] mb-2 md:mb-3">{m.name}</h2>
                {m.description && (
                  <p className="text-[13px] text-[#666] leading-[1.8] whitespace-pre-line">{m.description}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {isModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/20 backdrop-blur-sm px-4" onClick={closeModal}>
          <div className="bg-white border border-[#e5e5e5] w-full max-w-md p-8 shadow-2xl" onClick={e => e.stopPropagation()}>
            <p className="text-[11px] tracking-[0.2em] text-[#888] mb-6">{editTarget ? '결제 수단 수정' : '결제 수단 추가'}</p>
            <div className="space-y-4">
              <input type="text" placeholder="이름 (예: 바우처)" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border-b border-[#ddd] py-2 text-sm outline-none focus:border-[#0a0a0a] placeholder:text-[#ccc]" />
              <textarea placeholder="설명 (줄바꿈 그대로 보여요)" value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={6}
                className="w-full border border-[#e5e5e5] p-3 text-sm outline-none focus:border-[#0a0a0a] resize-none placeholder:text-[#ccc]" />
              <div>
                <p className="text-[11px] tracking-[0.2em] text-[#aaa] mb-2">카드 사진 (선택)</p>
                {form.imageUrl && (
                  <div className="relative w-40 aspect-[856/540] overflow-hidden rounded-md bg-[#f2f2f2] mb-2">
                    <img src={form.imageUrl} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => setForm(f => ({ ...f, imageUrl: '' }))} aria-label="사진 지우기"
                      className="absolute top-1 right-1 bg-white/90 text-red-400 text-[10px] w-5 h-5 flex items-center justify-center hover:bg-white shadow-sm">✕</button>
                  </div>
                )}
                <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                <button onClick={() => fileRef.current?.click()} disabled={uploading}
                  className="text-[11px] border border-[#ddd] px-4 py-1.5 hover:bg-[#f8f8f8] transition-colors disabled:opacity-50">
                  {uploading ? '업로드 중...' : form.imageUrl ? '사진 바꾸기' : '사진 선택'}
                </button>
              </div>
            </div>
            <div className="flex gap-2 mt-7">
              <button onClick={handleSave} disabled={uploading}
                className="flex-1 bg-[#0a0a0a] text-white text-[11px] py-3 tracking-widest hover:bg-[#333] transition-colors disabled:opacity-50">저장</button>
              <button onClick={closeModal}
                className="flex-1 border border-[#e5e5e5] text-[11px] py-3 tracking-widest hover:bg-[#f8f8f8] transition-colors">취소</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
