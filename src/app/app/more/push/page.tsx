'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import InstallHint from '@/components/app/InstallHint';
import type { PushState } from '@/lib/push';
import { disablePush, enablePush, getPushState } from '@/lib/push';
import { askConfirm, showAlert } from '@/lib/dialog';

// 더보기 › 앱 알림 — 켜기·끄기 스위치. 끌 때는 센터 알림을 못 받는다고 한 번 묻는다.

const NOTE: Record<PushState, string> = {
  on: '센터 공지·수업 소식을 이 휴대폰으로 받아요.',
  off: '켜면 센터 공지·수업 소식을 바로 알려 드려요.',
  denied: '휴대폰 설정에서 알림이 차단돼 있어요. 설정 → 알림 → We 센터에서 허용해 주세요.',
  'ios-needs-install': '아이폰은 홈 화면에 추가한 앱에서만 알림을 켤 수 있어요. 아래 안내대로 추가한 뒤 그 앱에서 켜 주세요.',
  unsupported: '이 브라우저는 앱 알림을 지원하지 않아요.',
};

export default function AppPushSettings() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { getPushState().then(setState).catch(() => setState('unsupported')); }, []);

  const on = state === 'on';
  const usable = state === 'on' || state === 'off';

  const toggle = async () => {
    if (!usable || busy) return;
    setBusy(true);
    try {
      if (on) {
        if (!(await askConfirm('알림을 끄면 센터에서 보내는 공지와 수업 소식 알림을 받을 수 없어요.\n그래도 끌까요?'))) return;
        setState(await disablePush());
      } else {
        const s = await enablePush();
        setState(s);
        if (s === 'denied') showAlert('알림이 차단돼 있어요. 휴대폰 설정에서 We 센터 알림을 허용해 주세요.');
      }
    } catch (e) { showAlert(`바꾸지 못했어요.\n${(e as Error).message}`); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <Link href="/app/more" className="inline-block px-1 text-[13px] text-[#999]">‹ 더보기</Link>
      <section className="bg-white rounded-[18px] px-[18px] py-4">
        <div className="flex items-center justify-between gap-4">
          <span id="push-label" className="text-[16px] text-[#27272a]">앱 알림</span>
          <button type="button" role="switch" aria-checked={on} aria-labelledby="push-label" onClick={toggle} disabled={!usable || busy || state === null}
            className={`relative w-[52px] h-[32px] rounded-full transition-colors shrink-0 disabled:opacity-40 ${on ? 'bg-[var(--brand)]' : 'bg-[#d4d4d8]'}`}>
            <span className={`absolute top-[3px] left-[3px] w-[26px] h-[26px] rounded-full bg-white shadow transition-transform ${on ? 'translate-x-[20px]' : ''}`} />
          </button>
        </div>
        {state && <p className="mt-2 text-[13px] leading-[1.7] text-[#888]">{NOTE[state]}</p>}
      </section>
      {state === 'ios-needs-install' && <InstallHint always />}
    </div>
  );
}
