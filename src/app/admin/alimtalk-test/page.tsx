'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAdmin } from '@/components/AdminContext';
import { supabase } from '@/lib/supabaseClient';
import { DEFAULT_TEMPLATES, SAMPLE_VARS, fillVars, type MessageSpec } from '@/lib/messages';
import { getAlimtalkTemplateIds, saveAlimtalkTemplateId } from '@/lib/leave';

// 알림톡 테스트 보내기 (관리자) — 심사 통과한 템플릿을 내 휴대폰으로 한 통 보내 본다.
// 테스트가 잘 가면 그 템플릿 ID를 알림 종류에 저장한다 — 이후 자동 알림이 그 ID로 간다(supabase/alimtalk-templates.sql).

const varsOf = (s: MessageSpec) => {
  const text = [s.title, s.sub, s.body, s.button.url, ...s.items.flatMap(i => [i.name, i.value])].join('\n');
  return [...new Set([...text.matchAll(/#\{([^}]+)\}/g)].map(m => m[1].trim()))];
};
const load = (k: string, d = '') => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const save = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* 괜찮다 */ } };

export default function AlimtalkTestPage() {
  const { isAdmin } = useAdmin();
  const [key, setKey] = useState('booking_result');
  const tpl = DEFAULT_TEMPLATES.find(t => t.id === key)!;
  const names = useMemo(() => varsOf(tpl.spec), [tpl]);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [templateId, setTemplateId] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [savedIds, setSavedIds] = useState<Record<string, string>>({});
  // 템플릿 ID가 없어서 못 보낸(기다리는) 이 알림들
  const [waiting, setWaiting] = useState<string[]>([]);
  const loadWaiting = async (k: string) => {
    const { data } = await supabase.from('outbox_messages').select('id').eq('template_id', k).eq('status', 'pending');
    setWaiting((data ?? []).map(r => r.id as string));
  };
  useEffect(() => { loadWaiting(key); }, [key]);
  const saveId = async () => {
    try {
      await saveAlimtalkTemplateId(key, templateId);
      setSavedIds(x => ({ ...x, [key]: templateId.trim() }));
      setResult({ ok: true, text: '템플릿 ID를 저장했어요. 이제 이 알림은 자동으로 가요.' });
    } catch (e) {
      setResult({ ok: false, text: `저장하지 못했어요 — SQL(supabase/alimtalk-templates.sql)을 실행했는지 확인해 주세요.\n${(e as Error).message}` });
    }
  };
  const sendWaiting = async () => {
    setBusy(true); setResult(null);
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch('/api/alimtalk/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}) },
        body: JSON.stringify({ ids: waiting }),
      });
      const j = await res.json().catch(() => ({}));
      setResult(res.ok ? { ok: true, text: `보냄 ${j.sent}건${j.failed ? ` · 실패 ${j.failed}건` : ''}${j.skipped ? ` · 번호 없음 ${j.skipped}건` : ''}` } : { ok: false, text: j.error ?? `오류 ${res.status}` });
      await loadWaiting(key);
    } finally { setBusy(false); }
  };
  useEffect(() => { getAlimtalkTemplateIds().then(setSavedIds).catch(() => {}); }, []);

  useEffect(() => { setTo(load('alimtalk-test-to')); }, []);
  useEffect(() => {
    setTemplateId(savedIds[key] ?? load(`alimtalk-tid-${key}`));
    const base = { ...SAMPLE_VARS, ...(tpl.samples ?? {}) };
    setVals(Object.fromEntries(names.map(n => [n, base[n] ?? ''])));
    setResult(null);
  }, [key, tpl, names, savedIds]);

  if (!isAdmin) return <p className="text-center text-[14px] text-[#aaa] py-32">관리자만 볼 수 있는 화면이에요.</p>;

  const send = async () => {
    setBusy(true); setResult(null);
    save('alimtalk-test-to', to); save(`alimtalk-tid-${key}`, templateId);
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch('/api/alimtalk/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}) },
        body: JSON.stringify({ to, templateId: templateId.trim(), variables: Object.fromEntries(Object.entries(vals).map(([k, v]) => [`#{${k}}`, v])) }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        // 잘 갔으면 이 알림 종류의 템플릿 ID로 저장 — 자동 알림이 이 ID로 간다
        const saved = await saveAlimtalkTemplateId(key, templateId).then(() => true).catch(() => false);
        if (saved) setSavedIds(x => ({ ...x, [key]: templateId.trim() }));
        setResult({ ok: true, text: `보냈어요. 휴대폰 카카오톡을 확인해 주세요.${saved ? '\n이 템플릿 ID를 저장했어요 — 이제 이 알림은 자동으로 가요.' : '\n(템플릿 ID 저장은 못 했어요 — SQL alimtalk-templates.sql 을 실행해 주세요)'}\n(솔라피 접수 번호 ${j.data?.groupId ?? j.data?.messageId ?? '-'} · 상태 ${j.data?.statusMessage ?? j.data?.statusCode ?? '-'})` });
      }
      else setResult({ ok: false, text: `보내지 못했어요.\n${j.error ?? j.data?.errorMessage ?? j.data?.message ?? JSON.stringify(j.data ?? j)}` });
    } catch (e) {
      setResult({ ok: false, text: `보내지 못했어요.\n${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  };

  const s = tpl.spec;
  const v = (t: string) => fillVars(t, vals);
  const field = 'w-full border-b border-[#ddd] py-2 text-[14px] outline-none focus:border-[var(--brand)] bg-transparent';
  return (
    <div className="max-w-[920px] mx-auto px-5 pt-8 pb-16 fade-up">
      <h1 className="display-heading mb-2">알림톡 테스트</h1>
      <p className="text-[12px] text-[#888] mb-8 leading-[1.8]">심사를 통과한 템플릿을 내 휴대폰으로 한 통 보내 봐요. 실제 보호자에게는 가지 않아요.<br />템플릿 ID는 솔라피 콘솔 → 카카오 알림톡 → 템플릿 목록에서 복사해요 (KA01TP…).</p>
      <div className="grid md:grid-cols-2 gap-10">
        <div className="space-y-5">
          <label className="block"><span className="block text-[12px] text-[#888]">알림 종류</span>
            <select value={key} onChange={e => setKey(e.target.value)} className={field}>
              {DEFAULT_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </label>
          <label className="block"><span className="block text-[12px] text-[#888]">솔라피 템플릿 ID</span>
            <input value={templateId} onChange={e => setTemplateId(e.target.value)} placeholder="KA01TP…" className={`${field} font-mono`} />
            <span className="mt-1 flex items-center gap-2">
              <span className={`text-[11px] ${savedIds[key] && savedIds[key] === templateId.trim() ? 'text-[#047857]' : 'text-[#b45309]'}`}>
                {savedIds[key] && savedIds[key] === templateId.trim() ? '저장된 ID — 이 알림은 자동으로 가요' : '아직 저장 안 됨 — [ID 저장]을 눌러 주세요'}
              </span>
              <button type="button" onClick={saveId} disabled={!templateId.trim() || savedIds[key] === templateId.trim()}
                className="ml-auto text-[12px] px-3 py-1 rounded-full border border-[var(--brand)] text-[var(--brand)] disabled:opacity-30">ID 저장</button>
            </span>
          </label>
          {waiting.length > 0 && (
            <div className="rounded-xl bg-[#fffbeb] px-4 py-3 text-[12px] text-[#92400e] flex items-center gap-3">
              <span className="flex-1">템플릿 ID가 없어서 못 보낸 이 알림 {waiting.length}건이 기다리고 있어요.</span>
              <button type="button" onClick={sendWaiting} disabled={busy || !savedIds[key]} className="px-3 py-1 rounded-full bg-[#92400e] text-white disabled:opacity-40">지금 보내기</button>
            </div>
          )}
          <label className="block"><span className="block text-[12px] text-[#888]">받는 번호 (내 휴대폰)</span>
            <input value={to} onChange={e => setTo(e.target.value)} inputMode="tel" placeholder="010-0000-0000" className={field} />
          </label>
          <div>
            <p className="text-[12px] text-[#888] mb-1">변수 값 — 심사받은 템플릿과 같은 이름이어야 해요</p>
            <div className="grid grid-cols-2 gap-x-4">
              {names.map(n => (
                <label key={n} className="block"><span className="block text-[11px] text-[#aaa] mt-2">#{'{'}{n}{'}'}</span>
                  <input value={vals[n] ?? ''} onChange={e => setVals(x => ({ ...x, [n]: e.target.value }))} className={field} />
                </label>
              ))}
            </div>
          </div>
          <button onClick={send} disabled={busy || !templateId.trim() || to.replace(/\D/g, '').length < 10}
            className="w-full rounded-full bg-[#FEE500] text-[#191919] text-[14px] py-3 disabled:opacity-40">{busy ? '보내는 중…' : '테스트 보내기'}</button>
          {result && <p className={`whitespace-pre-line text-[13px] rounded-xl px-4 py-3 ${result.ok ? 'bg-[#ecfdf5] text-[#047857]' : 'bg-[#fef2f2] text-[#b91c1c]'}`}>{result.text}</p>}
        </div>
        {/* 보낼 모양 미리보기 */}
        <div className="rounded-2xl bg-[#b2c7da] p-4">
          <div className="rounded-2xl bg-white overflow-hidden text-[13px] text-[#191919]">
            <div className="bg-[#FEE500] px-4 py-2 text-[12px] font-semibold">알림톡 도착</div>
            <div className="p-4 space-y-2">
              <p className="text-[15px] font-semibold">{v(s.title)}</p>
              <p className="text-[12px] text-[#888]">{v(s.sub)}</p>
              <div className="border-t border-[#eee] pt-2 space-y-1">
                {s.items.map((i, k) => <p key={k} className="flex gap-3"><span className="w-16 shrink-0 text-[#888]">{v(i.name)}</span><span>{v(i.value)}</span></p>)}
              </div>
              <p className="whitespace-pre-line pt-2 border-t border-[#eee]">{v(s.body)}</p>
              {s.button.name && <p className="mt-2 rounded-md bg-[#f4f4f5] py-2 text-center">{s.button.name}</p>}
            </div>
          </div>
          <p className="mt-2 text-[11px] text-[#41566b]">미리보기는 사이트에 적어 둔 모양이에요. 실제로는 솔라피에 심사받은 템플릿 모양으로 가요.</p>
        </div>
      </div>
    </div>
  );
}
