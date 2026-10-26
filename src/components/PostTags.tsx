/** 공지사항 — 제목 앞 작은 표시(고른 공지 메시지 종류·센터·명절) */
export default function PostTags({ tags, className = '' }: { tags?: string[]; className?: string }) {
  if (!tags?.length) return null;
  return (
    <span className={`inline-flex flex-wrap gap-1 align-middle ${className}`}>
      {tags.map(t => <span key={t} className="text-[11px] leading-none px-1.5 py-1 rounded bg-[#eff6ff] text-[#1d4ed8] whitespace-nowrap">{t}</span>)}
    </span>
  );
}
