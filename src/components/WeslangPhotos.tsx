'use client';

import { useRef, useState } from 'react';
import { uploadImage } from '@/lib/imageUpload';
import { extractImages } from '@/lib/postText';

// We슐랭 글쓰기 — 본문 없이 사진만. 사진을 여러 장 올리고, 하나를 눌러 대표 사진(목록 가운데 큰 사진)으로 고르고, ✕ 로 뺀다.
// 사진은 본문(content)에 <img> 로만 저장한다(예전 글과 같은 모양 — 목록·크게 보기가 본문 사진을 읽는다).

/** 대표 사진 — 고른 사진이 본문에 있으면 그것, 아니면 본문 첫 사진 */
export const mainPhotoOf = (content: string, picked?: string) => {
  const images = extractImages(content);
  return picked && images.includes(picked) ? picked : images[0];
};

/** 한 줄 메모 최대 글자 수 — 메모지가 사진 너비(680)를 넘지 않을 만큼 */
export const WESLANG_MEMO_MAX = 40;

/** 가게 주소 — 위치 칸(location)에 줄마다 하나(도로명 · 지번). 빈 줄은 뺀다 */
export const addressLines = (location?: string) => (location ?? '').split('\n').map(x => x.trim()).filter(Boolean);

/** 주소 두 칸 — 도로명 · 지번(하나만 적어도 된다). 위치 칸에 두 줄로 저장 */
export function AddressInputs({ value, onChange, className }: { value: string; onChange: (v: string) => void; className: string }) {
  const [road = '', lot = ''] = value.split('\n');
  const set = (i: 0 | 1, v: string) => onChange(i === 0 ? `${v}\n${lot}` : `${road}\n${v}`);
  return (
    <>
      <input type="text" placeholder="도로명 주소 (예: 서울 은평구 수색로 200)" value={road} onChange={e => set(0, e.target.value)} className={className} aria-label="도로명 주소" />
      <input type="text" placeholder="지번 주소 (선택, 예: 서울 은평구 수색동 1-1)" value={lot} onChange={e => set(1, e.target.value)} className={className} aria-label="지번 주소" />
    </>
  );
}

export const photosToContent = (srcs: string[]) => srcs.map(src => `<p><img src="${src.replace(/"/g, '&quot;')}"></p>`).join('');

export default function WeslangPhotos({ content, onChange, main, onMain }: {
  content: string; onChange: (content: string) => void;
  /** 대표 사진 — 고르지 않으면 첫 사진 */
  main?: string; onMain: (src: string) => void;
}) {
  const photos = extractImages(content);
  const current = mainPhotoOf(content, main);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const add = async (files: File[]) => {
    const imgs = files.filter(f => f.type.startsWith('image/'));
    if (!imgs.length) return;
    setUploading(true);
    try {
      const out: string[] = [];
      for (const f of imgs) out.push(await uploadImage(f, 'posts'));
      onChange(photosToContent([...photos, ...out]));
    } catch { alert('사진 업로드에 실패했어요. 다시 시도해 주세요.'); }
    finally { setUploading(false); }
  };
  const remove = (src: string) => onChange(photosToContent(photos.filter(p => p !== src)));

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[12px] text-[#888]">사진 <span className="text-[#aaa]">— 누르면 대표 사진(목록 가운데 큰 사진), 나머지는 옆 작은 사진</span></p>
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
          onChange={async e => { await add(Array.from(e.target.files ?? [])); if (fileRef.current) fileRef.current.value = ''; }} />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
          className="text-[12px] rounded-full border border-[var(--brand)] text-[var(--brand)] px-3 py-1.5 hover:bg-[#eef5fe] disabled:opacity-50">{uploading ? '올리는 중…' : '+ 사진 추가'}</button>
      </div>
      {!photos.length ? (
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
          className="w-full rounded-xl border border-dashed border-[#d4d4d8] py-10 text-[13px] text-[#999] hover:bg-[#fafafa]">{uploading ? '올리는 중…' : '사진을 골라 주세요 (여러 장 한 번에)'}</button>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {photos.map(src => (
            <div key={src} className={`relative aspect-[4/3] overflow-hidden rounded-lg border-2 ${src === current ? 'border-[var(--brand)]' : 'border-transparent'}`}>
              <button type="button" onClick={() => onMain(src)} aria-pressed={src === current} aria-label={src === current ? '대표 사진' : '대표 사진으로 고르기'} className="block w-full h-full">
                <img src={src} alt="" className="w-full h-full object-cover" />
              </button>
              {src === current && <span className="absolute left-0 top-0 bg-[var(--brand)] text-white text-[11px] px-2 py-0.5 rounded-br-lg">대표</span>}
              <button type="button" onClick={() => remove(src)} aria-label="사진 빼기"
                className="absolute right-1 top-1 w-7 h-7 rounded-full bg-black/55 text-white text-[14px] leading-none hover:bg-black/75">✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
