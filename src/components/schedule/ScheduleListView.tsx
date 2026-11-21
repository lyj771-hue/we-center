'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdmin } from '@/components/AdminContext';
import { useMember } from '@/components/MemberContext';
import ScheduleGate from '@/components/schedule/ScheduleGate';
import ScheduleEditor from '@/components/schedule/ScheduleEditor';
import type { ScheduleSummary, Teacher } from '@/lib/schedule';
import { getScheduleTeachers, isPublished, listSchedules, publishLabel, scheduleDays, scheduleRange, setScheduleHidden, thisMonday } from '@/lib/schedule';
import { askConfirm, showAlert } from '@/lib/dialog';

// 수업스케쥴 목록 — 기타 메뉴처럼 제목 목록. 누르면 /schedule/[id] 에서 시간을 보고 신청한다.
// 관리자는 여기서 새 스케쥴을 올리고 내린다(숨기기 — 신청 기록은 그대로).
// 예약 게시 글은 게시 전엔 보호자 목록에 안 나온다(DB 정책). 관리자·선생님에겐 "게시 예정" 표시.

const fmt = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};

/** 수업스케쥴 — 지점(수색/의정부)마다 메뉴가 따로. 보호자는 가입·승인된 지점만, 선생님은 두 지점 모두 */
export default function ScheduleListView({ center }: { center: 'eunpyeong' | 'uijeongbu' }) {
  const router = useRouter();
  const { isAdmin } = useAdmin();
  const { canUse, teacher } = useMember();
  const canView = isAdmin || !!teacher || canUse(center);
  const [items, setItems] = useState<ScheduleSummary[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState(false);
  // 숨긴 글은 관리자에게만 — 목록 아래 '숨긴 글' 칸에 접어서 모은다
  const shownItems = items.filter(s => s.center === center && !s.hiddenAt);
  const hiddenItems = isAdmin ? items.filter(s => s.center === center && s.hiddenAt) : [];
  const [hiddenOpen, setHiddenOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [list, t] = await Promise.all([listSchedules(), getScheduleTeachers()]);
      setItems(list);
      setTeachers(t);
    } catch {
      // 권한이 없거나 표가 아직 없으면 빈 목록
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { if (canView) load(); }, [canView, load]);

  // 내리기 — 지우지 않고 숨긴다(보호자 목록에서만 안 보이고, 신청 수업·기록은 시간표·마이페이지에 그대로)
  const handleHide = async (s: ScheduleSummary) => {
    if (!(await askConfirm(`"${s.title}"을(를) 내릴까요?\n보호자 목록에서만 안 보이고, 신청한 수업은 시간표·마이페이지에 그대로 남아요.`))) return;
    try { await setScheduleHidden(s.id, true); load(); }
    catch (e) { showAlert(`내리지 못했어요 — SQL(supabase/schedule-hide.sql)을 실행했는지 확인해 주세요.\n${(e as Error).message}`); }
  };
  const unhide = async (s: ScheduleSummary) => {
    try { await setScheduleHidden(s.id, false); load(); }
    catch (e) { showAlert(`처리하지 못했어요.\n${(e as Error).message}`); }
  };

  // 지난 스케쥴(마지막 날이 이번 주 월요일보다 전)은 흐리게
  const isPast = (s: ScheduleSummary) => {
    const days = scheduleDays(s);
    return days[days.length - 1] < thisMonday();
  };

  // 목록 한 줄
  const row = (s: ScheduleSummary, n: number) => (
    <div key={s.id} className={`group flex items-center gap-5 py-4 hover:bg-[#fafafa] -mx-5 md:-mx-8 px-5 md:px-8 transition-colors ${isPast(s) || s.hiddenAt ? 'opacity-50' : ''}`}>
      <span className="text-[11px] text-[#ccc] w-7 shrink-0 tabular-nums">{String(n).padStart(2, '0')}</span>
      <Link href={`/schedule/${s.id}`} className="flex-1 min-w-0 block">
        <span className="text-[14px] leading-[1.8] group-hover:underline underline-offset-2 block truncate">{s.hiddenAt && <span className="mr-1.5 text-[11px] text-[#888] border border-[#ddd] rounded px-1 no-underline">숨김</span>}{!isPublished(s) && <span className="mr-1.5 text-[11px] text-[#b45309] bg-[#fef3c7] rounded px-1 no-underline">게시 예정</span>}{s.title}</span>
        <span className="text-[12px] leading-[2] pb-0.5 text-[#999] block truncate mt-1">{scheduleRange(s)}{s.publishAt && !isPublished(s) && <span className="text-[#b45309]"> · {publishLabel(s.publishAt)} 게시</span>}</span>
      </Link>
      <span className="text-[11px] text-[#bbb] shrink-0">{fmt(s.publishAt ?? s.createdAt)}</span>
      {isAdmin && (
        s.hiddenAt
          ? <button onClick={() => unhide(s)} className="text-[11px] text-[#888] hover:text-[var(--brand)] shrink-0 transition-colors">다시 보이기</button>
          : <button onClick={() => handleHide(s)} className="text-[11px] text-[#ccc] hover:text-red-400 shrink-0 transition-colors">내리기</button>
      )}
    </div>
  );

  return (
    <div className="max-w-[1024px] mx-auto px-5 md:px-8 pt-8 pb-14 md:pt-14 fade-up">
      <h1 className="display-heading mb-10 md:mb-12">수업스케쥴 <span className="text-[0.7em] text-[#888]">({center === 'uijeongbu' ? '의정부' : '수색'})</span></h1>

      <ScheduleGate center={center}>
        {creating ? (
          <ScheduleEditor
            teachers={teachers}
            center={center}
            onTeachersChanged={async () => setTeachers(await getScheduleTeachers())}
            onClose={id => { setCreating(false); if (id) router.push(`/schedule/${id}`); }}
          />
        ) : (
          <section>
            <div className="flex items-center justify-between mb-10">
              <p className="text-[11px] tracking-[0.2em] text-[#aaa]">총 {shownItems.length}건</p>
              {isAdmin && (
                <button onClick={() => setCreating(true)}
                  className="text-[11px] border border-[#0a0a0a] px-5 py-1.5 tracking-widest hover:bg-[#0a0a0a] hover:text-white transition-colors">
                  + 새 스케쥴
                </button>
              )}
            </div>

            {loaded && shownItems.length === 0 && !hiddenItems.length ? (
              <div className="py-24 text-center text-sm text-[#ccc] tracking-widest">아직 올라온 수업 스케쥴이 없어요</div>
            ) : (
              <div className="divide-y divide-[#f0f0f0]">
                {shownItems.map((s, i) => row(s, shownItems.length - i))}
              </div>
            )}
            {/* 숨긴 글 — 관리자만, 처음엔 접혀 있다 */}
            {hiddenItems.length > 0 && (
              <div className="mt-10 border-t border-[#f0f0f0] pt-4">
                <button type="button" onClick={() => setHiddenOpen(v => !v)} aria-expanded={hiddenOpen}
                  className="text-[12px] text-[#888] hover:text-[var(--brand)] transition-colors">
                  {hiddenOpen ? '▾' : '▸'} 숨긴 글 {hiddenItems.length}건
                </button>
                {hiddenOpen && <div className="mt-2 divide-y divide-[#f0f0f0]">{hiddenItems.map((s, i) => row(s, hiddenItems.length - i))}</div>}
              </div>
            )}
          </section>
        )}
      </ScheduleGate>
    </div>
  );
}
