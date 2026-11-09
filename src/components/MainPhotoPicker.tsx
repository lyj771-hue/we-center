'use client';

import { extractImages } from '@/lib/postText';

// We슐랭 글쓰기 — 대표 사진 고르기. 본문에 넣은 사진들 중 하나를 누르면 그 사진이 목록 가운데 큰 사진,
// 나머지는 오른쪽 작은 사진이 된다. 고르지 않으면(또는 고른 사진을 본문에서 지우면) 본문 첫 사진.

/** 대표 사진 — 고른 사진이 본문에 있으면 그것, 아니면 본문 첫 사진 */
export const mainPhotoOf = (content: string, picked?: string) => {
  const images = extractImages(content);
  return picked && images.includes(picked) ? picked : images[0];
};

export default function MainPhotoPicker({ content, value, onChange }: { content: string; value?: string; onChange: (url: string) => void }) {
  const images = extractImages(content);
  const main = mainPhotoOf(content, value);
  return (
    <div className="mt-3">
      <p className="text-[11px] text-[#888] mb-1.5">대표 사진 <span className="text-[#aaa]">— 누르면 목록 가운데 큰 사진, 나머지는 옆 작은 사진이 돼요</span></p>
      {!images.length ? <p className="text-[11px] text-[#bbb]">본문에 사진을 넣으면 여기서 고를 수 있어요.</p> : (
        <div className="flex flex-wrap gap-2">
          {images.map(src => (
            <button key={src} type="button" onClick={() => onChange(src)} aria-pressed={src === main} aria-label={src === main ? '대표 사진' : '대표 사진으로 고르기'}
              className={`relative w-20 h-14 overflow-hidden rounded-md border-2 ${src === main ? 'border-[var(--brand)]' : 'border-transparent opacity-70 hover:opacity-100'}`}>
              <img src={src} alt="" className="w-full h-full object-cover" />
              {src === main && <span className="absolute left-0 top-0 bg-[var(--brand)] text-white text-[10px] px-1.5 py-0.5 rounded-br">대표</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
