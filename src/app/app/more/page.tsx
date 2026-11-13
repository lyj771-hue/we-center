'use client';

import { useMember } from '@/components/MemberContext';
import { useApp } from '@/components/app/AppShell';
import InstallHint from '@/components/app/InstallHint';
import PushToggle from '@/components/app/PushToggle';
import { BRANCHES } from '@/lib/mypage';
import { askConfirm } from '@/lib/dialog';

// 보호자 앱 — 더보기 탭: 내 정보 · 센터 안내(홈페이지 페이지로) · 로그아웃.
// 지점 추가·취소, 회원 탈퇴 같은 설정은 아직 홈페이지 마이페이지에서 한다.

const CENTER_TEL = '010-4842-3164';
const row = 'flex items-center justify-between h-[54px] text-[15px] text-[#27272a]';
const group = 'bg-white rounded-[18px] px-[18px] divide-y divide-[#f4f4f4]';
const Arrow = ({ text }: { text?: string }) => <span className="text-[13px] text-[#999]">{text ? `${text} ›` : <span className="text-[#c4c4cc]">›</span>}</span>;

export default function AppMore() {
  const { profile, branches, logout } = useMember();
  const { branch, child } = useApp();
  const joined = branches.filter(b => b.status !== 'none').map(b => b.label.replace('점', '')).join(' · ');

  const out = async () => { if (await askConfirm('로그아웃할까요?')) logout(); };

  return (
    <div className="space-y-4">
      <section className="bg-white rounded-[18px] p-[18px] flex items-center gap-3.5">
        <div className="w-[52px] h-[52px] rounded-full bg-[#EAF3FE] text-[var(--brand)] flex items-center justify-center text-[20px]">{(child?.childName ?? profile?.nickname ?? '').slice(-2, -1) || '·'}</div>
        <div className="space-y-1">
          <p className="text-[16px]">{child?.childName ?? profile?.nickname} 보호자님</p>
          <p className="text-[12px] text-[#888]">{BRANCHES.find(b => b.key === branch)?.label} · 카카오 로그인</p>
        </div>
      </section>

      <section className={group}>
        <a href="/mypage" className={row}>다니는 센터 <Arrow text={joined || '지점 가입'} /></a>
        <a href="/mypage" className={row}>마이페이지 (지점 가입·탈퇴) <Arrow /></a>
      </section>

      <section className={group}>
        <a href="/app/notices" className={row}>공지사항 <Arrow /></a>
        <a href="/payment" className={row}>결제 안내 <Arrow /></a>
        <a href="/location" className={row}>오시는 길 <Arrow /></a>
        <a href={`tel:${CENTER_TEL.replace(/-/g, '')}`} className={row}>센터 전화 <span className="text-[13px] text-[var(--brand)]">{CENTER_TEL}</span></a>
      </section>

      <section className={group}>
        <PushToggle />
      </section>

      <InstallHint always />

      <section className={group}>
        <a href="/" className={row}>홈페이지 보기 <Arrow /></a>
        <a href="/privacy" className={row}>개인정보처리방침 <Arrow /></a>
        <button type="button" onClick={out} className={`${row} w-full text-left text-[#e11d48]`}>로그아웃</button>
      </section>

      <p className="pt-1 text-center text-[11px] text-[#bbb]">© {new Date().getFullYear()} We 센터</p>
    </div>
  );
}
