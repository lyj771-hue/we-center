'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdmin } from '@/components/AdminContext';
import { supabase } from '@/lib/supabaseClient';
import { getMessageTemplates, toRows, type MessageSpec } from '@/lib/messages';
import { getAlimtalkTemplateIds, saveAlimtalkTemplateId } from '@/lib/leave';
import { askConfirm, showAlert } from '@/lib/dialog';

// 알림톡 템플릿 심사 올리기 (관리자) — 메시지 모양 화면에 적어 둔 알림들을 솔라피에 한 번에 등록하고 카카오 검수 요청.
// 솔라피 템플릿 이름 끝의 [알림 종류] 로 사이트 알림과 짝을 짓는다. 통과(APPROVED)하면 템플릿 ID를 자동 저장 → 바로 보낼 수 있다.
// 수업 일정 알림은 수업 개수(1~8개)마다 따로 — lesson_tomorrow_1 ~ lesson_tomorrow_8.

type Row = { key: string; label: string; spec: MessageSpec };
type Remote = { templateId: string; name: string; status: string; dateCreated?: string; comment: string };

const STATUS: Record<string, { label: string; cls: string }> = {
  USING: { label: '사용 중', cls: 'bg-[#ecfdf5] text-[#047857]' },
  APPROVED: { label: '통과', cls: 'bg-[#ecfdf5] text-[#047857]' },
  INSPECTING: { label: '심사 중', cls: 'bg-[#eff6ff] text-[#1d4ed8]' },
  PENDING: { label: '등록만 됨', cls: 'bg-[#fffbeb] text-[#92400e]' },
  REJECTED: { label: '반려', cls: 'bg-[#fef2f2] text-[#b91c1c]' },
  NONE: { label: '안 올림', cls: 'bg-[#f4f4f5] text-[#71717a]' },
};

const nameOf = (r: Row) => `${r.label} [${r.key}]`;

async function api(method: 'GET' | 'POST', body?: unknown) {
  const { data } = await supabase.auth.getSession();
  const res = await fetch('/api/alimtalk/templates', {
    method,
    headers: { 'Content-Type': 'application/json', ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? `오류 ${res.status}`);
  return j;
}

/** 수업 일정 알림 → 1개용 ~ 8개용 */
function expand(rows: Row[]): Row[] {
  return rows.flatMap(r => {
    if (r.key !== 'lesson_tomorrow') return [r];
    const head = r.spec.items.filter(i => !/^수업\s*\d+$/.test(i.name.trim()));
    return Array.from({ length: 8 }, (_, k) => {
      const n = k + 1;
      const lessons = Array.from({ length: n }, (_, j) => ({ name: `수업 ${j + 1}`, value: `#{수업${j + 1}}` }));
      return { key: `${r.key}_${n}`, label: `${r.label} ${n}개`, spec: { ...r.spec, items: [...head, ...lessons] } };
    });
  });
}

export default function AlimtalkTemplatesPage() {
  const { isAdmin } = useAdmin();
  const [rows, setRows] = useState<Row[]>([]);
  const [remote, setRemote] = useState<Remote[]>([]);
  const [savedIds, setSavedIds] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setFailed('');
    try {
      const saved = await getMessageTemplates().catch(() => []);
      setRows(expand(toRows(saved).map(r => ({ key: r.id, label: r.label, spec: r.spec }))));
      const [ids, list] = await Promise.all([getAlimtalkTemplateIds().catch(() => ({} as Record<string, string>)), api('GET')]);
      const tpls = list.templates as Remote[];
      // 통과했는데 아직 저장 안 된 ID → 저장 (이제 그 알림은 자동으로 간다)
      for (const t of tpls) {
        const key = t.name.match(/\[([\w-]+)\]\s*$/)?.[1];
        if (key && t.status === 'APPROVED' && ids[key] !== t.templateId && !tpls.some(o => o.name === t.name && o.status === 'APPROVED' && (o.dateCreated ?? '') > (t.dateCreated ?? ''))) {
          await saveAlimtalkTemplateId(key, t.templateId).then(() => { ids[key] = t.templateId; }).catch(() => {});
        }
      }
      setSavedIds({ ...ids }); setRemote(tpls);
    } catch (e) {
      setFailed((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  // 알림마다 상태 — 저장된 ID가 있으면 사용 중, 없으면 솔라피에 올린 것 중 가장 최근 것
  const statusOf = useMemo(() => {
    const m: Record<string, { code: string; remote?: Remote; next?: Remote }> = {};
    for (const r of rows) {
      const mine = remote.filter(t => t.name.endsWith(`[${r.key}]`)).sort((a, b) => (b.dateCreated ?? '').localeCompare(a.dateCreated ?? ''));
      // 사용 중인데 새 버전을 올렸으면 그것도 — 새 버전이 통과하면 그 ID로 바뀐다
      if (savedIds[r.key]) m[r.key] = { code: 'USING', remote: remote.find(t => t.templateId === savedIds[r.key]), next: mine.find(t => t.templateId !== savedIds[r.key] && t.status !== 'APPROVED' && (t.dateCreated ?? '') > (remote.find(o => o.templateId === savedIds[r.key])?.dateCreated ?? '')) };
      else m[r.key] = mine[0] ? { code: mine[0].status, remote: mine[0] } : { code: 'NONE' };
    }
    return m;
  }, [rows, remote, savedIds]);
  // 사용 중인 것도 새 버전으로 다시 올릴 수 있다 (지금 것은 새 것이 통과할 때까지 그대로 쓰인다). 이미 새 버전이 심사 중이면 빼고
  const canPick = (key: string) => {
    const st = statusOf[key];
    return ['NONE', 'REJECTED'].includes(st?.code) || (st?.code === 'USING' && (!st.next || st.next.status === 'REJECTED'));
  };

  if (!isAdmin) return <p className="text-center text-[14px] text-[#aaa] py-32">관리자만 볼 수 있는 화면이에요.</p>;

  const pickable = rows.filter(r => canPick(r.key));
  const using = (key: string) => statusOf[key]?.code === 'USING';
  const toggle = (key: string) => setPicked(p => { const n = new Set(p); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  const submit = async () => {
    const list = rows.filter(r => picked.has(r.key) && canPick(r.key));
    if (!list.length) return;
    if (!(await askConfirm(`템플릿 ${list.length}개를 솔라피에 등록하고 카카오 검수를 요청할까요?\n\n${list.map(r => `· ${r.label}`).join('\n')}\n\n검수는 영업일 1~3일 걸려요. 통과하면 이 화면에서 자동으로 저장돼요.${list.some(r => using(r.key)) ? '\n\n사용 중인 알림은 새 것이 통과할 때까지 지금 템플릿으로 계속 나가요. 솔라피에서 지금 템플릿을 지우지 마세요.' : ''}`, '심사 올리기'))) return;
    setBusy(true);
    try {
      const { results } = await api('POST', { items: list.map(r => ({ key: r.key, name: nameOf(r), spec: r.spec })) }) as { results: { key: string; ok: boolean; error?: string }[] };
      const bad = results.filter(r => !r.ok);
      const label = (k: string) => rows.find(r => r.key === k)?.label ?? k;
      await showAlert(`심사 요청 ${results.length - bad.length}개 완료${bad.length ? `\n\n안 된 것 ${bad.length}개:\n${bad.map(b => `· ${label(b.key)} — ${b.error}`).join('\n')}` : ''}`);
      setPicked(new Set());
      await load();
    } catch (e) {
      await showAlert(`올리지 못했어요.\n${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-[920px] mx-auto px-5 pt-8 pb-16 fade-up">
      <h1 className="display-heading mb-2">알림톡 심사 올리기</h1>
      <p className="text-[12px] text-[#888] mb-6 leading-[1.8]">
        메시지 모양 화면에 적어 둔 알림을 솔라피에 등록하고 카카오 검수를 한 번에 요청해요.<br />
        카테고리·We 로고 그림은 이미 통과한 &ldquo;시간표 신청 확정/취소&rdquo; 템플릿과 똑같이 올라가요. 통과하면 이 화면을 열 때 ID가 자동으로 저장돼요.
      </p>
      {failed && <p className="mb-4 whitespace-pre-line text-[13px] rounded-xl px-4 py-3 bg-[#fef2f2] text-[#b91c1c]">{failed}</p>}
      <div className="flex items-center gap-3 mb-3">
        <button type="button" disabled={loading || !pickable.length} onClick={() => setPicked(picked.size === pickable.length ? new Set() : new Set(pickable.map(r => r.key)))}
          className="text-[12px] px-3 py-1 rounded-full border border-[#ddd] disabled:opacity-40">{picked.size && picked.size === pickable.length ? '모두 풀기' : '올릴 수 있는 것 모두 고르기'}</button>
        <button type="button" onClick={load} disabled={loading} className="text-[12px] px-3 py-1 rounded-full border border-[#ddd] disabled:opacity-40">{loading ? '불러오는 중…' : '상태 새로 보기'}</button>
        <button type="button" onClick={submit} disabled={busy || !picked.size}
          className="ml-auto text-[13px] px-4 py-2 rounded-full bg-[var(--brand)] text-white disabled:opacity-40">{busy ? '올리는 중…' : `선택한 ${picked.size}개 심사 올리기`}</button>
      </div>
      <ul className="divide-y divide-[#eee] border-y border-[#eee]">
        {rows.map(r => {
          const st = statusOf[r.key] ?? { code: 'NONE' };
          const badge = STATUS[st.code] ?? { label: st.code, cls: 'bg-[#f4f4f5] text-[#71717a]' };
          return (
            <li key={r.key} className="py-3 flex items-start gap-3">
              <input type="checkbox" className="mt-1" disabled={!canPick(r.key)} checked={picked.has(r.key)} onChange={() => toggle(r.key)} />
              <div className="flex-1 min-w-0">
                <p className="text-[14px]">{r.label}</p>
                <p className="text-[11px] text-[#aaa] truncate">{r.spec.title} · 항목 {r.spec.items.length}줄{r.spec.image === 'card' ? ' · 선결제 카드 그림' : r.spec.image === 'logo' ? ' · We 로고' : ''}{r.spec.button.name ? ` · 버튼 ${r.spec.button.name}` : ''}</p>
                {st.code === 'REJECTED' && st.remote?.comment && <p className="mt-1 whitespace-pre-line text-[12px] text-[#b91c1c]">반려 사유: {st.remote.comment}</p>}
                {st.code === 'USING' && st.next && <p className="mt-1 whitespace-pre-line text-[12px] text-[#1d4ed8]">새 버전 {STATUS[st.next.status]?.label ?? st.next.status}{st.next.status === 'REJECTED' && st.next.comment ? ` — ${st.next.comment}` : ''} · 통과하면 새 것으로 바뀌어요</p>}
                {st.code === 'PENDING' && <p className="mt-1 text-[12px] text-[#92400e]">솔라피에 등록만 되고 검수 요청이 안 됐어요 — 솔라피 콘솔에서 [검수 요청]을 눌러 주세요.</p>}
              </div>
              <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-[11px] text-[#aaa] leading-[1.8]">반려된 알림은 메시지 모양 화면에서 고친 뒤, 여기서 다시 골라 올리면 돼요.</p>
    </div>
  );
}
