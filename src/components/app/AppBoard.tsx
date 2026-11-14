import PostBoard from '@/components/PostBoard';
import PostDetail from '@/components/PostDetail';
import ScheduleGate from '@/components/schedule/ScheduleGate';
import type { Category } from '@/lib/types';

// 보호자 앱 — 홈페이지 게시판(공지사항·We재활생각·We당근당근·We슐랭)을 앱 안에서. 글을 눌러도 앱 안(/app/site/...)에 머문다

type Variant = 'list' | 'notes' | 'carrot' | 'weslang';

export function AppBoardList({ category, slug, title, variant, banner }: { category: Category; slug: string; title: string; variant?: Variant; banner?: React.ReactNode }) {
  return (
    <div className="space-y-4 [-webkit-text-stroke:0]">
      {banner}
      <h1 className="px-1 text-[19px] text-[var(--brand)]">{title}</h1>
      <div className="bg-white rounded-[18px] px-[18px] py-3">
        <ScheduleGate view><PostBoard category={category} basePath={`/app/site/${slug}`} variant={variant} /></ScheduleGate>
      </div>
    </div>
  );
}

export function AppBoardPost({ category, slug, id, backLabel }: { category: Category; slug: string; id: string; backLabel: string }) {
  return (
    <div className="bg-white rounded-[18px] px-[18px] py-5 [-webkit-text-stroke:0]">
      <ScheduleGate view><PostDetail category={category} id={id} backHref={`/app/site/${slug}`} backLabel={backLabel} /></ScheduleGate>
    </div>
  );
}
