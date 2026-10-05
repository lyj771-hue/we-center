'use client';

import { useState, useEffect, useRef } from 'react';
import { useAdmin } from '@/components/AdminContext';
import { getLocation, saveLocation } from '@/lib/store';
import { uploadImage } from '@/lib/imageUpload';
import { LOCATION } from '@/lib/content';
import PageShell, { PageTitle } from '@/components/PageShell';
import PhotoViewer from '@/components/PhotoViewer';

// 오시는길 — 센터별(수색 → 의정부)로 "이름 + 정보" 아래 지도 사진(누르면 크게)과 "네이버 지도에서 보기" 버튼.
// 센터 목록은 location_info.content에 JSON으로 저장한다. 페이지 제목·소개 문구·폭은 PageShell(page_settings)이 맡는다.
// (예전에 JSON에 같이 저장했던 heading/subtext는 그대로 두되 화면에는 쓰지 않는다)
// 예전처럼 글만 저장돼 있으면 센터 이름 줄을 기준으로 나눠서 보여준다.

interface CenterSection {
  name: string;
  info: string;
  imageUrl: string;
  /** 네이버 지도 공유 링크 (예: https://naver.me/...) */
  mapUrl?: string;
}

interface LocationPage {
  heading: string;
  subtext: string;
  sections: CenterSection[];
}

const DEFAULT_NAMES = ['은평구 수색센터', '의정부센터'];

function parsePage(content: string, imageUrls: string[]): LocationPage {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed?.sections)) {
      return {
        heading: parsed.heading ?? LOCATION.heading,
        subtext: parsed.subtext ?? LOCATION.subtext,
        sections: parsed.sections as CenterSection[],
      };
    }
  } catch {
    // 예전 형식(글 한 덩어리) — 아래에서 나눈다
  }
  return { heading: LOCATION.heading, subtext: LOCATION.subtext, sections: parseLegacySections(content, imageUrls) };
}

function parseLegacySections(content: string, imageUrls: string[]): CenterSection[] {
  const text = content.replace(/\r/g, '');
  const blocks = text.split(/\n\s*\n/);
  const pick = (keyword: string) =>
    blocks.filter(b => b.includes(keyword)).map(b => b.split('\n').slice(1).join('\n')).join('\n\n');
  return [
    { name: DEFAULT_NAMES[0], info: pick('수색'), imageUrl: imageUrls[0] ?? '' },
    { name: DEFAULT_NAMES[1], info: pick('의정부'), imageUrl: imageUrls[1] ?? '' },
  ];
}

export default function LocationPageView() {
  const { isAdmin } = useAdmin();
  const [page, setPage] = useState<LocationPage>({ heading: LOCATION.heading, subtext: LOCATION.subtext, sections: [] });
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<LocationPage>(page);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const fileRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    getLocation().then(d => {
      const p = parsePage(d.content, d.imageUrls);
      setPage(p);
      setForm(p);
    });
  }, []);

  const updateForm = (idx: number, patch: Partial<CenterSection>) =>
    setForm(f => ({ ...f, sections: f.sections.map((s, i) => (i === idx ? { ...s, ...patch } : s)) }));

  const handleFileChange = async (idx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingIdx(idx);
    try {
      updateForm(idx, { imageUrl: await uploadImage(file, 'location') });
    } catch {
      alert('사진 업로드에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setUploadingIdx(null);
    }
  };

  const handleSave = async () => {
    try {
      await saveLocation({
        content: JSON.stringify(form),
        imageUrls: form.sections.map(s => s.imageUrl).filter(Boolean),
      });
      setPage(form);
      setEditing(false);
    } catch {
      alert('저장에 실패했습니다. 다시 시도해 주세요.');
    }
  };

  return (
    <PageShell page="location" heading={LOCATION.heading} subtext={LOCATION.subtext} defaultWidth={768}>
    <div className="max-w-[var(--page-w)] mx-auto px-6 md:px-8 pt-8 pb-14 md:pt-14 fade-up">
      <PageTitle
        eyebrow={LOCATION.eyebrow}
        className="mb-12 md:mb-14"
        actions={isAdmin && !editing && (
          <button onClick={() => { setForm(page); setEditing(true); }}
            className="text-[11px] border border-[#0a0a0a] px-5 py-1.5 tracking-widest hover:bg-[#0a0a0a] hover:text-white transition-colors shrink-0">
            센터 정보 편집
          </button>
        )}
      />

      {editing ? (
        <div className="space-y-12">
          {form.sections.map((s, idx) => (
            <div key={idx} className="space-y-4 border-t border-[#e5e5e5] pt-8">
              <p className="text-[11px] tracking-[0.2em] text-[#aaa]">센터 {idx + 1}</p>
              <input
                type="text"
                value={s.name}
                onChange={e => updateForm(idx, { name: e.target.value })}
                placeholder="센터 이름 (예: 은평구 수색센터)"
                className="w-full border-b border-[#ddd] py-2 text-sm outline-none focus:border-[#0a0a0a] placeholder:text-[#ccc]"
              />
              <textarea
                value={s.info}
                onChange={e => updateForm(idx, { info: e.target.value })}
                rows={7}
                placeholder="주소, 전화번호, 교통편, 주차 안내 등을 입력하세요"
                className="w-full border border-[#e5e5e5] p-4 text-sm leading-relaxed outline-none focus:border-[#0a0a0a] resize-none placeholder:text-[#ccc]"
              />
              <input
                type="url"
                value={s.mapUrl ?? ''}
                onChange={e => updateForm(idx, { mapUrl: e.target.value.trim() })}
                placeholder="네이버 지도 링크 (네이버 지도 → 공유 → 링크 복사)"
                className="w-full border-b border-[#ddd] py-2 text-sm outline-none focus:border-[#0a0a0a] placeholder:text-[#ccc]"
              />
              <div>
                <p className="text-[11px] tracking-[0.2em] text-[#aaa] mb-2">지도 사진</p>
                {s.imageUrl && (
                  <div className="relative w-48 mb-2 overflow-hidden bg-[#f2f2f2]">
                    <img src={s.imageUrl} alt="" className="w-full h-auto" />
                    <button onClick={() => updateForm(idx, { imageUrl: '' })} aria-label="지도 사진 지우기"
                      className="absolute top-1 right-1 bg-white/90 text-red-400 text-[10px] w-5 h-5 flex items-center justify-center hover:bg-white shadow-sm">✕</button>
                  </div>
                )}
                <input ref={el => { fileRefs.current[idx] = el; }} type="file" accept="image/*"
                  onChange={e => handleFileChange(idx, e)} className="hidden" />
                <button onClick={() => fileRefs.current[idx]?.click()} disabled={uploadingIdx !== null}
                  className="text-[11px] border border-[#ddd] px-4 py-1.5 hover:bg-[#f8f8f8] transition-colors disabled:opacity-50">
                  {uploadingIdx === idx ? '업로드 중...' : s.imageUrl ? '사진 바꾸기' : '사진 선택'}
                </button>
              </div>
            </div>
          ))}

          <div className="flex gap-2 pt-2">
            <button onClick={handleSave} disabled={uploadingIdx !== null}
              className="bg-[#0a0a0a] text-white text-[11px] px-8 py-3 tracking-widest hover:bg-[#333] transition-colors disabled:opacity-50">저장</button>
            <button onClick={() => { setEditing(false); setForm(page); }}
              className="border border-[#e5e5e5] text-[11px] px-8 py-3 tracking-widest hover:bg-[#f8f8f8] transition-colors">취소</button>
          </div>
        </div>
      ) : (
        <div className="space-y-16 md:space-y-20">
          {page.sections.map((s, idx) => (
            <section key={idx}>
              <h2 className="font-serif font-bold text-[24px] md:text-[30px] leading-snug tracking-tight text-[var(--brand)] mb-4">{s.name}</h2>
              <div className="text-[14px] leading-[2] text-[#444] whitespace-pre-wrap mb-6">
                {s.info || <span className="text-[#ccc]">정보가 없습니다</span>}
              </div>
              {s.imageUrl && (
                <button type="button" onClick={() => setViewing(s.imageUrl)} aria-label={`${s.name} 지도 크게 보기`}
                  className="block w-full overflow-hidden bg-[#f2f2f2] cursor-zoom-in">
                  <img src={s.imageUrl} alt={`${s.name} 지도`} className="w-full h-auto block" />
                </button>
              )}
              {s.mapUrl && (
                <a href={s.mapUrl} target="_blank" rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-2 bg-[var(--brand)] text-white text-[14px] px-5 py-2.5 rounded-full hover:opacity-90 transition-opacity">
                  <span className="font-black text-[13px] leading-none bg-white text-[var(--brand)] w-5 h-5 rounded-[4px] flex items-center justify-center" style={{ fontFamily: 'Arial, sans-serif', WebkitTextStroke: 0 }}>N</span>
                  네이버 지도에서 보기
                </a>
              )}
            </section>
          ))}
        </div>
      )}
      {viewing && <PhotoViewer src={viewing} pan onClose={() => setViewing(null)} />}
    </div>
    </PageShell>
  );
}
