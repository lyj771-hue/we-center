'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAdmin } from '@/components/AdminContext';
import { useMember } from '@/components/MemberContext';
import MyPageView, { MYPAGE_CARD } from '@/components/MyPageView';
import type { LedgerRow } from '@/lib/prepaid';
import { getMyLedger } from '@/lib/prepaid';
import type { MyChild, MyLesson, MyPayment } from '@/lib/mypage';
import { getMyChild, getMyChildCenters, getMyLessons, getMyPaymentHistory, getMyPayments } from '@/lib/mypage';
import type { BranchKey, MyPaymentUse } from '@/lib/mypage';
import { BRANCHES, leaveBranch, requestBranch, withdrawMember } from '@/lib/mypage';
import { askConfirm, showAlert } from '@/lib/dialog';
import { addDays, thisMonday, toYmd } from '@/lib/schedule';

// 마이페이지(보호자) — 내 아이 정보, 결제 현황(바우처·굳센·꿈이든 이번 달, 선결제 누적), 주별 시간표.
// 수업은 관리자 시간표(고정·그날 바꾼 칸)와 수업스케쥴 신청을 합친 것 — 센터 시간표와 늘 같다. 화면은 MyPageView.

export default function MyPage() {
  const { isAdmin } = useAdmin();
  const { userId, profile, loading, login, logout, branches, canUse, refreshBranches, refreshProfile, teacher } = useMember();
  // 보는 지점 — 처음 가입한 지점이 기본, 승인된 다른 지점으로 바꿀 수 있다
  // 기본 지점 — 'none'(모든 지점 취소)이면 가입한 지점이 없다
  const noBranch = profile?.center === 'none';
  const primary: BranchKey = profile?.center === 'uijeongbu' ? 'uijeongbu' : 'eunpyeong';
  const [sel, setSel] = useState<BranchKey | null>(null);
  // 아이가 이어진 지점 — 가입 승인이 없어도 그 지점 아이가 이어져 있으면 볼 수 있다(두 지점을 다니는 아이)
  const [linked, setLinked] = useState<BranchKey[]>([]);
  const refreshLinked = useCallback(() => { if (userId) getMyChildCenters().then(setLinked).catch(() => {}); }, [userId]);
  useEffect(() => { refreshLinked(); }, [refreshLinked]);
  const viewable = (b: BranchKey) => canUse(b) || linked.includes(b);
  const branch: BranchKey = sel && viewable(sel) ? sel : primary;
  const usable = branches.filter(b => viewable(b.key));
  const [child, setChild] = useState<MyChild | null>(null);
  const [week, setWeek] = useState(thisMonday());
  const [weekLessons, setWeekLessons] = useState<MyLesson[]>([]);
  const [payments, setPayments] = useState<MyPayment[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [history, setHistory] = useState<MyPaymentUse[]>([]);
  const [failed, setFailed] = useState('');

  const today = toYmd(new Date());

  const load = useCallback(async () => {
    try {
      // 아이 정보·결제 현황·선결제 카드는 보는 지점의 아이 것 (선결제는 지점마다 따로)
      const [c, w, p] = await Promise.all([getMyChild(branch), getMyLessons(week, addDays(week, 5)), getMyPayments(branch)]);
      setChild(c); setWeekLessons(w); setPayments(p); setFailed('');
      setLedger(await getMyLedger(branch).catch(() => []));
      setHistory(await getMyPaymentHistory().catch(() => []));
    } catch (e) {
      setFailed((e as Error).message);
    }
  }, [week, branch]);
  useEffect(() => { if (userId && profile && !noBranch) load(); }, [userId, profile, noBranch, load]);

  const wrap = (body: React.ReactNode) => (
    <div className="max-w-[720px] mx-auto px-4 pt-8 pb-14 md:pt-14 fade-up">
      <h1 className="display-heading mb-8">마이페이지</h1>
      {body}
    </div>
  );

  if (isAdmin) return wrap(<p className="text-[14px] text-[#888]">마이페이지는 보호자 계정으로 로그인하면 보여요.</p>);
  if (teacher) return wrap(<p className="text-[14px] text-[#888]">{teacher.name} 선생님 계정이에요. 마이페이지는 보호자 계정에만 있어요 — 위 메뉴의 시간표를 봐 주세요.</p>);
  if (loading) return wrap(<p className="text-[14px] text-[#aaa]">불러오는 중…</p>);
  if (!userId) return wrap(
    <div className={`${MYPAGE_CARD} text-center space-y-4`}>
      <p className="text-[15px] text-[#555]">로그인하면 우리 아이 수업과 지원 현황을 볼 수 있어요.</p>
      <button onClick={login} className="bg-[#e11d48] text-white text-[15px] px-6 py-3 rounded-full hover:opacity-90">카카오 로그인/회원가입</button>
    </div>,
  );

  // 지점별로 나눠 보기 — 수업·결제 기록은 그 지점 것만. 결제 현황·선결제 카드는 그 지점 아이 것으로 불러온다
  const lessonsHere = weekLessons.filter(l => l.center === branch);
  const historyHere = history.filter(h => h.center === branch);
  const paymentsHere = payments;
  const labelOf = (b: BranchKey) => BRANCHES.find(x => x.key === b)?.label ?? '';

  const join = async (b: BranchKey) => {
    if (!userId) return;
    if (!(await askConfirm(`${labelOf(b)}도 가입할까요?\n센터에서 승인하면 ${labelOf(b)} 수업스케쥴과 마이페이지를 볼 수 있어요.`))) return;
    try { await requestBranch(userId, b); refreshBranches(); refreshProfile(); await showAlert(`${labelOf(b)} 가입을 신청했어요. 승인되면 열려요.`); }
    catch (e) { showAlert(`신청하지 못했어요.\n${(e as Error).message}`); }
  };

  // 맨 위 — 보는 지점 (승인된 지점이 둘이면 눌러서 바꾼다)
  const top = (
    <div className="flex items-center gap-2">
      {(usable.length > 1 ? usable : [{ key: branch, label: labelOf(branch) }]).map(b => (
        <button key={b.key} type="button" onClick={() => setSel(b.key)} disabled={usable.length < 2}
          className={`text-[14px] px-4 py-1.5 rounded-full border ${b.key === branch ? 'border-[var(--brand)] bg-[var(--brand)] text-white' : 'border-[#ddd] text-[#555] hover:bg-[#f8f8f8]'} disabled:cursor-default`}>
          {b.label}
        </button>
      ))}
    </div>
  );
  // 가입했거나 신청한 지점을 다시 누르면 — 취소할지 묻고, 그 지점 아이 연결을 끊고 빠진다(마지막 지점이면 계정은 남고 미승인으로)
  const joined = branches.filter(b => b.status !== 'none' || linked.includes(b.key));
  const leave = async (b: { key: BranchKey; label: string; status: string }) => {
    const pending = b.status === 'pending' || (b.status === 'primary' && !profile?.approvedAt);
    const last = joined.length <= 1;
    const msg = pending
      ? `${b.label} 승인 신청을 취소할까요?`
      : `${b.label} 이용을 취소할까요?\n${b.label} 아이 연결이 끊기고 ${b.label} 수업·결제가 안 보여요.\n다시 신청해서 승인되면 지난 기록도 그대로 다시 보여요.${last ? '\n\n마지막 지점이라 취소하면 가입한 지점이 없어져요. (회원 정보는 남아요)' : ''}`;
    if (!(await askConfirm(msg))) return;
    try {
      await leaveBranch(b.key);
      setSel(null); refreshBranches(); refreshProfile(); refreshLinked();
      await showAlert(pending ? '승인 신청을 취소했어요.' : `${b.label} 이용을 취소했어요.`);
    } catch (e) { showAlert(`취소하지 못했어요.\n${(e as Error).message}`); }
  };
  const withdraw = async () => {
    if (!(await askConfirm('회원 탈퇴할까요?\n보호자 정보와 모든 지점 가입이 지워지고 로그아웃돼요.\n(아이 수업·결제 기록은 센터에 남아요)'))) return;
    if (!(await askConfirm('정말 탈퇴할까요? 되돌릴 수 없어요.'))) return;
    try { await withdrawMember(); await showAlert('탈퇴했어요. 그동안 고마웠어요.'); logout(); }
    catch (e) { showAlert(`탈퇴하지 못했어요.\n${(e as Error).message}`); }
  };

  // 맨 아래 — 지점 가입 (안 한 지점은 눌러서 가입 신청, 가입했거나 신청한 지점은 다시 누르면 취소)
  // 지점 상태 — 가입됨 / 승인 대기 / 가입 안 함
  const stateOf = (b: { key: BranchKey; status: string }) =>
    b.status === 'primary' ? (profile?.approvedAt ? 'approved' : 'pending')
    : b.status === 'approved' || linked.includes(b.key) ? 'approved'
    : b.status === 'pending' ? 'pending' : 'none';
  const bottom = (
    <div className={`${MYPAGE_CARD} space-y-3`}>
      <h2 className="text-[17px] text-[#27272a]">지점</h2>
      <div className="flex gap-2">
        {branches.map(b => {
          const st = stateOf(b);
          return (
            <div key={b.key} className="flex-1 text-center">
              {/* 가입 안 한 지점만 눌러서 신청 — 취소는 아래 작은 글씨로 */}
              <button type="button" disabled={st !== 'none'} onClick={() => join(b.key)}
                className={`w-full py-2.5 text-[14px] rounded-full border disabled:cursor-default ${
                  st === 'approved' ? 'border-[var(--brand)] text-[var(--brand)] bg-[#eef5fe]'
                  : st === 'pending' ? 'border-[#eab308] text-[#a16207] bg-[#fefce8]'
                  : 'border-[#ddd] text-[#888] hover:bg-[#f8f8f8]'}`}>
                {b.label}
                <span className="block text-[11px] mt-0.5 opacity-80">{st === 'approved' ? '가입됨' : st === 'pending' ? '승인 대기 중' : '눌러서 가입 신청'}</span>
              </button>
              {st !== 'none' && (
                <button type="button" onClick={() => leave(b)}
                  className="mt-1.5 text-[11px] text-[#aaa] underline underline-offset-2 hover:text-red-400">
                  {st === 'approved' ? `${b.label} 이용 취소` : '승인 신청 취소'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
  // 맨 아래 작게 — 회원 탈퇴
  const withdrawLink = (
    <div className="text-center pt-2">
      <button type="button" onClick={withdraw} className="text-[12px] text-[#bbb] underline underline-offset-2 hover:text-red-400">회원 탈퇴</button>
    </div>
  );

  // 가입한 지점이 하나도 없으면 — 지점 정보는 모두 숨기고 지점 신청 버튼과 회원 탈퇴만
  if (noBranch) return wrap(
    <div className="space-y-6">
      <p className="text-[14px] text-[#888]">가입한 지점이 없어요. 다니는 지점을 눌러 가입을 신청해 주세요.</p>
      {bottom}
      {withdrawLink}
    </div>,
  );

  return wrap(
    <div className="space-y-6">
      <MyPageView child={child} nickname={profile?.nickname} approved={viewable(branch)} week={week} setWeek={setWeek}
        weekLessons={lessonsHere} payments={paymentsHere} ledger={ledger} history={historyHere} today={today} center={branch} failed={failed}
        top={top} bottom={bottom} />
      {withdrawLink}
    </div>,
  );
}
