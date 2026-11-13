'use client';

import { useEffect, useState } from 'react';
import type { PushState } from '@/lib/push';
import { disablePush, enablePush, getPushState } from '@/lib/push';
import { showAlert } from '@/lib/dialog';

// 앱 알림 켜기/끄기. banner = 홈 맨 위(아직 안 켰을 때만 크게), 아니면 더보기의 한 줄(켜기·끄기)

export default function PushToggle({ banner }: { banner?: boolean }) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { getPushState().then(setState).catch(() => setState('unsupported')); }, []);

  const turnOn = async () => {
    setBusy(true);
    try {
      const s = await enablePush();
      setState(s);
      if (s === 'on') showAlert('알림을 켰어요. 센터 소식을 이 휴대폰으로 알려 드릴게요.');
      else if (s === 'denied') showAlert('알림이 차단돼 있어요. 휴대폰 설정에서 We 센터 알림을 허용해 주세요.');
    } catch (e) { showAlert(`알림을 켜지 못했어요.\n${(e as Error).message}`); }
    finally { setBusy(false); }
  };
  const turnOff = async () => {
    setBusy(true);
    try { setState(await disablePush()); } catch (e) { showAlert(`알림을 끄지 못했어요.\n${(e as Error).message}`); }
    finally { setBusy(false); }
  };

  if (state === null) return null;

  if (banner) {
    if (state !== 'off') return null;
    return (
      <section className="bg-white rounded-[18px] p-[18px] flex items-center gap-3 border border-[#e3eefc]">
        <span className="w-11 h-11 rounded-full bg-[#EAF3FE] text-[var(--brand)] flex items-center justify-center shrink-0">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] text-[#27272a]">알림 받기</p>
          <p className="text-[12px] text-[#888]">공지·수업 소식을 바로 알려 드려요</p>
        </div>
        <button type="button" onClick={turnOn} disabled={busy} className="h-9 px-4 rounded-full bg-[var(--brand)] text-white text-[13px] disabled:opacity-50">켜기</button>
      </section>
    );
  }

  const note: Record<PushState, string> = {
    on: '켜짐',
    off: '꺼짐',
    denied: '휴대폰 설정에서 차단됨',
    'ios-needs-install': '홈 화면에 추가한 앱에서 켤 수 있어요',
    unsupported: '이 브라우저는 지원하지 않아요',
  };
  return (
    <div className="flex items-center justify-between min-h-[54px] py-2 gap-3">
      <span className="text-[15px] text-[#27272a]">앱 알림<span className="block text-[12px] text-[#999]">{note[state]}</span></span>
      {state === 'on' && <button type="button" onClick={turnOff} disabled={busy} className="h-9 px-4 rounded-full border border-[#ddd] text-[13px] text-[#555]">끄기</button>}
      {state === 'off' && <button type="button" onClick={turnOn} disabled={busy} className="h-9 px-4 rounded-full bg-[var(--brand)] text-white text-[13px]">켜기</button>}
    </div>
  );
}
