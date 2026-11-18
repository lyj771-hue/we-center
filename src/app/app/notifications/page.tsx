'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { AppNotification } from '@/lib/notifications';
import { getMyNotifications, markNotificationsRead } from '@/lib/notifications';
import { clearAppBadge } from '@/lib/push';

// 앱 🔔 알림 내역 — 센터에서 온 알림(앱 푸시로 왔든 알림톡으로 왔든) 최근 100개. 열면 다 읽음.

const pad = (n: number) => String(n).padStart(2, '0');
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const fmt = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}(${DOW[d.getDay()]}) ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

export default function NotificationsPage() {
  const [list, setList] = useState<AppNotification[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    getMyNotifications().then(l => { setList(l); setOpen(l[0]?.id ?? null); }).catch(() => { setFailed(true); setList([]); });
    markNotificationsRead().catch(() => {});
    clearAppBadge();
  }, []);

  return (
    <div className="space-y-3">
      <h1 className="text-[20px] px-1">알림</h1>
      {list === null ? <p className="text-center text-[14px] text-[#aaa] py-16">불러오는 중…</p>
        : failed ? <p className="text-center text-[14px] text-[#aaa] py-16">알림을 불러오지 못했어요.</p>
        : list.length === 0 ? <p className="text-center text-[14px] text-[#aaa] py-16">아직 받은 알림이 없어요.</p>
        : list.map(n => {
          const on = open === n.id;
          return (
            <article key={n.id} className="bg-white rounded-[18px] overflow-hidden">
              <button type="button" onClick={() => setOpen(on ? null : n.id)} aria-expanded={on} className="w-full text-left px-4 py-3.5 flex gap-3 items-start">
                <img src="/app/icon-192.png" alt="" className="w-9 h-9 rounded-[10px] shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-[12px] text-[#999] tabular-nums">{fmt(n.at)}</span>
                  <span className="block text-[15px] text-[#111] mt-0.5">{n.title}</span>
                  {!on && n.pushText && <span className="block text-[13px] text-[#777] mt-0.5 line-clamp-1 whitespace-pre-line">{n.pushText.split('\n')[0]}</span>}
                </span>
              </button>
              {on && (
                <div className="px-4 pb-4 pl-[64px] space-y-3">
                  {n.items.length > 0 && (
                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[14px] border-t border-[#f0f0f0] pt-3">
                      {n.items.map((i, k) => <div key={k} className="contents"><dt className="text-[#999]">{i.name}</dt><dd className="text-[#222] break-keep">{i.value}</dd></div>)}
                    </dl>
                  )}
                  {n.body && <p className="text-[14px] text-[#444] leading-[1.6] whitespace-pre-line">{n.body}</p>}
                  {n.button && (
                    <Link href={n.button.url} className="block text-center h-11 leading-[44px] rounded-[12px] bg-[#EAF3FE] text-[var(--brand)] text-[14px]">{n.button.name}</Link>
                  )}
                </div>
              )}
            </article>
          );
        })}
    </div>
  );
}
