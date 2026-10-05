'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdmin } from '@/components/AdminContext';
import { useMember } from '@/components/MemberContext';
import ScheduleGate from '@/components/schedule/ScheduleGate';
import ScheduleEditor from '@/components/schedule/ScheduleEditor';
import type { ScheduleSummary, Teacher } from '@/lib/schedule';
import { deleteSchedule, getTeachers, listSchedules, scheduleDays, scheduleRange, thisMonday } from '@/lib/schedule';

// 수업스케쥴 목록 — 기타 메뉴처럼 제목 목록. 누르면 /schedule/[id] 에서 시간을 보고 신청한다.
// 관리자는 여기서 새 스케쥴을 올리고 지운다.

const fmt = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};

export default function ScheduleListPage() {
  const router = useRouter();
  const { isAdmin } = useAdmin();
  const { userId, profile } = useMember();
  const canView = isAdmin || (!!userId && !!profile?.approvedAt);
  const [items, setItems] = useState<ScheduleSummary[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const [list, t] = await Promise.all([listSchedules(), getTeachers()]);
      setItems(list);
      setTeachers(t);
    } catch {
      // 권한이 없거나 표가 아직 없으면 빈 목록
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { if (canView) load(); }, [canView, load]);

  const handleDelete = async (s: ScheduleSummary) => {
    if (!confirm(`"${s.title}"을(를) 지울까요?\n신청 기록도 모두 지워져요.`)) return;
    try { await deleteSchedule(s.id); load(); }
    catch { alert('지우지 못했어요. 다시 시도해 주세요.'); }
  };

  // 지난 스케쥴(마지막 날이 이번 주 월요일보다 전)은 흐리게
  const isPast = (s: ScheduleSummary) => {
    const days = scheduleDays(s);
    return days[days.length - 1] < thisMonday();
  };

  return (
    <div className="max-w-[768px] mx-auto px-5 md:px-8 pt-8 pb-14 md:pt-14 fade-up">
      <h1 className="display-heading mb-10 md:mb-12">수업스케쥴</h1>

      <ScheduleGate>
        {creating ? (
          <ScheduleEditor
            teachers={teachers}
            onTeachersChanged={async () => setTeachers(await getTeachers())}
            onClose={id => { setCreating(false); if (id) router.push(`/schedule/${id}`); }}
          />
        ) : (
          <section>
            <div className="flex items-center justify-between mb-10">
              <p className="text-[11px] tracking-[0.2em] text-[#aaa]">총 {items.length}건</p>
              {isAdmin && (
                <button onClick={() => setCreating(true)}
                  className="text-[11px] border border-[#0a0a0a] px-5 py-1.5 tracking-widest hover:bg-[#0a0a0a] hover:text-white transition-colors">
                  + 새 스케쥴
                </button>
              )}
            </div>

            {loaded && items.length === 0 ? (
              <div className="py-24 text-center text-sm text-[#ccc] tracking-widest">아직 올라온 수업 스케쥴이 없어요</div>
            ) : (
              <div className="divide-y divide-[#f0f0f0]">
                {items.map((s, i) => (
                  <div key={s.id} className={`group flex items-center gap-5 py-4 hover:bg-[#fafafa] -mx-5 md:-mx-8 px-5 md:px-8 transition-colors ${isPast(s) ? 'opacity-50' : ''}`}>
                    <span className="text-[11px] text-[#ccc] w-7 shrink-0 tabular-nums">{String(items.length - i).padStart(2, '0')}</span>
                    <Link href={`/schedule/${s.id}`} className="flex-1 min-w-0 block">
                      <span className="text-[14px] leading-[1.8] group-hover:underline underline-offset-2 block truncate">{s.title}</span>
                      <span className="text-[12px] leading-[2] pb-0.5 text-[#999] block truncate mt-1">{scheduleRange(s)}</span>
                    </Link>
                    <span className="text-[11px] text-[#bbb] shrink-0">{fmt(s.createdAt)}</span>
                    {isAdmin && (
                      <button onClick={() => handleDelete(s)} className="text-[11px] text-[#ccc] hover:text-red-400 shrink-0 transition-colors">삭제</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </ScheduleGate>
    </div>
  );
}
