'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAdmin } from '@/components/AdminContext';
import { supabase } from '@/lib/supabaseClient';
import { DEFAULT_TEMPLATES, SAMPLE_VARS, fillVars, type MessageSpec } from '@/lib/messages';

// 알림톡 테스트 보내기 (관리자) — 심사 통과한 템플릿을 내 휴대폰으로 한 통 보내 본다.
// 솔라피 템플릿 ID와 받는 번호는 이 브라우저에 기억해 둔다.

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

  useEffect(() => { setTo(load('alimtalk-test-to')); }, []);
  useEffect(() => {
    setTemplateId(load(`alimtalk-tid-${key}`));
    const base = { ...SAMPLE_VARS, ...(tpl.samples ?? {}) };
    setVals(Object.fromEntries(names.map(n => [n, base[n] ?? ''])));
    setResult(null);
  }, [key, tpl, names]);

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
      if (res.ok) setResult({ ok: true, text: `보냈어요. 휴대폰 카카오톡을 확인해 주세요.\n(솔라피 접수 번호 ${j.data?.groupId ?? j.data?.messageId ?? '-'} · 상태 ${j.data?.statusMessage ?? j.data?.statusCode ?? '-'})` });
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
          </label>
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
