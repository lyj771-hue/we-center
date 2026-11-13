'use client';

import { useState } from 'react';
import { useMember } from '@/components/MemberContext';
import { createMyProfile, getMyProfile, saveMyPhone } from '@/lib/store';
import { askConfirm } from '@/lib/dialog';

// 보호자 앱 문지기 화면 — 로그인 / 처음 가입 / 승인 대기. (캔버스 '보호자 앱' 1~3번 화면)

const CENTER_TEL = '010-4842-3164';
const wrap = 'min-h-[100dvh] bg-white text-[#0a0a0a] flex flex-col max-w-[480px] mx-auto px-7 pt-[env(safe-area-inset-top)] pb-[calc(40px+env(safe-area-inset-bottom))]';
const primaryBtn = 'h-[52px] w-full rounded-xl bg-[var(--brand)] text-white text-[15px] tracking-[0.05em] disabled:opacity-40';
const lineBtn = 'h-[52px] w-full rounded-xl border border-[#ddd] text-[#333] text-[15px] flex items-center justify-center gap-2';

const Logo = ({ size = 112 }: { size?: number }) => (
  <img src="/logo-we-heart.png" alt="We 소아재활센터" style={{ width: size, height: size }} className="object-contain" />
);

export function AppSplash({ failed }: { failed?: boolean }) {
  return (
    <div className={`${wrap} items-center justify-center gap-4`}>
      <Logo size={88} />
      {failed ? (
        <>
          <p className="text-[14px] text-[#888] text-center">정보를 불러오지 못했어요.</p>
          <button type="button" onClick={() => location.reload()} className="text-[13px] text-[var(--brand)] underline underline-offset-2">다시 시도</button>
        </>
      ) : <p className="text-[13px] text-[#bbb]">불러오는 중…</p>}
    </div>
  );
}

/** 1. 로그인 */
export function AppLogin() {
  const { login, loginOther } = useMember();
  return (
    <div className={`${wrap} items-center`}>
      <div className="flex-1 flex flex-col items-center justify-center gap-5">
        <Logo />
        <h1 className="display-heading text-[26px]! leading-[1.4]! text-[var(--brand)]">We 센터</h1>
        <p className="text-[14px] leading-[1.9] text-[#666] text-center">우리 아이 수업 시간표와<br />결제 내역을 한눈에 확인하세요</p>
      </div>
      <div className="w-full flex flex-col items-center gap-3.5">
        <button type="button" onClick={login} className="h-[52px] w-full rounded-xl bg-[#FEE500] text-[#191919] text-[15px] flex items-center justify-center gap-2">
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4C7 4 3 7.1 3 11c0 2.5 1.7 4.7 4.2 5.9l-.9 3.4c-.1.3.3.6.6.4l4-2.7c.4 0 .7.1 1.1.1 5 0 9-3.1 9-7S17 4 12 4z" fill="#191919" /></svg>
          카카오로 시작하기
        </button>
        <button type="button" onClick={loginOther} className="text-[12px] text-[#999] underline underline-offset-2">다른 카카오계정으로 로그인</button>
        <p className="mt-4 text-[11px] leading-[1.8] text-[#aaa] text-center">로그인하면 <a href="/privacy" className="text-[#777] underline underline-offset-2">개인정보처리방침</a>에 동의하게 됩니다.</p>
      </div>
    </div>
  );
}

/** 2. 처음 가입 — 다니는 센터 + 아이 이름 (보호자 전용이라 선생님 칸은 없다) */
export function AppJoin() {
  const { userId, kakaoPhone, setJoinedProfile, logout } = useMember();
  const last4 = (kakaoPhone ?? '').replace(/\D/g, '').slice(-4);
  const [center, setCenter] = useState<'eunpyeong' | 'uijeongbu' | ''>('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const child = name.trim();
    if (!userId) return;
    if (!center) { setError('다니는 센터를 골라 주세요.'); return; }
    if (!child) { setError('아이 이름을 적어 주세요.'); return; }
    // 카카오 전화번호는 카카오에서 막 로그인했을 때만 받는다
    if (!/^\d{4}$/.test(last4)) { setError('카카오계정 전화번호를 받지 못했어요. 가입 취소를 누른 뒤 카카오로 다시 로그인해 주세요.'); return; }
    if (!(await askConfirm(`센터: ${center === 'uijeongbu' ? '의정부' : '수색'}\n아이 이름: ${child}\n\n이대로 가입할까요?\n(아이 이름은 나중에 센터에서만 바꿀 수 있어요)`))) return;
    setSaving(true);
    try {
      await createMyProfile(userId, child, last4, center);
      if (kakaoPhone) await saveMyPhone(kakaoPhone).catch(() => {});
      const p = await getMyProfile(userId);
      if (p) setJoinedProfile(p);
    } catch (err) {
      const code = (err as { code?: string }).code;
      setError(code === '23505' ? '같은 아이 이름으로 이미 가입된 계정이 있어요. 센터에 말씀해 주세요.'
        : code === '23514' ? '카카오계정 전화번호를 받지 못했어요. 가입 취소를 누른 뒤 카카오로 다시 로그인해 주세요.'
        : code === '42501' ? '가입 정보를 저장할 수 없어요(카카오계정 전화번호가 없거나 이미 가입된 계정). 센터에 말씀해 주세요.'
        : `저장하지 못했어요. 잠시 후 다시 시도해 주세요.${code ? ` (${code})` : ''}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className={wrap}>
      <div className="h-14 flex items-center justify-end">
        <button type="button" onClick={logout} aria-label="가입 취소" className="w-11 h-11 -mr-3 flex items-center justify-center text-[#999]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>
        </button>
      </div>
      <div className="pt-6 space-y-2.5">
        <h1 className="display-heading text-[26px]! leading-[1.4]! text-[var(--brand)]">처음 오셨네요</h1>
        <p className="text-[14px] leading-[1.9] text-[#666]">다니는 센터를 고르고 아이 이름을 적어 주세요.</p>
      </div>
      <div className="mt-10 flex-1 space-y-8">
        <div className="space-y-2.5">
          <span className="block text-[12px] text-[#888]">다니는 센터 <span className="text-[#e11d48]">*</span></span>
          <div className="flex gap-2.5">
            {([['eunpyeong', '수색'], ['uijeongbu', '의정부']] as const).map(([k, l]) => (
              <button key={k} type="button" aria-pressed={center === k} onClick={() => { setCenter(k); setError(''); }}
                className={`flex-1 h-12 rounded-full text-[15px] border ${center === k ? 'border-[var(--brand)] bg-[var(--brand)] text-white' : 'border-[#ddd] text-[#555]'}`}>{l}</button>
            ))}
          </div>
        </div>
        <label className="block space-y-1.5">
          <span className="block text-[12px] text-[#888]">아이 이름 <span className="text-[#e11d48]">*</span></span>
          <input type="text" value={name} maxLength={20} placeholder="예: 김민준" onChange={e => { setName(e.target.value); setError(''); }}
            className="w-full border-b border-[#ccc] py-2.5 text-[17px] outline-none focus:border-[var(--brand)] placeholder:text-[#bbb] bg-transparent" />
          <span className="block text-[12px] leading-[1.7] text-[#999]">아이 이름은 가입 후 센터에서만 바꿀 수 있어요.</span>
        </label>
        <div className="space-y-1.5">
          <span className="block text-[12px] text-[#888]">보호자 연락처</span>
          <p className="py-2.5 border-b border-[#f0f0f0] text-[15px] text-[#555]">{last4 ? `카카오계정 번호 (뒷자리 ${last4})로 확인해요` : '카카오계정 번호로 확인해요'}</p>
        </div>
        {error && <p className="text-[13px] text-[#e11d48]">{error}</p>}
      </div>
      <button type="submit" disabled={saving || !center || !name.trim()} className={primaryBtn}>{saving ? '저장 중…' : '가입 신청'}</button>
    </form>
  );
}

/** 3. 승인 대기 — 승인되면 탭 화면이 열린다. teacherName 이 있으면 선생님 계정(보호자 전용 앱) */
export function AppPending({ teacherName, onLogout }: { teacherName?: string; onLogout: () => void }) {
  const { profile, refreshProfile, refreshBranches } = useMember();
  const [checking, setChecking] = useState(false);
  const check = async () => {
    setChecking(true);
    refreshProfile(); refreshBranches();
    await new Promise(r => setTimeout(r, 900));
    setChecking(false);
  };
  const center = profile?.center === 'uijeongbu' ? '의정부' : profile?.center === 'none' ? '-' : '수색';
  const row = 'flex justify-between py-3 text-[14px]';

  return (
    <div className={wrap}>
      <div className="h-14 flex items-center justify-center"><Logo size={44} /></div>
      <div className="flex-1 flex flex-col items-center pt-14 gap-4.5 text-center">
        <div className="w-[72px] h-[72px] rounded-full bg-[#FFF7E6] text-[#B45309] flex items-center justify-center">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15.5 14" /></svg>
        </div>
        {teacherName ? (
          <>
            <h1 className="display-heading text-[22px]! leading-[1.4]! text-[var(--brand)]">보호자 전용 앱이에요</h1>
            <p className="text-[14px] leading-[1.9] text-[#666]">{teacherName} 선생님 계정이에요.<br />시간표는 홈페이지에서 봐 주세요.</p>
          </>
        ) : (
          <>
            <h1 className="display-heading text-[24px]! leading-[1.4]! text-[var(--brand)]">가입 신청이 접수됐어요</h1>
            <p className="text-[14px] leading-[1.9] text-[#666]">센터에서 확인 후 승인해 드려요.<br />승인되면 수업 시간표, 수업 신청,<br />선결제 카드를 볼 수 있어요.</p>
            <div className="w-full mt-4 border border-[#ebebeb] rounded-[14px] px-[18px] py-1.5 divide-y divide-[#f4f4f4] text-left">
              <div className={row}><span className="text-[#999]">센터</span><span>{center}</span></div>
              <div className={row}><span className="text-[#999]">아이 이름</span><span>{profile?.nickname}</span></div>
              <div className={row}><span className="text-[#999]">상태</span><span className="text-[#B45309]">승인 대기 중</span></div>
            </div>
          </>
        )}
      </div>
      <div className="flex flex-col gap-2.5">
        {!teacherName && <button type="button" onClick={check} disabled={checking} className={primaryBtn}>{checking ? '확인 중…' : '승인 확인하기'}</button>}
        <a href={`tel:${CENTER_TEL.replace(/-/g, '')}`} className={lineBtn}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" /></svg>
          센터에 전화하기
        </a>
        <button type="button" onClick={onLogout} className="self-center mt-2 text-[12px] text-[#999] underline underline-offset-2">로그아웃</button>
      </div>
    </div>
  );
}
