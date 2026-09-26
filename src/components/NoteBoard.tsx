import Link from 'next/link';
import { Post } from '@/lib/types';

// 메모 보드 — We재활생각·공지사항 목록. 디자인은 Claude Design 캔버스 "We재활생각"을 옮긴 것.
// 메모 3장마다 기울기·높이·겹침 순서가 반복된다.
const PATTERN = [
  { tilt: -4, tiltMobile: -2,   lift: 0,  layer: 1 },
  { tilt: 0,  tiltMobile: 1.5,  lift: 26, layer: 3 },
  { tilt: 4,  tiltMobile: -1.5, lift: -8, layer: 2 },
];

const ICONS = [
  // 새싹
  ['M20 34c-2-6 1-13 6-16 4-2 9-1 11 3 1 3 0 6-2 8', 'M22 22c3-4 8-6 12-4', 'M17 36c-1 3 0 6 3 7'],
  // 메모지와 연필
  ['M18 20h20v24H18z', 'M22 26h12M22 32h12M22 38h8', 'M34 16l8 8-6 6-8-8z'],
  // 전구
  ['M30 14c-8 0-13 6-13 13 0 5 3 8 5 11h16c2-3 5-6 5-11 0-7-5-13-13-13z', 'M25 38h10M27 43h6', 'M30 14v-4M20 20l-3-3M40 20l3-3'],
];

const toText = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

const excerpt = (text: string, max = 60) => (text.length > max ? `${text.slice(0, max).trim()}…` : text);

// 한국어 기준 1분에 약 500자
const readMinutes = (text: string) => Math.max(1, Math.round(text.length / 500));

const yearMonth = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
};

interface NoteProps {
  index: number;
  title: string;
  children: React.ReactNode;
}

function Note({ index, title, children }: NoteProps) {
  const p = PATTERN[index % PATTERN.length];
  const icon = ICONS[index % ICONS.length];
  return (
    <article
      className="note relative box-border w-[300px] min-h-[280px] md:min-h-[300px] px-[26px] pt-[28px] pb-[26px] bg-[#fdfdfc] border-[1.5px] border-[#1f3864]"
      style={{
        '--tilt': `${p.tilt}deg`,
        '--tilt-mobile': `${p.tiltMobile}deg`,
        '--lift': `${p.lift}px`,
        zIndex: p.layer,
      } as React.CSSProperties}
    >
      <div aria-hidden="true" className="absolute -top-[26px] -right-[18px] w-[60px] h-[60px] z-[5]">
        <svg viewBox="0 0 60 60" width="60" height="60" className="overflow-visible">
          <circle cx="30" cy="30" r="26" fill="#e1e6f2" />
          {icon.map(d => (
            <path key={d} d={d} fill="none" stroke="var(--brand)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
          ))}
        </svg>
      </div>
      <h2 className="font-serif font-bold text-[28px] leading-[1.3] text-[var(--brand)] mt-1.5 mb-3.5">{title}</h2>
      <hr className="border-0 border-t-[1.5px] border-[#1f3864] opacity-55 mb-4" />
      {children}
    </article>
  );
}

const linkCls =
  'inline-block text-[14px] font-bold text-[#2e4172] underline decoration-[1.5px] underline-offset-[3px] hover:opacity-75 transition-opacity';

export interface PinnedNote {
  title: string;
  desc: string;
}

interface Props {
  posts: Post[];
  /** 게시글 앞에 항상 붙는 메모 (링크 없음) */
  pinned?: PinnedNote;
  basePath: string;
  isAdmin: boolean;
  onDelete: (id: string) => void;
}

export default function NoteBoard({ posts, pinned, basePath, isAdmin, onDelete }: Props) {
  const offset = pinned ? 1 : 0;
  if (!pinned && posts.length === 0) {
    return <div className="py-24 text-center text-sm text-[#bbb] tracking-widest">등록된 게시물이 없습니다</div>;
  }
  return (
    <div className="max-w-[860px] mx-auto flex flex-col items-center md:flex-row md:flex-wrap md:justify-center md:items-start">
      {pinned && (
        <Note index={0} title={pinned.title}>
          <p className="text-[14px] leading-[1.7] text-[#2e4172]">{pinned.desc}</p>
        </Note>
      )}

      {posts.map((post, i) => {
        const text = toText(post.content);
        return (
          <Note key={post.id} index={i + offset} title={post.title}>
            <p className="text-[14px] leading-[1.7] text-[#2e4172] mb-[18px]">{excerpt(text)}</p>
            <p className="text-[13px] font-semibold text-[#2e4172] opacity-85 mb-3.5">
              {readMinutes(text)}분 · {yearMonth(post.createdAt)}
            </p>
            <div className="flex items-center justify-between">
              <Link href={`${basePath}/${post.id}`} className={linkCls}>읽어보기</Link>
              {isAdmin && (
                <button
                  onClick={() => onDelete(post.id)}
                  className="text-[11px] text-[#aaa] hover:text-red-400 transition-colors"
                >
                  삭제
                </button>
              )}
            </div>
          </Note>
        );
      })}
    </div>
  );
}
