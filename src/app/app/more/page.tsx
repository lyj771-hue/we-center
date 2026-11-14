'use client';

import { useCallback, useEffect, useState } from 'react';
import { useMember } from '@/components/MemberContext';
import Link from 'next/link';
import MenuGrid from '@/components/app/MenuGrid';
import ContactButton from '@/components/ContactButton';
import type { PushState } from '@/lib/push';
import { getPushState } from '@/lib/push';
import type { BranchKey } from '@/lib/mypage';
import { BRANCHES, getMyChildCenters, leaveBranch, requestBranch, withdrawMember } from '@/lib/mypage';
import { askConfirm, showAlert } from '@/lib/dialog';

// 보호자 앱 — 더보기 탭: 홈페이지 메뉴 아이콘(가로 5개) · 지점 가입 신청/취소 · 앱 알림(눌러서 스위치) · 문의하기 · 개인정보처리방침 · 로그아웃 · 회원 탈퇴.
// 지점 신청/취소 규칙은 홈페이지 마이페이지(app/mypage/page.tsx)와 같다.

const row = 'flex items-center justify-between min-h-[54px] py-2 gap-3 text-[15px] text-[#27272a]';
const group = 'bg-white rounded-[18px] px-[18px] divide-y divide-[#f4f4f4]';

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
  // 앱 알림 켜짐/꺼짐 (목록 오른쪽에 작게)
  const [push, setPush] = useState<PushState | null>(null);
  useEffect(() => { getPushState().then(setPush).catch(() => setPush('unsupported')); }, []);

  const out = async () => { if (await askConfirm('로그아웃할까요?')) logout(); };

  return (
    <div className="space-y-3">
      {/* 홈페이지 메뉴 전부 — 작은 네모 아이콘, 가로 5개 */}
      <MenuGrid />

      {/* 지점 — 홈페이지 마이페이지와 같은 버튼 (안 한 지점은 눌러서 가입 신청, 아래 작은 글씨로 취소) */}
      <section className="bg-white rounded-[18px] p-[18px] space-y-3">
        <h2 className="text-[16px] text-[#27272a]">지점</h2>
        <div className="flex gap-2">
          {branches.map(b => {
            const st = stateOf(b);
            return (
              <div key={b.key} className="flex-1 text-center">
                <button type="button" disabled={st !== 'none'} onClick={() => join(b.key)}
                  className={`w-full py-2.5 text-[14px] rounded-full border disabled:cursor-default ${
                    st === 'approved' ? 'border-[var(--brand)] text-[var(--brand)] bg-[#eef5fe]'
                    : st === 'pending' ? 'border-[#eab308] text-[#a16207] bg-[#fefce8]'
                    : 'border-[#ddd] text-[#888]'}`}>
                  {b.label}
                  <span className="block text-[11px] mt-0.5 opacity-80">{st === 'approved' ? '가입됨' : st === 'pending' ? '승인 대기 중' : '눌러서 가입 신청'}</span>
                </button>
                {st !== 'none' && (
                  <button type="button" onClick={() => leave(b)} className="mt-1.5 text-[11px] text-[#aaa] underline underline-offset-2">
                    {st === 'approved' ? `${b.label} 이용 취소` : '승인 신청 취소'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className={group}>
        <Link href="/app/more/push" className={row}>앱 알림 <span className="text-[13px] text-[#999]">{push === 'on' ? '켜짐' : push === null ? '' : '꺼짐'} <span className="text-[#c4c4cc]" aria-hidden="true">›</span></span></Link>
      </section>

      {/* 문의하기 — 홈페이지와 같은 버튼, 누르면 지점별 전화번호 창 */}
      <div className="pt-3 text-center">
        <ContactButton className="inline-flex rounded-full border border-[var(--brand)] px-5 py-2 text-[14px] text-[var(--brand)]" />
      </div>

      <section className={group}>
        <a href="/app/site/privacy" className={row}>개인정보처리방침 <span className="text-[#c4c4cc]" aria-hidden="true">›</span></a>
        <button type="button" onClick={out} className={`${row} w-full text-left text-[#e11d48]`}>로그아웃</button>
      </section>

      <div className="pt-2 text-center">
        <button type="button" onClick={withdraw} className="text-[12px] text-[#bbb] underline underline-offset-2">회원 탈퇴</button>
      </div>
    </div>
  );
}
