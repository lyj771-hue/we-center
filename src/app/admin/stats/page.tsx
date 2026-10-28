'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdmin } from '@/components/AdminContext';
import type { Schedule, ScheduleSummary, Teacher } from '@/lib/schedule';
import { getSchedule, getScheduleTeachers, listSchedules, publishLabel, scheduleRange, shortDay } from '@/lib/schedule';
import type { RaceData } from '@/lib/scheduleStats';
import { getRaceData, raceByGuardian } from '@/lib/scheduleStats';
import { getMembers } from '@/lib/store';
import { childLabel, getChildren } from '@/lib/timetable';

// 대시보드 · 스케줄 잡기 (전체 관리자만) — 수업스케쥴 게시글 목록, 누르면 그 글의 선착순 결과.
// 참여 보호자 수, 시간이 다 잡히기까지, 보호자마다 잡은 수 · 한발 늦음(눌렀는데 다른 분이 먼저) · 10분 안 취소 — 처음 누른 순서대로.
// 한발 늦음은 supabase/booking-misses.sql 을 실행한 뒤부터 쌓인다.

type CenterFilter = 'all' | 'eunpyeong' | 'uijeongbu';
const CENTER_LABEL = { eunpyeong: '수색', uijeongbu: '의정부' } as const;

/** 게시 후 걸린 시간 — "12초" · "3분 5초" · "1시간 2분" */
function since(fromIso: string, toIso: string) {
  const s = Math.max(0, Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 1000));
  if (s < 60) return `${s}초`;
  if (s < 3600) return `${Math.floor(s / 60)}분${s % 60 ? ` ${s % 60}초` : ''}`;
  return `${Math.floor(s / 3600)}시간${Math.floor((s % 3600) / 60) ? ` ${Math.floor((s % 3600) / 60)}분` : ''}`;
}
const startOf = (s: { publishAt?: string; createdAt: string }) => s.publishAt ?? s.createdAt;

export default function ScheduleStatsPage() {
  const { canSeeStats: isAdmin } = useAdmin();
  const [center, setCenter] = useState<CenterFilter>('all');
  const [list, setList] = useState<ScheduleSummary[]>([]);
  const [data, setData] = useState<RaceData | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Schedule | null>(null);
  const [failed, setFailed] = useState('');

  const load = useCallback(async () => {
    try {
      const all = (await listSchedules()).slice(0, 60);
      setList(all);
      setData(await getRaceData(all.map(s => s.id)));
      // 이름 — 아이 이름(번호), 없으면 관리자 닉네임 · 보호자 닉네임
      const [members, kids, t] = await Promise.all([getMembers().catch(() => []), getChildren().catch(() => []), getScheduleTeachers().catch(() => [])]);
      setNames(new Map(members.map(m => {
        const kid = kids.find(k => k.guardianUserId === m.userId);
        return [m.userId, kid ? childLabel(kid) : m.centerNickname || m.nickname];
      })));
      setTeachers(t);
      setFailed('');
    } catch (e) { setFailed((e as Error).message); }
  }, []);
  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);
  useEffect(() => { setDetail(null); if (selId) getSchedule(selId).then(setDetail).catch(() => {}); }, [selId]);

  const shown = list.filter(s => center === 'all' || s.center === center);
  const sel = list.find(s => s.id === selId) ?? null;
  const rows = useMemo(() => (data && sel ? raceByGuardian(data, sel.id) : []), [data, sel]);

  if (!isAdmin) return <p className="text-center text-[14px] text-[#aaa] py-32">전체 관리자만 볼 수 있는 화면이에요.</p>;

  const summaryOf = (id: string) => {
    if (!data) return null;
    const people = new Set([...data.books, ...data.misses].filter(r => r.scheduleId === id).map(r => r.userId));
    const got = data.books.filter(r => r.scheduleId === id && !r.cancelledAt).length;
    const missed = data.misses.filter(r => r.scheduleId === id).length;
    return { people: people.size, got, total: data.slotCount.get(id) ?? 0, missed };
  };
  const tab = (c: CenterFilter, label: string) => (
    <button key={c} type="button" onClick={() => setCenter(c)}
      className={`text-[13px] px-4 py-2 border transition-colors ${center === c ? 'border-[var(--brand)] bg-[var(--brand)] text-white' : 'border-[#e5e5e5] text-[#555] hover:bg-[#f8f8f8]'}`}>{label}</button>
  );

  return (
    <div className="px-5 md:px-8 pt-8 pb-14 md:pt-14 fade-up max-w-[1024px] mx-auto">
      <h1 className="display-heading mb-2">스케줄 잡기</h1>
      <p className="text-[13px] text-[#888] mb-6">수업스케쥴 게시글마다 보호자들이 몇 개를 잡았고, 몇 번 한발 늦었는지(눌렀는데 다른 분이 먼저 잡음) 봐요.</p>
      {failed && <p className="text-[13px] text-red-400 mb-4">불러오지 못했어요. ({failed})</p>}

      {sel ? (
        <Detail schedule={sel} full={detail} rows={rows} names={names} teachers={teachers} data={data} onBack={() => setSelId(null)} />
      ) : (
        <>
          <div className="flex gap-1.5 mb-5">{tab('all', '전체')}{tab('eunpyeong', '수색')}{tab('uijeongbu', '의정부')}</div>
          {shown.length === 0 ? (
            <p className="py-20 text-center text-[14px] text-[#bbb]">수업스케쥴 게시글이 없어요.</p>
          ) : (
            <ul className="divide-y divide-[#f0f0f0] border-y border-[#f0f0f0]">
              {shown.map(s => {
                const sum = summaryOf(s.id);
                return (
                  <li key={s.id}>
                    <button type="button" onClick={() => { setSelId(s.id); window.scrollTo({ top: 0 }); }}
                      className={`w-full text-left flex flex-wrap items-center gap-x-4 gap-y-1 py-3.5 px-2 hover:bg-[#fafafa] ${s.hiddenAt ? 'opacity-50' : ''}`}>
                      <span className="text-[11px] px-1.5 rounded border border-[#e5e5e5] text-[#666] shrink-0">{CENTER_LABEL[s.center]}</span>
                      <span className="flex-1 min-w-[180px]">
                        <span className="block text-[14px] text-[#27272a] truncate">{s.title}</span>
                        <span className="block text-[12px] text-[#999]">{scheduleRange(s)} · {publishLabel(startOf(s))} 게시</span>
                      </span>
                      {sum && (
                        <span className="flex gap-3 text-[12px] text-[#555] tabular-nums shrink-0">
                          <span>참여 <b className="font-medium text-[#27272a]">{sum.people}</b>명</span>
                          <span>잡힘 <b className="font-medium text-[#27272a]">{sum.got}</b>/{sum.total}</span>
                          <span className={sum.missed ? 'text-[#e11d48]' : ''}>한발 늦음 <b className="font-medium">{sum.missed}</b></span>
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function Detail({ schedule, full, rows, names, teachers, data, onBack }: {
  schedule: ScheduleSummary; full: Schedule | null; rows: ReturnType<typeof raceByGuardian>; names: Map<string, string>;
  teachers: Teacher[]; data: RaceData | null; onBack: () => void;
}) {
  const start = startOf(schedule);
  const books = (data?.books ?? []).filter(r => r.scheduleId === schedule.id);
  const misses = (data?.misses ?? []).filter(r => r.scheduleId === schedule.id);
  const total = data?.slotCount.get(schedule.id) ?? 0;
  const got = books.filter(r => !r.cancelledAt).length;
  const firstBook = books.map(r => r.at).sort()[0];
  // 다 잡히기까지 — 지금 모든 시간이 잡혀 있으면, 마지막으로 잡힌 시각까지
  const allGone = total > 0 && got >= total;
  const lastBook = books.filter(r => !r.cancelledAt).map(r => r.at).sort().pop();
  // 가장 치열했던 시간 — 한발 늦음이 많은 칸
  const contested = [...misses.reduce((m, r) => m.set(r.slotId ?? '', (m.get(r.slotId ?? '') ?? 0) + 1), new Map<string, number>())]
    .filter(([id]) => id).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const slotText = (id: string) => {
    const s = full?.slots.find(x => x.id === id);
    if (!s) return '지워진 시간';
    return `${teachers.find(t => t.id === s.teacherId)?.name ?? ''} 선생님 ${shortDay(s.day)} ${s.time}`;
  };
  const card = 'rounded-xl border border-[#eee] bg-white px-4 py-3';
  const stat = (label: string, value: React.ReactNode, sub?: string) => (
    <div className={card}>
      <p className="text-[12px] text-[#888]">{label}</p>
      <p className="text-[22px] text-[#27272a] tabular-nums leading-[1.4]">{value}</p>
      {sub && <p className="text-[11px] text-[#aaa]">{sub}</p>}
    </div>
  );

  return (
    <div className="space-y-6">
      <button type="button" onClick={onBack} className="text-[12px] text-[#999] hover:text-[#333]">← 게시글 목록</button>
      <div>
        <p className="text-[12px] text-[#999]">{CENTER_LABEL[schedule.center]} · {scheduleRange(schedule)} · {publishLabel(start)} 게시</p>
        <h2 className="text-[20px] text-[var(--brand)] leading-[1.4] mt-1">{schedule.title}</h2>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {stat('참여 보호자', <>{rows.length}<span className="text-[13px] text-[#888]">명</span></>, '잡았거나 한발 늦은 보호자')}
        {stat('잡힌 시간', <>{got}<span className="text-[13px] text-[#888]"> / {total}</span></>, total ? `${Math.round((got / total) * 100)}%` : undefined)}
        {stat('한발 늦음', <>{misses.length}<span className="text-[13px] text-[#888]">번</span></>, `${new Set(misses.map(r => r.slotId)).size}개 시간에서`)}
        {stat(allGone ? '다 잡히기까지' : '첫 신청까지', allGone && lastBook ? since(start, lastBook) : firstBook ? since(start, firstBook) : '–', allGone ? '게시 후 마지막 시간이 잡힐 때까지' : '게시 후')}
      </div>

      <section>
        <h3 className="text-[15px] text-[#27272a] mb-2">보호자별 <span className="text-[12px] text-[#999]">(처음 누른 순서)</span></h3>
        {rows.length === 0 ? (
          <p className="py-10 text-center text-[13px] text-[#bbb]">아직 신청한 보호자가 없어요.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] tabular-nums">
              <thead>
                <tr className="text-[12px] text-[#888] border-b border-[#eee]">
                  <th className="py-2 pr-2 text-left font-normal w-8">#</th>
                  <th className="py-2 pr-2 text-left font-normal">이름</th>
                  <th className="py-2 px-2 text-right font-normal">잡은 수</th>
                  <th className="py-2 px-2 text-right font-normal">한발 늦음</th>
                  <th className="py-2 px-2 text-right font-normal">10분 안 취소</th>
                  <th className="py-2 px-2 text-right font-normal">센터 취소</th>
                  <th className="py-2 pl-2 text-right font-normal whitespace-nowrap">처음 누른 때</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.userId} className="border-b border-[#f4f4f5]">
                    <td className="py-2 pr-2 text-[#aaa]">{i + 1}</td>
                    <td className="py-2 pr-2 text-[#27272a]">{names.get(r.userId) ?? '(탈퇴한 보호자)'}</td>
                    <td className="py-2 px-2 text-right">{r.got}</td>
                    <td className={`py-2 px-2 text-right ${r.missed ? 'text-[#e11d48]' : 'text-[#ccc]'}`}>{r.missed}</td>
                    <td className={`py-2 px-2 text-right ${r.freeCancelled ? '' : 'text-[#ccc]'}`}>{r.freeCancelled}</td>
                    <td className={`py-2 px-2 text-right ${r.adminCancelled ? '' : 'text-[#ccc]'}`}>{r.adminCancelled}</td>
                    <td className="py-2 pl-2 text-right text-[#666] whitespace-nowrap">게시 후 {since(start, r.firstAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {contested.length > 0 && (
        <section>
          <h3 className="text-[15px] text-[#27272a] mb-2">가장 치열했던 시간</h3>
          <ul className="space-y-1.5">
            {contested.map(([id, n]) => {
              const winner = full?.slots.find(x => x.id === id)?.bookedBy;
              return (
                <li key={id} className="flex flex-wrap items-center gap-x-3 text-[13px]">
                  <span className="text-[#27272a]">{slotText(id)}</span>
                  <span className="text-[#e11d48]">한발 늦음 {n}명</span>
                  {winner && <span className="text-[12px] text-[#888]">→ {names.get(winner) ?? '보호자'}</span>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
