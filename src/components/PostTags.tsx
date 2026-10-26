import { CENTER_LABEL } from '@/lib/noticeAlimtalk';

// 지점(수색점·의정부점)만 보인다 — 예전에 같이 저장된 공지 메시지 종류·명절은 숨긴다
const CENTERS = new Set(Object.values(CENTER_LABEL));

/** 공지사항 — 제목 앞 작은 표시(고른 지점) */
export default function PostTags({ tags, className = '' }: { tags?: string[]; className?: string }) {
  const shown = (tags ?? []).filter(t => CENTERS.has(t));
  if (!shown.length) return null;
  return (
    <span className={`inline-flex flex-wrap gap-1 align-middle ${className}`}>
      {shown.map(t => <span key={t} className="text-[11px] leading-none px-1.5 py-1 rounded bg-[#eff6ff] text-[#1d4ed8] whitespace-nowrap">{t}</span>)}
    </span>
  );
}
