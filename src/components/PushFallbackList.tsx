'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { Member } from '@/lib/types';
import type { MessageTemplate } from '@/lib/messages';
import { findSpec, renderNotification, specRows } from '@/lib/notifyRender';

// 관리자 앱 푸시 화면 — 앱 푸시가 안 가서 알림톡으로 보낸 알림 (supabase/push-first.sql 의 channel = 'alimtalk')
// 누구에게(보호자·아이) · 무슨 알림(내용 펼치기) · 왜 앱 푸시가 안 갔는지 · 알림톡 결과

type Row = {
  id: string; template_id: string; user_id: string | null; child_name: string | null; phone: string | null; vars: Record<string, string>;
  status: string; error: string | null; push_error: string | null; created_at: string; push_at: string | null;
};

const pad = (n: number) => String(n).padStart(2, '0');
const fmt = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const STATUS: Record<string, { text: string; cls: string }> = {
  sent: { text: '알림톡 보냄', cls: 'text-[#16a34a]' },
  failed: { text: '알림톡 실패', cls: 'text-red-500' },
  skipped: { text: '못 보냄', cls: 'text-red-500' },
  pending: { text: '대기', cls: 'text-[#d97706]' },
};

export default function PushFallbackList({ members }: { members: Member[] }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [tpls, setTpls] = useState<MessageTemplate[]>([]);
  const [failed, setFailed] = useState('');
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'people'>('list');

  useEffect(() => {
    Promise.all([
      supabase.from('outbox_messages').select('id, template_id, user_id, child_name, phone, vars, status, error, push_error, created_at, push_at')
        .eq('channel', 'alimtalk').order('created_at', { ascending: false }).limit(500),
      supabase.rpc('notification_templates'),
    ]).then(([r, t]) => {
      if (r.error) { setFailed(r.error.message); setRows([]); return; }
      setRows((r.data ?? []) as Row[]);
      setTpls((t.data ?? []) as MessageTemplate[]);
    });
  }, []);

  const specs = useMemo(() => specRows(tpls), [tpls]);
  const who = (r: Row) => {
    const m = r.user_id ? members.find(x => x.userId === r.user_id) : undefined;
    if (!r.user_id && /_admin(_\d+)?$/.test(r.template_id)) return '관리자';
    return [r.child_name, m && m.nickname !== r.child_name ? `보호자 ${m.nickname}` : ''].filter(Boolean).join(' · ') || '(알 수 없음)';
  };
  const reasons = useMemo(() => {
    const c = new Map<string, number>();
    for (const r of rows ?? []) c.set(r.push_error ?? '(이유 없음)', (c.get(r.push_error ?? '(이유 없음)') ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);
  const shown = (rows ?? []).filter(r => !reason || (r.push_error ?? '(이유 없음)') === reason);

  // 보호자별 — 앱 푸시가 안 가는 보호자와 가장 최근 이유
  const people = useMemo(() => {
    const by = new Map<string, { key: string; who: string; phone: string | null; count: number; last: Row }>();
    for (const r of shown) {
      const key = r.user_id ?? `x:${r.child_name}`;
      const p = by.get(key);
      if (p) p.count++; else by.set(key, { key, who: who(r), phone: r.phone, count: 1, last: r });
    }
    return [...by.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, members]);

  const card = 'bg-white border border-[#ececec] rounded-xl p-5 md:p-6';
  const chip = (on: boolean) => `px-3 py-1.5 rounded-full text-[12px] border ${on ? 'border-[var(--brand)] text-[var(--brand)] bg-[#eef5fe]' : 'border-[#e5e5e5] text-[#666]'}`;

  return (
    <section className={card}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="text-[16px]">앱 푸시가 안 가서 알림톡으로 보낸 알림</h2>
        <div className="flex gap-1.5">
          <button type="button" onClick={() => setView('list')} className={chip(view === 'list')}>알림별</button>
          <button type="button" onClick={() => setView('people')} className={chip(view === 'people')}>보호자별</button>
        </div>
      </div>
      <p className="text-[12px] text-[#888] mb-3">모든 알림은 앱 푸시로 먼저 보내고, 앱 푸시가 안 가는 분에게만 알림톡을 보내요. 최근 500건.</p>
      {failed && <p className="text-[13px] text-red-500 mb-3">불러오지 못했어요 — supabase/push-first.sql 을 실행했는지 확인해 주세요. ({failed})</p>}

      {reasons.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          <button type="button" onClick={() => setReason('')} className={chip(!reason)}>전체 {rows?.length ?? 0}</button>
          {reasons.map(([r, n]) => <button key={r} type="button" onClick={() => setReason(r === reason ? '' : r)} className={chip(reason === r)}>{r} {n}</button>)}
        </div>
      )}

      {rows === null ? <p className="text-[13px] text-[#bbb]">불러오는 중…</p>
        : shown.length === 0 ? <p className="text-[13px] text-[#bbb]">없어요. 알림이 모두 앱 푸시로 갔어요.</p>
        : view === 'people' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] min-w-[560px]">
              <thead><tr className="text-left text-[#999] border-b border-[#eee]"><th className="py-2 font-normal">보호자</th><th className="font-normal">번호</th><th className="font-normal">알림톡으로 간 수</th><th className="font-normal">최근 이유</th><th className="font-normal text-right">최근</th></tr></thead>
              <tbody>
                {people.map(p => (
                  <tr key={p.key} className="border-b border-[#f4f4f4] align-top">
                    <td className="py-2 pr-3">{p.who}</td>
                    <td className="pr-3 whitespace-nowrap tabular-nums text-[#666]">{p.phone ?? '없음'}</td>
                    <td className="pr-3">{p.count}건</td>
                    <td className="pr-3 text-[#b45309]">{p.last.push_error ?? '-'}</td>
                    <td className="text-right whitespace-nowrap tabular-nums">{fmt(p.last.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] min-w-[720px]">
              <thead><tr className="text-left text-[#999] border-b border-[#eee]"><th className="py-2 font-normal">때</th><th className="font-normal">받는 사람</th><th className="font-normal">알림 · 내용</th><th className="font-normal">앱 푸시가 안 간 이유</th><th className="font-normal text-right">알림톡</th></tr></thead>
              <tbody>
                {shown.map(r => {
                  const spec = findSpec(r.template_id, specs);
                  const msg = renderNotification(r.template_id, r.vars ?? {}, specs);
                  const st = STATUS[r.status] ?? { text: r.status, cls: '' };
                  const on = open === r.id;
                  return (
                    <tr key={r.id} className="border-b border-[#f4f4f4] align-top">
                      <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{fmt(r.created_at)}</td>
                      <td className="pr-3">{who(r)}{r.phone && <span className="block text-[#aaa] tabular-nums">{r.phone}</span>}</td>
                      <td className="pr-3">
                        <button type="button" onClick={() => setOpen(on ? null : r.id)} className="text-left">
                          <span className="text-[#999]">{spec?.label ?? r.template_id}</span>
                          <span className="block underline-offset-2 hover:underline">{msg.title} {on ? '▴' : '▾'}</span>
                        </button>
                        {on && (
                          <div className="mt-2 rounded-lg bg-[#f7f8fa] p-3 space-y-2">
                            {msg.items.length > 0 && <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">{msg.items.map((i, k) => <div key={k} className="contents"><dt className="text-[#999]">{i.name}</dt><dd>{i.value}</dd></div>)}</dl>}
                            {msg.body && <p className="whitespace-pre-line text-[#555]">{msg.body}</p>}
                          </div>
                        )}
                      </td>
                      <td className="pr-3 text-[#b45309]">{r.push_error ?? '-'}</td>
                      <td className={`text-right whitespace-nowrap ${st.cls}`}>{st.text}{r.error && r.status !== 'sent' && <span className="block text-[11px] text-[#aaa] whitespace-normal max-w-[180px] ml-auto">{r.error}</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
    </section>
  );
}
