'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAdmin } from '@/components/AdminContext';
import { useMember } from '@/components/MemberContext';
import type { Teacher } from '@/lib/schedule';
import { addDays, getHolidayNames, getTeachers, HIDDEN_TEACHERS, parseYmd, toYmd } from '@/lib/schedule';
import type { Center } from '@/lib/timetable';
import { PAY_METHODS, ROW_LABEL, SUNDAY_TEACHERS, defaultPayMethod, rowsForDay, worksAt } from '@/lib/timetable';
import type { TeacherLesson } from '@/lib/teacher';
import { getPostedDays, getPostedSlots, getTeacherLessons, teacherPostSlots, teacherSetOff } from '@/lib/teacher';
import { askConfirm, showAlert } from '@/lib/dialog';
import { onScheduleChanged } from '@/lib/sync';

// 시간표 보기(선생님) — 카카오로 로그인해서 선생님 인증된 계정만. 다른 칸은 보기만.
// 선생님은 내 빈타임 칸만: [빈 수업 올리기]로 빈칸·x 칸 여러 개를 골라 그 날짜의 기존 수업스케쥴 글에 더하고(보호자 스케줄 수정·관리자 알림톡),
// 칸을 눌러 x(수업 안 함)로 바꾸거나 풀 수 있다 — x로 바꾸면 아직 신청 없는 게시 시간은 글에서 바로 빠진다(supabase/teacher-schedule.sql).
// 날짜마다 센터 선생님 × 시간, 선생님마다 고정 · 빈타임 두 칸. 공휴일엔 고정 수업을 빼고 보여 준다.

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

export default function TeacherTimetable({ center }: { center: Center }) {
  const { isAdmin } = useAdmin();
  const { userId, teacher, loading, login } = useMember();
  const [day, setDay] = useState(() => toYmd(new Date()));
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [lessons, setLessons] = useState<TeacherLesson[]>([]);
  const [holidays, setHolidays] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState('');
  const can = isAdmin || !!teacher;
  // 한눈에 보기 — 열 때마다 늘 이걸로 시작: 표 전체(폭·높이)가 화면에 들어오게 줄인다 ([크게 보기] = 원래 크기, 옆으로 밀어 보기)
  const [fit, setFit] = useState(true);
  // 접은 선생님 — 처음엔 모두 펼친다(빼 둔 선생님 이원재만 맨 오른쪽에 접혀 있다). 이름을 누르면 펼치기·접기
  const [folded, setFolded] = useState<Set<string>>(() => new Set(HIDDEN_TEACHERS));
  const toggleFold = (name: string) => setFolded(f => { const n = new Set(f); if (n.has(name)) n.delete(name); else n.add(name); return n; });
  const toggleFit = () => setFit(v => !v);
  const wrapRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  useLayoutEffect(() => {
    const wrap = wrapRef.current, table = tableRef.current;
    if (!wrap || !table) return;
    const reset = () => { table.style.transform = ''; table.style.width = ''; wrap.style.height = ''; };
    if (!fit) { reset(); return; }
    // 폭과 높이 둘 다 — 표 전체(맨 오른쪽 선생님·맨 아래 시간 줄까지)가 지금 화면에 들어오게.
    // CSS zoom 은 휴대폰 사파리에서 줄어든 폭을 잘못 재서 오른쪽이 잘려, 원래 크기를 재고 transform 으로 줄인다(자리는 줄인 높이만큼)
    const measure = () => {
      table.style.transform = 'none';
      table.style.width = 'max-content';
      const w = table.offsetWidth, h = table.offsetHeight;
      const top = wrap.getBoundingClientRect().top + window.scrollY;
      const availH = window.innerHeight - Math.min(top, window.innerHeight * 0.4) - 12;
      // 칸 폭과 실제 화면 폭 중 좁은 쪽 — 관리자 띠 등으로 페이지가 화면보다 넓어져도 화면 안에 들어오게
      const screenW = document.documentElement.clientWidth - Math.max(0, wrap.getBoundingClientRect().left) - 12;
      const z = Math.min(1, Math.min(wrap.clientWidth, screenW) / w, availH / h);
      table.style.transformOrigin = 'top left';
      table.style.transform = z < 1 ? `scale(${z})` : 'none';
      wrap.style.height = `${Math.ceil(h * z)}px`;
    };
    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(wrap.parentElement ?? wrap);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); reset(); };
  }, [fit, lessons, teachers, day, folded]);

  // 게시 중인 빈 시간("선생님|날짜|시간") — 수업스케쥴 글에 올라가 있고 아직 신청 없음 (모든 선생님)
  const [posted, setPosted] = useState<Set<string>>(new Set());
  // 그날이 들어 있는 수업스케쥴 게시글 — 기간인 날만 빈 시간을 더할 수 있다
  const [dayPost, setDayPost] = useState<{ id: string; title: string } | null>(null);
  const dayPosted = !!dayPost;
  const load = useCallback(async () => {
    try {
      const [t, l, h, p, pd] = await Promise.all([getTeachers({ includeHidden: true }), getTeacherLessons(day, day), getHolidayNames(day.slice(0, 4)).catch(() => ({})), getPostedSlots(day, day, center), getPostedDays(day, day, center)]);
      setTeachers(t); setLessons(l); setHolidays(h); setPosted(p); setDayPost(pd.get(day) ?? null); setFailed('');
    } catch (e) {
      setFailed((e as Error).message);
    }
  }, [day, center]);
  useEffect(() => { if (can) load(); }, [can, load]);
  // 수업스케쥴과 실시간으로 맞추기 — 다른 화면에서 칸이 바뀌면 바로(신호), 놓친 것은 1분마다·화면으로 돌아올 때 다시 읽는다
  useEffect(() => {
    if (!can) return;
    const off = onScheduleChanged(() => load());
    const t = setInterval(load, 60000);
    const onFocus = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onFocus);
    return () => { off(); clearInterval(t); document.removeEventListener('visibilitychange', onFocus); };
  }, [can, load]);

  // 빈 수업 올리기 — 고른 칸("날짜|시간"), 날짜를 바꿔도 남는다. 한 번에 한 게시글 기간 안에서만(pickedPost)
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pickedPost, setPickedPost] = useState<{ id: string; title: string } | null>(null);
  const [working, setWorking] = useState(false);
  const myId = isAdmin ? undefined : teacher?.teacherId;
  const canEditHere = !!myId && (teacher?.centers ?? []).includes(center);

  const label = center === 'uijeongbu' ? '의정부' : '수색';
  if (!can) {
    return (
      <div className="max-w-md mx-auto px-5 py-24 text-center space-y-4 fade-up">
        <h1 className="display-heading">시간표({label})</h1>
        {loading ? <p className="text-[14px] text-[#aaa]">불러오는 중…</p> : userId ? (
          <p className="text-[14px] leading-[2] text-[#666]">선생님 인증을 한 계정만 볼 수 있어요.<br />센터에 등록된 이름·휴대전화 번호로 인증해 주세요.</p>
        ) : (<>
          <p className="text-[14px] leading-[2] text-[#666]">선생님은 카카오로 로그인한 뒤<br />[선생님]을 골라 인증하면 볼 수 있어요.</p>
          <button onClick={login} className="bg-[#e11d48] text-white text-[14px] px-6 py-2.5 rounded-full hover:opacity-90">카카오 로그인</button>
        </>)}
      </div>
    );
  }

  const d = parseYmd(day);
  const wd = d.getDay();
  const holiday = holidays[day];
  // 이 센터 그날 수업 — 공휴일엔 고정 수업 빼기
  const here = lessons.filter(l => l.center === center && l.day === day && !(holiday && l.source === 'fixed'));
  const cellOf = (teacherId: string, time: string, side: 'fixed' | 'open') => here.find(l => l.teacherId === teacherId && l.time === time && l.side === side);
  const hasLessons = (id: string) => here.some(l => l.teacherId === id && l.status === 'child');
  // 그날 이 센터에 나오는 선생님 — 출근 요일(일요일은 일요일 선생님) 또는 그날 수업이 있는 선생님
  const shown = teachers.filter(t => hasLessons(t.id) || (wd === 0 ? SUNDAY_TEACHERS[center].includes(t.name) && t.centers.includes(center) : worksAt(t, center, wd)));
  const rows = rowsForDay(day, here.map(l => `${l.teacherId}|${l.time}`), center);

  // 결제 칸 — 확정(✓ 빨강) · 고름(파랑) · 기본 결제(회색). 빈타임 아이는 기본 결제가 없다
  const payText = (l?: TeacherLesson) => {
    if (!l || (l.status !== 'child' && l.status !== 'cancel_requested') || l.moved || l.absent) return null;
    const name = (k?: string) => PAY_METHODS.find(m => m.key === k)?.label;
    if (l.payNote || l.payMethod) {
      const t = l.payNote || name(l.payMethod) || '';
      return l.payConfirmed ? <span className="text-[#b91c1c]">✓{t}</span> : <span className="text-[#1d4ed8]">{t}</span>;
    }
    const base = l.side === 'fixed' ? name(defaultPayMethod(l.payment)) : undefined;
    return base ? <span className="text-[#a1a1aa]">{base}</span> : null;
  };

  const text = (l?: TeacherLesson) => {
    if (!l) return null;
    if (l.status === 'undecided') return <span className="text-[#71717a]">?</span>;
    if (l.status === 'off') return <span className="text-[#a1a1aa]">수업 안 함</span>;
    if (l.status === 'cancelled') return <span className="text-[#c4c4cc] line-through">{l.name}</span>;
    if (l.status !== 'child' && l.status !== 'cancel_requested') return null;
    return (
      <span title={l.note} className={`${l.moved ? 'line-through text-[#a1a1aa]' : l.absent ? 'text-[#a1a1aa]' : 'text-[#27272a]'}`}>
        {l.name}{l.number ?? ''}
        {l.absent && <span className="ml-0.5 text-[9px]">결석</span>}
        {l.source === 'booking' && <span className="ml-0.5 text-[9px] text-[#a1a1aa]">신청</span>}
        {l.note && <span className="block text-[9px] leading-[1.2] text-[#a1a1aa] whitespace-normal">{l.note}</span>}
      </span>
    );
  };
  const DOWS = DOW;
  const whenOf = (dd: string, time: string) => { const x = parseYmd(dd); return `${x.getMonth() + 1}/${x.getDate()}(${DOWS[x.getDay()]}) ${time.replace(/^0/, '')}`; };
  // 내 빈타임 칸 누르기 — 고르는 중이면 고르기/풀기(빈칸·x), 아니면 x(수업 안 함)로 바꾸기. x를 다시 열 땐 [빈 수업 올리기]로 게시글에 더한다
  const tapMine = async (time: string, c: { free: boolean; isPosted: boolean; isOff: boolean }) => {
    const k = `${day}|${time}`;
    if (picking) {
      if (c.isPosted) { await showAlert('이미 수업스케쥴에 올라가 있는 시간이에요.'); return; }
      if (!c.free) return;
      if (!dayPost) { await showAlert('이 날은 수업스케쥴 게시글 기간이 아니에요.\n이미 올라온 게시글 기간의 날짜만 더할 수 있어요.'); return; }
      if (pickedPost && picked.size && pickedPost.id !== dayPost.id) {
        await showAlert(`한 번에 한 게시글 기간 안에서만 고를 수 있어요.\n지금 고른 게시글: ${pickedPost.title}\n\n이 날은 다른 게시글(${dayPost.title}) 기간이에요. 먼저 [게시글에 더하기]로 올린 뒤 따로 골라 주세요.`);
        return;
      }
      const next = new Set(picked);
      if (next.has(k)) next.delete(k); else next.add(k);
      setPicked(next);
      setPickedPost(next.size ? dayPost : null);
      return;
    }
    if (c.isOff) { await showAlert('x(수업 안 함) 칸이에요.\n다시 열려면 [빈 수업 올리기]로 골라 게시글에 더해 주세요.'); return; }
    if (!c.free && !c.isPosted) return;
    const msg = `${whenOf(day, time)} 내 빈타임을 x(수업 안 함)로 바꿀까요?${c.isPosted ? '\n\n수업스케쥴 글에 올라가 있는 시간이라 글에서 바로 내려가요.' : ''}\n\n센터(관리자)에게 알림톡이 가요. 보호자에게는 가지 않아요.`;
    if (!(await askConfirm(msg, 'x로 바꾸기'))) return;
    setWorking(true);
    try {
      const r = await teacherSetOff(center, day, time);
      if (r.result === 'busy') await showAlert('그 사이 수업이 들어와서 바꿀 수 없어요. 화면을 새로 볼게요.');
      else if (r.result === 'past') await showAlert('지난 날은 바꿀 수 없어요.');
      else if (r.result === 'not_teacher') await showAlert('선생님 인증된 계정만 바꿀 수 있어요.');
      await load();
    } catch (e) {
      await showAlert(`바꾸지 못했어요. 수업스케쥴 연동 SQL(supabase/teacher-schedule.sql)을 실행했는지 확인해 주세요.\n${(e as Error).message}`);
    } finally { setWorking(false); }
  };
  const submitPicked = async () => {
    const list = [...picked].sort().map(k => { const [dd, time] = k.split('|'); return { day: dd, time }; });
    if (!list.length) { await showAlert('올릴 빈 시간을 눌러 골라 주세요.'); return; }
    if (!(await askConfirm(`빈 수업 ${list.length}개를 그 날짜의 수업스케쥴 게시글에 더할까요?\n\n${list.map(x => `· ${whenOf(x.day, x.time)}`).join('\n')}\n\n${label} 보호자에게 스케줄 수정 알림톡, 센터(관리자)에게도 알림톡이 가요.`, '더하기'))) return;
    setWorking(true);
    try {
      const r = await teacherPostSlots(center, list);
      if (r.result === 'ok') {
        const s = r.sent && 'sent' in r.sent ? r.sent : null;
        await showAlert(`수업스케쥴 게시글에 빈 수업 ${r.count}개를 더했어요.${(r.count ?? 0) < list.length ? `\n(${r.no_post ? `게시글 기간이 아닌 ${r.no_post}개, ` : ''}그 사이 막힌 칸은 빠졌어요)` : ''}${s ? `\n알림톡 — 보냄 ${s.sent}건${s.waiting ? ` · 템플릿 심사 전이라 남겨만 둠 ${s.waiting}건` : ''}` : ''}`);
        setPicked(new Set()); setPickedPost(null); setPicking(false);
      } else if (r.result === 'none') await showAlert(r.no_post ? '고른 날짜가 수업스케쥴 게시글 기간이 아니에요.\n이미 올라온 게시글 기간의 날짜만 더할 수 있어요.' : '더할 수 있는 시간이 없어요. 그 사이 수업이 들어왔거나 이미 올라가 있어요.');
      else await showAlert('선생님 인증된 계정만 올릴 수 있어요.');
      await load();
    } catch (e) {
      await showAlert(`올리지 못했어요. 수업스케쥴 연동 SQL(supabase/teacher-schedule.sql)을 실행했는지 확인해 주세요.\n${(e as Error).message}`);
    } finally { setWorking(false); }
  };

  const th = 'border border-[#d4d4d8] px-1 py-1.5 font-normal whitespace-nowrap';
  const td = 'border border-[#e4e4e7] h-9 px-1 text-center align-middle text-[12px] whitespace-nowrap';
  const nav = 'text-[13px] border border-[#e5e5e5] w-8 h-8 hover:bg-[#f8f8f8]';

  return (
    <div className="px-3 md:px-6 pt-6 pb-14 fade-up">
      <h1 className="display-heading mb-4">시간표 <span className="text-[0.7em] text-[#888]">({label})</span></h1>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button onClick={() => setDay(x => addDays(x, -1))} className={nav} aria-label="전날">‹</button>
        <input type="date" value={day} onChange={e => e.target.value && setDay(e.target.value)} className="text-[13px] border border-[#ddd] px-2 h-8" />
        <button onClick={() => setDay(x => addDays(x, 1))} className={nav} aria-label="다음 날">›</button>
        {day !== toYmd(new Date()) && <button onClick={() => setDay(toYmd(new Date()))} className="text-[12px] text-[#888] underline underline-offset-2">오늘</button>}
        <button onClick={toggleFit} aria-pressed={fit}
          className={`text-[12px] px-2.5 h-8 border ${fit ? 'border-[var(--brand)] bg-[var(--brand)] text-white' : 'border-[#e5e5e5] text-[#555] hover:bg-[#f8f8f8]'}`}>
          {fit ? '크게 보기' : '한눈에 보기'}
        </button>
        {canEditHere && (picking ? (
          <span className="flex items-center gap-2 ml-auto">
            <span className="text-[12px] text-[#1d4ed8]">{pickedPost ? `${pickedPost.title} · ` : ''}{picked.size}개 고름</span>
            <button onClick={submitPicked} disabled={working || !picked.size} className="text-[12px] px-3 h-8 rounded-full bg-[var(--brand)] text-white disabled:opacity-40">{working ? '더하는 중…' : '게시글에 더하기'}</button>
            <button onClick={() => { setPicking(false); setPicked(new Set()); setPickedPost(null); }} className="text-[12px] px-3 h-8 rounded-full border border-[#ddd] text-[#555]">그만두기</button>
          </span>
        ) : (
          <button onClick={() => setPicking(true)} className="ml-auto text-[12px] px-3 h-8 rounded-full border border-[var(--brand)] text-[var(--brand)]">빈 수업 올리기</button>
        ))}
      </div>
      {picking && <p className="text-[12px] text-[#1d4ed8] mb-2">{dayPost ? `이 날 게시글: ${dayPost.title} — 내 빈타임에서 빈칸이나 x 칸(+)을 눌러 골라요. x 칸은 x가 풀리며 올라가요(?는 안 돼요). 같은 게시글 기간이면 다른 날도 함께 고를 수 있어요.` : '이 날은 수업스케쥴 게시글 기간이 아니라 고를 수 없어요. 게시글이 올라온 날짜로 옮겨 주세요.'}</p>}
      {failed && <p className="text-[13px] text-red-400 mb-3">불러오지 못했어요. ({failed})</p>}
      <div ref={wrapRef} className={`${fit ? 'overflow-hidden' : 'overflow-x-auto'} bg-white`}>
        <table ref={tableRef} className="border-collapse text-[11px] min-w-full">
          <thead>
            <tr>
              <th className={`${th} sticky left-0 z-10 bg-white w-12`}>시간</th>
              <th className={`${th} text-[13px] ${holiday ? 'text-red-500' : 'text-[#c026d3]'}`} colSpan={Math.max(1, shown.reduce((n, t) => n + (folded.has(t.name) ? 1 : 3), 0))}>
                {DOW[wd]} / {d.getMonth() + 1}월 {d.getDate()}일{holiday && <span className="ml-2 text-[12px]">{holiday} — 고정 수업 없음</span>}
              </th>
            </tr>
            <tr>
              <th className={`${th} sticky left-0 z-10 bg-white`} />
              {shown.map(t => (
                <th key={t.id} colSpan={folded.has(t.name) ? 1 : 3} className={`${th} text-[13px] ${t.id === teacher?.teacherId ? 'text-[var(--brand)] bg-[#eef5fe]' : 'text-[#16a34a]'}`}>
                  <button type="button" onClick={() => toggleFold(t.name)} title={folded.has(t.name) ? '펼치기' : '접기'} className="inline-flex items-center gap-1 hover:opacity-70">
                    {t.name}<span className={`text-[14px] leading-none ${folded.has(t.name) ? '' : 'opacity-60'}`}>{folded.has(t.name) ? '▶' : '◀'}</span>
                  </button>
                </th>
              ))}
            </tr>
            <tr>
              <th className={`${th} sticky left-0 z-10 bg-white`} />
              {shown.map(t => folded.has(t.name) ? <th key={t.id} className={`${th} text-[10px] text-[#ccc] w-8`}>접음</th> : (
                <FragmentCols key={t.id}>
                  <th className={`${th} text-[10px] text-[#999] min-w-[64px]`}>고정</th>
                  <th className={`${th} text-[10px] text-[#999] min-w-[64px]`}>빈타임</th>
                  <th className={`${th} text-[10px] text-[#16a34a] min-w-[52px]`}>결제</th>
                </FragmentCols>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(time => (
              <tr key={time}>
                <td className={`border border-[#d4d4d8] px-1 text-center sticky left-0 z-10 bg-white ${ROW_LABEL[time] ? 'text-[#c026d3]' : ''}`}>{time.replace(/^0/, '')}</td>
                {shown.map(t => {
                  if (folded.has(t.name)) return <td key={t.id} className={`${td} bg-[#fafafa]`} />;
                  const f = cellOf(t.id, time, 'fixed'), o = cellOf(t.id, time, 'open');
                  const openKid = o && (o.status === 'child' || o.status === 'cancel_requested');
                  return (
                    <FragmentCols key={t.id}>
                      {/* 빈타임에 아이가 있으면 그 시간은 빈타임 아이 수업 — 고정 칸은 흐리게 */}
                      <td className={`${td} ${openKid ? 'bg-[#f4f4f5] opacity-60' : ''}`}>{text(f) ?? (ROW_LABEL[time] && <span className="text-[#c4c4cc]">{ROW_LABEL[time]}</span>)}</td>
                      {t.id === myId && canEditHere ? (() => {
                        const k = `${day}|${time}`;
                        const isPosted = posted.has(`${t.id}|${day}|${time}`);
                        const isOff = o?.status === 'off';
                        // 올릴 수 있는 칸 — 비어 있거나 x (?·아이는 안 됨), 고정 칸에 살아 있는 수업도 없고 오늘 이후
                        const free = (!o || o.status === 'off') && !(f && f.status === 'child' && !f.moved && !f.absent) && day >= toYmd(new Date());
                        const pickable = free && dayPosted && !isPosted;
                        const sel = picked.has(k);
                        return (
                          <td className={`${td} p-0 ${sel ? 'bg-[#dbeafe]' : 'bg-[#fcfcfd]'}`}>
                            <button type="button" onClick={() => tapMine(time, { free, isPosted, isOff })} disabled={working}
                              className={`w-full h-9 px-1 ${free || isPosted ? 'cursor-pointer hover:bg-[#eef5fe]' : 'cursor-default'}`}
                              aria-label={`${time} 내 빈타임`}>
                              {sel ? <span className="text-[#1d4ed8] font-medium">✓ 고름</span>
                                : isOff ? <span className="text-[#a1a1aa]">x 수업 안 함{picking && pickable && <span className="ml-0.5 text-[#c4c4cc]">+</span>}</span>
                                : isPosted ? <span className="text-[10px] px-1 rounded bg-[#ecfdf5] text-[#047857]">게시 중</span>
                                : text(o) ?? (picking && pickable ? <span className="text-[#c4c4cc]">+</span> : null)}
                            </button>
                          </td>
                        );
                      })() : <td className={`${td} bg-[#fcfcfd]`}>{text(o)}{(!o || o.status === 'off') && posted.has(`${t.id}|${day}|${time}`) && <span className="text-[10px] px-1 rounded bg-[#ecfdf5] text-[#047857]">게시 중</span>}</td>}
                      <td className={`${td} bg-[#f9fdfa]`}>{payText(openKid ? o : f)}</td>
                    </FragmentCols>
                  );
                })}
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={3} className="py-10 text-center text-[13px] text-[#bbb]">이 날은 수업이 없어요.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-[#999] mt-3 leading-[2]">내 빈타임 칸만 바꿀 수 있어요 — [빈 수업 올리기]로 빈칸·x 칸을 골라 그 날짜의 수업스케쥴 게시글에 더하고(게시글 기간인 날만), 칸을 눌러 x(수업 안 함)로 바꿔요(게시 중인 시간은 글에서 내려가요). 다른 칸은 보기만 · 게시 중 = 수업스케쥴에 올라가 있고 아직 신청 없음 · [한눈에 보기] = 표 전체를 화면에 맞춰 줄여요(두 손가락으로 벌려 확대할 수 있어요) · 줄 = 다른 선생님에게 옮김 · ? = 미정 · &quot;신청&quot; = 보호자가 수업스케쥴에서 신청 · 결제: 회색 = 기본, <span className="text-[#1d4ed8]">파랑</span> = 고름, <span className="text-[#b91c1c]">✓빨강</span> = 결제 완료 · 선생님 이름을 누르면 펼치기·접기</p>
    </div>
  );
}

function FragmentCols({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
