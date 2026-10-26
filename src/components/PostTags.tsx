import { DEFAULT_TEMPLATES } from '@/lib/messages';

// 공지 메시지 종류 이름은 보이지 않게 (예전에 같이 저장된 글도)
const KIND_LABELS = new Set(DEFAULT_TEMPLATES.filter(t => t.grp === 'notice_kind').map(t => t.label));

/** 공지사항 — 제목 앞 작은 표시(고른 센터·명절) */
export default function PostTags({ tags, className = '' }: { tags?: string[]; className?: string }) {
  const shown = (tags ?? []).filter(t => !KIND_LABELS.has(t));
  if (!shown.length) return null;
  return (
    <span className={`inline-flex flex-wrap gap-1 align-middle ${className}`}>
      {shown.map(t => <span key={t} className="text-[11px] leading-none px-1.5 py-1 rounded bg-[#eff6ff] text-[#1d4ed8] whitespace-nowrap">{t}</span>)}
    </span>
  );
}
