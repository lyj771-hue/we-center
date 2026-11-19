'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { Member } from '@/lib/types';
import type { MessageTemplate } from '@/lib/messages';
import { findSpec, renderNotification, specRows } from '@/lib/notifyRender';

// 관리자 앱 푸시 화면 — 자동으로 나간 알림(수업 안내·스케줄 공지·결제 등, outbox_messages)이 어떻게 갔는지.
// 모든 알림은 앱 푸시로 먼저 가고(supabase/push-first.sql, channel = 'push'), 안 간 것만 알림톡(channel = 'alimtalk')
// 누구에게(보호자·아이) · 무슨 알림(내용 펼치기) · 앱 푸시/알림톡 · 앱 푸시가 안 간 이유 · 결과
// 관리자가 [보내기]로 직접 보낸 앱 푸시는 이 목록이 아니라 아래 "직접 보낸 앱 푸시 기록"(push_log)

type Row = {
  id: string; template_id: string; user_id: string | null; child_name: string | null; phone: string | null; vars: Record<string, string>;
  status: string; error: string | null; push_error: string | null; channel: 'push' | 'alimtalk'; created_at: string; push_at: string | null;
};
type Channel = '' | 'push' | 'alimtalk';

const pad = (n: number) => String(n).padStart(2, '0');
const fmt = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const RESULT: Record<string, { text: string; cls: string }> = {
  'push:sent': { text: '앱 푸시 보냄', cls: 'text-[var(--brand)]' },
  'alimtalk:sent': { text: '알림톡 보냄', cls: 'text-[#16a34a]' },
  'alimtalk:failed': { text: '알림톡 실패', cls: 'text-red-500' },
  'alimtalk:skipped': { text: '못 보냄', cls: 'text-red-500' },
  'alimtalk:pending': { text: '알림톡 대기', cls: 'text-[#d97706]' },
};
const Via = ({ c }: { c: Row['channel'] }) => c === 'push'
  ? <span className="text-[11px] px-1.5 rounded bg-[#eef5fe] text-[var(--brand)] whitespace-nowrap">앱 푸시</span>
  : <span className="text-[11px] px-1.5 rounded bg-[#fef3c7] text-[#92400e] whitespace-nowrap">알림톡</span>;

export default function PushFallbackList({ members }: { members: Member[] }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [tpls, setTpls] = useState<MessageTemplate[]>([]);
  const [failed, setFailed] = useState('');
  const [channel, setChannel] = useState<Channel>('');
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'people'>('list');

  useEffect(() => {
    Promise.all([
      supabase.from('outbox_messages').select('id, template_id, user_id, child_name, phone, vars, status, error, push_error, channel, created_at, push_at')
        .not('channel', 'is', null).order('created_at', { ascending: false }).limit(500),
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
  const all = rows ?? [];
  const nPush = all.filter(r => r.channel === 'push').length, nTalk = all.length - nPush;
  const byChannel = all.filter(r => !channel || r.channel === channel);
  // 앱 푸시가 안 간 이유 — 알림톡으로 간 것만
  const reasons = useMemo(() => {
    const c = new Map<string, number>();
    for (const r of byChannel) if (r.channel === 'alimtalk') c.set(r.push_error ?? '(이유 없음)', (c.get(r.push_error ?? '(이유 없음)') ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [byChannel]);
  const shown = byChannel.filter(r => !reason || (r.channel === 'alimtalk' && (r.push_error ?? '(이유 없음)') === reason));

  // 보호자별 — 앱 푸시·알림톡으로 간 수, 앱 푸시가 안 간 가장 최근 이유
  const people = useMemo(() => {
    const by = new Map<string, { key: string; who: string; phone: string | null; push: number; talk: number; last: Row; lastWhy: string | null }>();
    for (const r of shown) {
      const key = r.user_id ?? `x:${r.child_name}`;
      let p = by.get(key);
      if (!p) { p = { key, who: who(r), phone: r.phone, push: 0, talk: 0, last: r, lastWhy: null }; by.set(key, p); }
      if (r.channel === 'push') p.push++; else { p.talk++; if (p.lastWhy === null) p.lastWhy = r.push_error ?? '(이유 없음)'; }
      if (!p.phone && r.phone) p.phone = r.phone;
    }
    return [...by.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, members]);

  const card = 'bg-white border border-[#ececec] rounded-xl p-5 md:p-6';
  const chip = (on: boolean) => `px-3 py-1.5 rounded-full text-[12px] border ${on ? 'border-[var(--brand)] text-[var(--brand)] bg-[#eef5fe]' : 'border-[#e5e5e5] text-[#666]'}`;
  const pickChannel = (c: Channel) => { setChannel(c); setReason(''); };

  return (
    <section className={card}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="text-[16px]">자동으로 보낸 알림 (수업 안내·스케줄·결제 등)</h2>
        <div className="flex gap-1.5">
          <button type="button" onClick={() => setView('list')} className={chip(view === 'list')}>알림별</button>
          <button type="button" onClick={() => setView('people')} className={chip(view === 'people')}>보호자별</button>
        </div>
      </div>
      <p className="text-[12px] text-[#888] mb-3">모든 알림은 앱 푸시로 먼저 보내고, 앱 푸시가 안 가는 분에게만 알림톡을 보내요. 최근 500건.</p>
      {failed && <p className="text-[13px] text-red-500 mb-3">불러오지 못했어요 — supabase/push-first.sql 을 실행했는지 확인해 주세요. ({failed})</p>}

      <div className="flex flex-wrap gap-1.5 mb-2">
        <button type="button" onClick={() => pickChannel('')} className={chip(channel === '')}>전체 {all.length}</button>
        <button type="button" onClick={() => pickChannel('push')} className={chip(channel === 'push')}>앱 푸시로 감 {nPush}</button>
        <button type="button" onClick={() => pickChannel('alimtalk')} className={chip(channel === 'alimtalk')}>알림톡으로 감 {nTalk}</button>
      </div>
      {reasons.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-4">
          <span className="text-[12px] text-[#999] mr-1">앱 푸시가 안 간 이유</span>
          {reasons.map(([r, n]) => <button key={r} type="button" onClick={() => setReason(r === reason ? '' : r)} className={chip(reason === r)}>{r} {n}</button>)}
        </div>
      )}

      {rows === null ? <p className="text-[13px] text-[#bbb]">불러오는 중…</p>
        : shown.length === 0 ? <p className="text-[13px] text-[#bbb]">{channel === 'alimtalk' ? '없어요. 알림이 모두 앱 푸시로 갔어요.' : '아직 보낸 알림이 없어요.'}</p>
        : view === 'people' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] min-w-[640px]">
              <thead><tr className="text-left text-[#999] border-b border-[#eee]"><th className="py-2 font-normal">보호자</th><th className="font-normal">번호</th><th className="font-normal">앱 푸시</th><th className="font-normal">알림톡</th><th className="font-normal">앱 푸시가 안 간 최근 이유</th><th className="font-normal text-right">최근</th></tr></thead>
              <tbody>
                {people.map(p => (
                  <tr key={p.key} className="border-b border-[#f4f4f4] align-top">
                    <td className="py-2 pr-3">{p.who}</td>
                    <td className="pr-3 whitespace-nowrap tabular-nums text-[#666]">{p.phone ?? '없음'}</td>
                    <td className="pr-3 tabular-nums">{p.push}건</td>
                    <td className="pr-3 tabular-nums">{p.talk}건</td>
                    <td className="pr-3 text-[#b45309]">{p.lastWhy ?? '-'}</td>
                    <td className="text-right whitespace-nowrap tabular-nums">{fmt(p.last.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] min-w-[860px]">
              <thead><tr className="text-left text-[#999] border-b border-[#eee]"><th className="py-2 font-normal">때</th><th className="font-normal">받는 사람</th><th className="font-normal">알림</th><th className="font-normal">내용</th><th className="font-normal">어떻게</th><th className="font-normal text-right">결과</th></tr></thead>
              <tbody>
                {shown.map(r => {
                  const spec = findSpec(r.template_id, specs);
                  const msg = renderNotification(r.template_id, r.vars ?? {}, specs);
                  const st = RESULT[`${r.channel}:${r.status}`] ?? { text: r.status, cls: '' };
                  const on = open === r.id;
                  return (
                    <tr key={r.id} className="border-b border-[#f4f4f4] align-top">
                      <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{fmt(r.created_at)}</td>
                      <td className="pr-3">{who(r)}</td>
                      <td className="pr-3 text-[#666]">{spec?.label ?? r.template_id}</td>
                      <td className="pr-3">
                        <button type="button" onClick={() => setOpen(on ? null : r.id)} className="text-left">
                          <span className="block underline-offset-2 hover:underline">{msg.title} {on ? '▴' : '▾'}</span>
                        </button>
                        {on && (
                          <div className="mt-2 rounded-lg bg-[#f7f8fa] p-3 space-y-2">
                            {msg.items.length > 0 && <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">{msg.items.map((i, k) => <div key={k} className="contents"><dt className="text-[#999]">{i.name}</dt><dd>{i.value}</dd></div>)}</dl>}
                            {msg.body && <p className="whitespace-pre-line text-[#555]">{msg.body}</p>}
                          </div>
                        )}
                      </td>
                      <td className="pr-3"><Via c={r.channel} />{r.channel === 'alimtalk' && r.push_error && <span className="block mt-1 text-[#b45309]">앱 푸시 안 감: {r.push_error}</span>}</td>
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
