'use client';

import type { MyChild, MyLesson, MyPayment, MyPaymentUse } from '@/lib/mypage';
import { getMyLessons, isRealLesson } from '@/lib/mypage';
import UsageCard from '@/components/UsageCard';
import type { LedgerRow } from '@/lib/prepaid';
import PrepaidCard from '@/components/PrepaidCard';
import { useEffect, useState } from 'react';
import type { Teacher } from '@/lib/schedule';
import { addDays, getHolidayNames, getTeachers, parseYmd, thisMonday, toYmd, tomorrowsMonday, mondayOf } from '@/lib/schedule';
import { methodInCenter, worksAt } from '@/lib/timetable';

// 마이페이지 화면(보호자) — 데이터는 app/mypage/page.tsx 가 불러와서 넘긴다.

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const PAY_ROW_LABEL: Record<MyPayment['method'], string> = { voucher: '바우처', gusen: '굳센', jangmatchum: '장맞춤', kkumideun: '꿈이든', woojin: '우진학교', subsidy: '지원금', prepaid: '선결제' };
const PAY_LABEL: Record<string, string> = { b: '바우처', e: '굳센', 장: '장맞춤', c: '꿈이든' };
const payKind = (p: string) => {
  const code = p.toLowerCase().replace(/[x~]/g, '');
  return code.includes('b') ? 'b' : code.includes('e') ? 'e' : code.includes('장') ? '장' : code.includes('c') ? 'c' : 'etc';
};
const payName = (k: string) => PAY_LABEL[k] ?? '기타 결제';
export const MYPAGE_CARD = 'bg-white rounded-[18px] shadow-[0_2px_6px_rgba(0,0,0,0.05),0_10px_24px_rgba(0,0,0,0.05)] p-5 md:p-7';

export interface MyPageViewProps {
  child: MyChild | null;
  nickname?: string;
  approved: boolean;
  week: string;
  setWeek: (fn: (w: string) => string) => void;
  weekLessons: MyLesson[];
  payments: MyPayment[];
  /** 선결제 카드 내역 (충전·사용) */
  ledger?: LedgerRow[];
  /** 결제별 사용 기록 (바우처·굳센·꿈이든·지원금) — 지난 달도 쌓인다 */
  history?: MyPaymentUse[];
  today: string;
  /** 보는 지점 — 사설 수업을 셀 때 이 지점 수업만 */
  center?: string;
  failed?: string;
  /** 맨 위(보는 지점)·맨 아래(지점 가입) — 페이지가 만들어 넘긴다 */
  top?: React.ReactNode;
  bottom?: React.ReactNode;
}

// 결제별 사용 카드 — 선결제 카드 아래에 이 순서로 (쓰는 결제이거나 이번 달 기록이 있는 것만)
const USAGE_CARDS: { method: MyPayment['method']; label: string }[] = [
  { method: 'voucher', label: '바우처' }, { method: 'gusen', label: '굳센' }, { method: 'jangmatchum', label: '장맞춤' }, { method: 'kkumideun', label: '꿈이든' }, { method: 'subsidy', label: '지원금' },
];
// 굳센은 수색, 장맞춤은 의정부 지점에서만 보인다
const inBranch = (method: string, center?: string) => methodInCenter(method, center === 'uijeongbu' ? 'uijeongbu' : 'eunpyeong');

// 년/월/일 (주별 시간표 날짜 넘기기)
const ymd = (d: Date) => `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;

export default function MyPageView({ child, nickname, approved, week, setWeek, weekLessons, payments, ledger = [], history = [], today, center, failed, top, bottom }: MyPageViewProps) {
  // 결제 현황 — 체크 여부와 상관없이 모든 결제 항목을 보여 준다 (안 썼으면 0회)
  const payRows = payments.filter(p => inBranch(p.method, center)).sort((a, b) => (a.method === 'prepaid' ? -1 : b.method === 'prepaid' ? 1 : 0));   // 선결제를 맨 위로

  const card = MYPAGE_CARD;

  const days = [0, 1, 2, 3, 4, 5].map(i => addDays(week, i));
  const ws = parseYmd(week);
  const we = parseYmd(addDays(week, 5));
  // 결제 현황 — 보는 달(YYYY-MM). 이번 달은 결제 현황 값 그대로, 지난 달은 결제 기록([결제 완료])으로 센다
  const thisMonth = today.slice(0, 7);
  const [payMonth, setPayMonth] = useState(thisMonth);
  const shiftMonth = (ym: string, n: number) => { const d = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const usedIn = (p: MyPayment) => payMonth === thisMonth ? p.used : history.filter(h => h.method === p.method && h.day.startsWith(payMonth)).length;
  const payMonthLabel = `${payMonth.slice(0, 4)}년 ${Number(payMonth.slice(5, 7))}월`;

  // 사설 — 그 달(오늘까지) 실제로 한 수업 중 바우처·굳센·장맞춤·꿈이든·우진학교·지원금으로 하지 않은 수업 수 (선결제·카드·현금·결제 글자 없음 포함).
  // 결석·옮김·미정·수업 안 함, 공휴일의 고정 수업은 세지 않는다
  const [monthLessons, setMonthLessons] = useState<MyLesson[] | null>(null);
  const [monthHols, setMonthHols] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    const first = `${payMonth}-01`;
    const last = toYmd(new Date(Number(payMonth.slice(0, 4)), Number(payMonth.slice(5, 7)), 0));
    const end = last < today ? last : today;
    if (first > end) { setMonthLessons([]); return; }
    Promise.all([getMyLessons(first, end), getHolidayNames(payMonth.slice(0, 4)).catch(() => ({}))])
      .then(([ls, h]) => { if (alive) { setMonthLessons(ls); setMonthHols(h); } })
      .catch(() => { if (alive) setMonthLessons(null); });
    return () => { alive = false; };
  }, [payMonth, today]);
  const SUPPORT = ['voucher', 'gusen', 'jangmatchum', 'kkumideun', 'woojin', 'subsidy'];
  // 지원 결제로 한 수업인지 — [결제 완료] 기록이 있으면 그것, 없으면 칸의 결제 글자(b·e·c·우·지)
  const bySupport = (l: MyLesson) => history.some(h => h.day === l.day && h.time === l.time && SUPPORT.includes(h.method))
    || /[bec우지장]/.test(l.payment.toLowerCase().replace(/x/g, ''));
  const privateCount = monthLessons?.filter(l => (!center || l.center === center) && isRealLesson(l) && !l.absent
    && !(monthHols[l.day] && l.source === 'fixed') && !bySupport(l)).length;
  // 공휴일 — 그 주에 걸친 해(연말·연초는 두 해)의 공휴일 이름
  const [holidays, setHolidays] = useState<Record<string, string>>({});
  const years = [...new Set([days[0].slice(0, 4), days[5].slice(0, 4)])].join(',');
  useEffect(() => {
    let alive = true;
    Promise.all(years.split(',').map(y => getHolidayNames(y).catch(() => ({}))))
      .then(list => { if (alive) setHolidays(Object.assign({}, ...list)); });
    return () => { alive = false; };
  }, [years]);

  // 알림톡 버튼으로 왔을 때만 주별 시간표로 내려가기 — /mypage?d=2026/10/20 이면 그 날짜가 든 주,
  // /mypage#week 이면 내일이 들어 있는 주(일요일이면 다음 주). 그냥 마이페이지를 열면 늘 이번 주. 승인 확인 뒤에 칸이 생기므로 그때
  useEffect(() => {
    const d = new URLSearchParams(window.location.search).get('d');
    if (!approved || (!d && window.location.hash !== '#week')) return;
    setWeek(() => (d && mondayOf(d)) || tomorrowsMonday());
    document.getElementById('week')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [approved, setWeek]);

  // 선생님 출근 요일 — 원래 출근하는 요일이 아닌 날(예: 설영수 선생님 은평 월·토)은 왼쪽 칸이어도 '고정'이 아니다
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  useEffect(() => { getTeachers().then(setTeachers).catch(() => {}); }, []);
  const isRegular = (l: MyLesson, weekday: number) => {
    const t = teachers.find(x => x.name === l.teacher);
    return !t || worksAt(t, l.center, weekday);
  };

  // 이 지점 승인 전 — 칸마다 내용 대신 "승인 대기 중"
  if (!approved) return (
    <div className="space-y-6">
      {top}
      {['주별 시간표', '결제 현황', '선결제 카드', ...USAGE_CARDS.filter(u => inBranch(u.method, center)).map(u => u.label)].map(t => (
        <section key={t} className={card}>
          <h2 className="text-[17px] text-[#27272a] mb-3">{t}</h2>
          <p className="text-[14px] text-[#f59e0b]">승인 대기 중</p>
        </section>
      ))}
      {bottom}
    </div>
  );

  return (
    <div className="space-y-6">
      {failed && <p className="text-[13px] text-red-400">불러오지 못했어요. ({failed})</p>}
      {top}

      {/* 승인·연결 안내 (우리 아이 이름 칸은 없앴다) */}
      {(!approved || !child?.memberCode) && (
        <div className="space-y-1">
          {!approved && <p className="text-[13px] text-[#f59e0b]">센터에서 승인하면 수업 신청을 할 수 있어요.</p>}
          {!child?.memberCode && <p className="text-[13px] text-[#999]">아직 센터 회원 정보와 연결되지 않았어요. 연결되면 시간표가 보여요.</p>}
        </div>
      )}

      {/* 주별 시간표 — 알림톡 [주간 수업 보기] 버튼은 /mypage?d=#{날짜} 로 와서 여기로 내려온다 */}
      <section id="week" className={`${card} scroll-mt-24`}>
        {/* 제목 줄 — 오른쪽 [이번 주](이번 주를 볼 땐 자리만 두고 숨김). 아래 날짜 넘기기는 가운데, 주를 바꿔도 위치가 안 움직이게 */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[17px] text-[#27272a]">주별 시간표</h2>
          <button onClick={() => setWeek(() => thisMonday())} tabIndex={week === thisMonday() ? -1 : 0} aria-hidden={week === thisMonday()}
            className={`text-[12px] text-[#888] underline underline-offset-2 ${week === thisMonday() ? 'invisible' : ''}`}>이번 주</button>
        </div>
        <div className="flex items-center justify-center gap-1.5 text-[13px] mb-4">
          <button onClick={() => setWeek(w => addDays(w, -7))} aria-label="지난주" className="w-8 h-8 border border-[#e5e5e5] rounded-full">‹</button>
          <span className="min-w-[180px] text-center tabular-nums">{ymd(ws)} ~ {ymd(we)}</span>
          <button onClick={() => setWeek(w => addDays(w, 7))} aria-label="다음주" className="w-8 h-8 border border-[#e5e5e5] rounded-full">›</button>
        </div>
        <div className="divide-y divide-[#f0f0f0]">
          {days.map(d => {
            // 공휴일에는 고정 수업을 하지 않는다(빈타임만) — 그날 넣은 칸·신청만 보인다
            // 결석한 수업은 아예 보이지 않는다
            const list = weekLessons.filter(l => l.day === d && !l.absent && l.status !== 'none' && l.status !== 'off' && l.status !== 'undecided' && !(holidays[d] && l.source === 'fixed'));
            const dd = parseYmd(d);
            return (
              <div key={d} className={`flex gap-3 py-3 ${d === today ? 'bg-[#f8fbff] -mx-3 px-3 rounded-lg' : ''}`}>
                <div className={`w-[60px] shrink-0 text-[12px] pt-0.5 ${holidays[d] ? 'text-[#dc2626]' : 'text-[#71717b]'}`}>
                  <span className="whitespace-nowrap">{DOW[dd.getDay()]} <span className={holidays[d] ? 'text-[#ef4444]' : 'text-[#b4b4bb]'}>{dd.getMonth() + 1}/{dd.getDate()}</span></span>
                  {/* 공휴일 — 요일·날짜 아래 빨간 글씨로 작게 */}
                  {holidays[d] && <span className="block mt-0.5 text-[10px] leading-[1.3] text-[#dc2626] break-keep">{holidays[d]}</span>}
                </div>
                <div className="flex-1 space-y-1.5">
                  {list.length === 0 && <span className="text-[12px] text-[#d4d4d8]">수업 없음</span>}
                  {list.map((l, i) => (
                    <div key={i} className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] ${l.moved || l.status === 'cancelled' ? 'text-[#bbb] line-through' : 'text-[#27272a]'}`}>
                      <span className="tabular-nums">{l.time}</span>
                      <span>{l.teacher} 선생님</span>
                      {l.oral && <span className="text-[11px] text-[#8b5cf6]">구강</span>}
                      {/* 고정 수업만 '고정' 표시 (빈타임·신청은 표시 없음). 공휴일·일요일, 선생님이 원래 출근하지 않는 요일은 표시 없음 */}
                      {l.source !== 'booking' && l.side === 'fixed' && !holidays[d] && dd.getDay() !== 0 && isRegular(l, dd.getDay()) && <span className="text-[11px] px-1.5 rounded border border-[#eee] text-[#888]">고정</span>}
                      {l.payment.replace(/[x~]/gi, '') && <span className="text-[11px] text-[#999]">{payName(payKind(l.payment))}</span>}
                      {l.status === 'cancel_requested' && <span className="text-[11px] text-[#b45309] bg-[#fef3c7] px-1.5 rounded">취소 신청 중</span>}
                      {l.status === 'cancelled' && <span className="text-[11px] no-underline">취소</span>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>
      {/* 결제 현황 — 바우처·굳센·꿈이든은 이번 달 사용 횟수(매월 1일 0부터), 선결제는 남은 횟수 */}
      <section className={card}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[17px] text-[#27272a]">결제 현황</h2>
          <button onClick={() => setPayMonth(thisMonth)} tabIndex={payMonth === thisMonth ? -1 : 0} aria-hidden={payMonth === thisMonth}
            className={`text-[12px] text-[#888] underline underline-offset-2 ${payMonth === thisMonth ? 'invisible' : ''}`}>이번 달</button>
        </div>
        {/* 달 넘기기 — 바우처·굳센·꿈이든 사용 횟수가 그 달 것으로 바뀐다 (다음 달은 없어서 이번 달까지) */}
        <div className="flex items-center justify-center gap-1.5 text-[13px] mb-3">
          <button onClick={() => setPayMonth(m => shiftMonth(m, -1))} aria-label="지난달" className="w-8 h-8 border border-[#e5e5e5] rounded-full">‹</button>
          <span className="min-w-[120px] text-center tabular-nums">{payMonthLabel}</span>
          <button onClick={() => setPayMonth(m => shiftMonth(m, 1))} disabled={payMonth >= thisMonth} aria-label="다음달"
            className="w-8 h-8 border border-[#e5e5e5] rounded-full disabled:opacity-30">›</button>
        </div>
        {payRows.length === 0 ? <p className="text-[13px] text-[#bbb]">등록된 결제가 없어요.</p> : (
          <table className="w-full text-[15px]">
            <tbody>
              {/* 사설 — 선결제 위 */}
              <tr className="border-t border-[#f0f0f0] first:border-t-0">
                <td className="py-2.5">사설</td>
                <td className="py-2.5 text-right tabular-nums text-[var(--brand)]">
                  <span className="text-[12px] text-[#999] mr-1">{payMonth === thisMonth ? '이번 달' : `${Number(payMonth.slice(5, 7))}월`}</span>{privateCount ?? '-'}<span className="text-[12px] text-[#999] ml-1">회</span>
                </td>
              </tr>
              {payRows.map(p => (
                <tr key={p.method} className="border-t border-[#f0f0f0] first:border-t-0">
                  <td className="py-2.5">{PAY_ROW_LABEL[p.method]}</td>
                  {p.method === 'woojin' || p.method === 'subsidy' ? (
                    <td className="py-2.5 text-right tabular-nums text-[var(--brand)]">
                      {/* 우진학교·지원금은 남은 금액 */}
                      <span className="text-[12px] text-[#999] mr-1">{payMonth === thisMonth ? '' : '지금 '}남은 금액</span>{p.total.toLocaleString('ko-KR')}<span className="text-[12px] text-[#999] ml-0.5">원</span>
                    </td>
                  ) : p.method === 'prepaid' ? (
                    <td className={`py-2.5 text-right tabular-nums ${p.total - p.used <= 0 ? 'text-[#e11d48]' : 'text-[var(--brand)]'}`}>
                      <span className="text-[12px] text-[#999] mr-1">{payMonth === thisMonth ? '' : '지금 '}남은</span>{p.total - p.used}<span className="text-[12px] text-[#999] ml-1">회</span>
                    </td>
                  ) : (
                    <td className={`py-2.5 text-right tabular-nums ${p.total && usedIn(p) >= p.total ? 'text-[#e11d48]' : 'text-[var(--brand)]'}`}>
                      <span className="text-[12px] text-[#999] mr-1">{payMonth === thisMonth ? '이번 달' : `${Number(payMonth.slice(5, 7))}월`}</span>{usedIn(p)}<span className="text-[12px] text-[#999] ml-1">회 사용</span>
                      {p.total > 0 && <span className="block text-[11px] text-[#bbb]">한 달 {p.total}회</span>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* 선결제 카드 — 센터 종이 카드처럼 충전·사용 내역과 남은 횟수 (선결제를 쓰는 아이만) */}
      <section id="prepaid" className={card}>
        <h2 className="text-[17px] text-[#27272a] mb-4">선결제 카드</h2>
        <PrepaidCard rows={ledger} name={child?.childName} />
      </section>

      {/* 결제별 사용 카드 — 바우처·굳센·꿈이든·지원금: 일자 · 그 달 회차 · 메모 (지난 달도 쌓인다) */}
      {USAGE_CARDS.filter(u => inBranch(u.method, center)).map(u => {
        const p = payments.find(x => x.method === u.method);
        // 회차는 달마다 1회부터 (11월 첫 사용 = 1회)
        const perMonth = new Map<string, number>();
        const rows = history.filter(h => h.method === u.method).map(h => {
          const n = (perMonth.get(h.day.slice(0, 7)) ?? 0) + 1;
          perMonth.set(h.day.slice(0, 7), n);
          return { day: h.day, nth: n, memo: [`${h.time.replace(/^0/, '')} ${h.teacher ? `${h.teacher} 선생님` : ''}`.trim(), h.note].filter(Boolean).join(' · ') };
        });
        return (
          <section key={u.method} className={card}>
            <h2 className="text-[17px] text-[#27272a] mb-4">{u.label}</h2>
            <UsageCard label={u.label} rows={rows} name={child?.childName} used={p?.used ?? rows.length}
              {...(u.method === 'subsidy' ? { balance: p?.total ?? 0 } : { limit: p?.total })} />
          </section>
        );
      })}
      {bottom}
    </div>
  );
}
