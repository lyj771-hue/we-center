'use client';

import { useState, useEffect } from 'react';
import { useAdmin } from '@/components/AdminContext';
import { CenterRoom } from '@/lib/types';
import { getRooms, addRoom, updateRoom, deleteRoom } from '@/lib/store';

const CENTERS = [
  { id: 'susaek'     as const, label: '수색 센터',   addr: '서울특별시 은평구' },
  { id: 'uijeongbu' as const, label: '의정부 센터', addr: '경기도 의정부시' },
];

export default function WeCenterPage() {
  const { isAdmin } = useAdmin();
  const [tab, setTab] = useState<'susaek' | 'uijeongbu'>('susaek');
  const [rooms, setRooms] = useState<CenterRoom[]>([]);
  const [editTarget, setEditTarget] = useState<CenterRoom | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', imageUrl: '' });

  const refresh = () => setRooms(getRooms(tab));
  useEffect(() => { refresh(); }, [tab]);

  const handleAdd = () => {
    if (!form.name.trim()) return;
    addRoom({ centerId: tab, name: form.name, description: form.description, imageUrl: form.imageUrl || undefined, order: rooms.length + 1 });
    setForm({ name: '', description: '', imageUrl: '' });
    setAdding(false);
    refresh();
  };

  const handleEdit = () => {
    if (!editTarget) return;
    updateRoom(editTarget.id, { name: form.name, description: form.description, imageUrl: form.imageUrl || undefined });
    setEditTarget(null);
    refresh();
  };

  const handleDelete = (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return;
    deleteRoom(id);
    refresh();
  };

  const openEdit = (r: CenterRoom) => {
    setEditTarget(r);
    setForm({ name: r.name, description: r.description, imageUrl: r.imageUrl ?? '' });
  };

  const isModal = adding || editTarget !== null;
  const activeCenter = CENTERS.find(c => c.id === tab)!;

  return (
    <div className="max-w-5xl mx-auto px-8 py-14 fade-up">
      {/* Page heading */}
      <div className="mb-14">
        <p className="text-[11px] tracking-[0.3em] text-[#aaa] uppercase mb-5">We 센터</p>
        <h1 className="display-heading mb-4">우리의 공간을 소개합니다</h1>
        <p className="text-[14px] text-[#666] leading-relaxed max-w-md">
          아이가 편안함을 느낄 수 있도록, 모든 공간을 세심하게 준비했습니다.
        </p>
      </div>

      {/* Center tabs */}
      <div className="flex items-end gap-0 mb-10 border-b border-[#e5e5e5]">
        {CENTERS.map(c => (
          <button
            key={c.id}
            onClick={() => setTab(c.id)}
            className={[
              'relative pb-3 mr-8 text-[14px] tracking-wide transition-colors',
              tab === c.id ? 'text-[#0a0a0a] font-medium' : 'text-[#aaa] hover:text-[#0a0a0a]',
            ].join(' ')}
          >
            {c.label}
            {tab === c.id && <span className="absolute bottom-0 left-0 w-full h-[1.5px] bg-[#0a0a0a]" />}
          </button>
        ))}
        {isAdmin && (
          <button
            onClick={() => { setAdding(true); setForm({ name: '', description: '', imageUrl: '' }); }}
            className="ml-auto mb-3 text-[11px] border border-[#0a0a0a] px-5 py-1.5 tracking-widest hover:bg-[#0a0a0a] hover:text-white transition-colors"
          >
            + 공간 추가
          </button>
        )}
      </div>

      {/* Center sub-label */}
      <p className="text-[12px] text-[#aaa] mb-8">{activeCenter.addr}</p>

      {/* Room grid */}
      {rooms.length === 0 ? (
        <div className="py-24 text-center text-sm text-[#ccc]">등록된 공간이 없습니다</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-10">
          {rooms.map(room => (
            <div key={room.id} className="group">
              <div className="aspect-[4/3] overflow-hidden bg-[#f0f0f0] mb-4 relative">
                {room.imageUrl ? (
                  <img src={room.imageUrl} alt={room.name}
                    className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-500 ease-out" />
                ) : (
                  <div className="w-full h-full img-placeholder flex items-center justify-center">
                    <span className="text-[#ccc] text-[11px] tracking-widest">이미지 없음</span>
                  </div>
                )}
                {isAdmin && (
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEdit(room)} className="bg-white/95 text-[10px] px-3 py-1 shadow-sm">수정</button>
                    <button onClick={() => handleDelete(room.id)} className="bg-white/95 text-[10px] px-3 py-1 shadow-sm text-red-400">삭제</button>
                  </div>
                )}
              </div>
              <p className="text-[13px] font-medium text-[#0a0a0a] mb-1.5">{room.name}</p>
              <p className="text-[12px] text-[#888] leading-[1.75]">{room.description}</p>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {isModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/20 backdrop-blur-sm px-4"
          onClick={() => { setAdding(false); setEditTarget(null); }}>
          <div className="bg-white border border-[#e5e5e5] w-full max-w-md p-8 shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <p className="text-[11px] tracking-[0.2em] text-[#888] mb-6">{editTarget ? '공간 수정' : '공간 추가'}</p>
            <div className="space-y-4">
              <input type="text" placeholder="공간 이름 (예: 대기실)" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border-b border-[#ddd] py-2 text-sm outline-none focus:border-[#0a0a0a] placeholder:text-[#ccc]" />
              <textarea placeholder="설명" value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={4}
                className="w-full border border-[#e5e5e5] p-3 text-sm outline-none focus:border-[#0a0a0a] resize-none placeholder:text-[#ccc]" />
              <input type="url" placeholder="이미지 URL (선택)" value={form.imageUrl}
                onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))}
                className="w-full border-b border-[#ddd] py-2 text-sm outline-none focus:border-[#0a0a0a] placeholder:text-[#ccc]" />
            </div>
            <div className="flex gap-2 mt-7">
              <button onClick={editTarget ? handleEdit : handleAdd}
                className="flex-1 bg-[#0a0a0a] text-white text-[11px] py-3 tracking-widest hover:bg-[#333] transition-colors">저장</button>
              <button onClick={() => { setAdding(false); setEditTarget(null); }}
                className="flex-1 border border-[#e5e5e5] text-[11px] py-3 tracking-widest hover:bg-[#f8f8f8] transition-colors">취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
