'use client';

import { useCallback, useEffect, useState } from 'react';
import { useMember } from '@/components/MemberContext';
import InstallHint from '@/components/app/InstallHint';
import PushToggle from '@/components/app/PushToggle';
import { PHONES } from '@/components/ContactButton';
import type { BranchKey } from '@/lib/mypage';
import { BRANCHES, getMyChildCenters, leaveBranch, requestBranch, withdrawMember } from '@/lib/mypage';
import { askConfirm, showAlert } from '@/lib/dialog';

// 보호자 앱 — 더보기 탭: 앞 탭에서 볼 수 없는 것만 — 센터 문의 · 지점 가입 신청/취소 · 앱 알림 · 개인정보처리방침 · 로그아웃 · 회원 탈퇴.
// 지점 신청/취소 규칙은 홈페이지 마이페이지(app/mypage/page.tsx)와 같다.

const row = 'flex items-center justify-between min-h-[54px] py-2 gap-3 text-[15px] text-[#27272a]';
const group = 'bg-white rounded-[18px] px-[18px] divide-y divide-[#f4f4f4]';
const heading = 'px-1 pt-2 text-[12px] text-[#999]';

export default function AppMore() {
  const { userId, profile, branches, refreshBranches, refreshProfile, logout } = useMember();

  // 아이가 이어진 지점 — 가입 승인이 없어도 이어져 있으면 가입된 것으로 본다(마이페이지와 같음)
  const [linked, setLinked] = useState<BranchKey[]>([]);
  const refreshLinked = useCallback(() => { getMyChildCenters().then(setLinked).catch(() => {}); }, []);
  useEffect(() => { refreshLinked(); }, [refreshLinked]);

  const labelOf = (b: BranchKey) => BRANCHES.find(x => x.key === b)?.label ?? '';
  const stateOf = (b: { key: BranchKey; status: string }) =>
    b.status === 'primary' ? (profile?.approvedAt ? 'approved' : 'pending')
    : b.status === 'approved' || linked.includes(b.key) ? 'approved'
    : b.status === 'pending' ? 'pending' : 'none';
  const joined = branches.filter(b => b.status !== 'none' || linked.includes(b.key));

  const join = async (b: BranchKey) => {
    if (!userId) return;
    if (!(await askConfirm(`${labelOf(b)}도 가입할까요?\n센터에서 승인하면 ${labelOf(b)} 수업과 결제도 볼 수 있어요.`))) return;
    try { await requestBranch(userId, b); refreshBranches(); refreshProfile(); await showAlert(`${labelOf(b)} 가입을 신청했어요. 승인되면 열려요.`); }
    catch (e) { showAlert(`신청하지 못했어요.\n${(e as Error).message}`); }
  };
  const leave = async (b: { key: BranchKey; label: string; status: string }) => {
    const pending = stateOf(b) === 'pending';
    const last = joined.length <= 1;
    const msg = pending
      ? `${b.label} 승인 신청을 취소할까요?`
      : `${b.label} 이용을 취소할까요?\n${b.label} 아이 연결이 끊기고 ${b.label} 수업·결제가 안 보여요.\n다시 신청해서 승인되면 지난 기록도 그대로 다시 보여요.${last ? '\n\n마지막 지점이라 취소하면 가입한 지점이 없어져요. (회원 정보는 남아요)' : ''}`;
    if (!(await askConfirm(msg))) return;
    try {
      await leaveBranch(b.key);
      refreshBranches(); refreshProfile(); refreshLinked();
      await showAlert(pending ? '승인 신청을 취소했어요.' : `${b.label} 이용을 취소했어요.`);
    } catch (e) { showAlert(`취소하지 못했어요.\n${(e as Error).message}`); }
  };
  const withdraw = async () => {
    if (!(await askConfirm('회원 탈퇴할까요?\n보호자 정보와 모든 지점 가입이 지워지고 로그아웃돼요.\n(아이 수업·결제 기록은 센터에 남아요)'))) return;
    if (!(await askConfirm('정말 탈퇴할까요? 되돌릴 수 없어요.'))) return;
    try { await withdrawMember(); await showAlert('탈퇴했어요. 그동안 고마웠어요.'); logout(); }
    catch (e) { showAlert(`탈퇴하지 못했어요.\n${(e as Error).message}`); }
  };
  const out = async () => { if (await askConfirm('로그아웃할까요?')) logout(); };

  return (
    <div className="space-y-3">
      <h2 className={heading}>센터 문의</h2>
      <section className={group}>
        {PHONES.map(p => (
          <a key={p.phone} href={`tel:${p.phone.replace(/-/g, '')}`} className={row}>
            {p.label}
            <span className="inline-flex items-center gap-1.5 text-[14px] text-[var(--brand)] tabular-nums">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" /></svg>
              {p.phone}
            </span>
          </a>
        ))}
      </section>

      <h2 className={heading}>지점</h2>
      <section className={group}>
        {branches.map(b => {
          const st = stateOf(b);
          return (
            <div key={b.key} className={row}>
              <span>{b.label}
                <span className={`block text-[12px] ${st === 'approved' ? 'text-[var(--brand)]' : st === 'pending' ? 'text-[#B45309]' : 'text-[#999]'}`}>
                  {st === 'approved' ? '가입됨' : st === 'pending' ? '승인 대기 중' : '가입 안 함'}
                </span>
              </span>
              {st === 'none' ? (
                <button type="button" onClick={() => join(b.key)} className="h-9 px-4 rounded-full bg-[var(--brand)] text-white text-[13px]">가입 신청</button>
              ) : (
                <button type="button" onClick={() => leave(b)} className="h-9 px-4 rounded-full border border-[#ddd] text-[13px] text-[#666]">
                  {st === 'approved' ? '이용 취소' : '신청 취소'}
                </button>
              )}
            </div>
          );
        })}
      </section>

      <h2 className={heading}>알림</h2>
      <section className={group}>
        <PushToggle />
      </section>
      <InstallHint always />

      <section className={`${group} mt-6`}>
        <a href="/app/site/privacy" className={row}>개인정보처리방침 <span className="text-[#c4c4cc]" aria-hidden="true">›</span></a>
        <button type="button" onClick={out} className={`${row} w-full text-left text-[#e11d48]`}>로그아웃</button>
      </section>

      <div className="pt-2 text-center">
        <button type="button" onClick={withdraw} className="text-[12px] text-[#bbb] underline underline-offset-2">회원 탈퇴</button>
      </div>
    </div>
  );
}
