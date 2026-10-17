'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { useAdmin } from '@/components/AdminContext';
import type { MessageRow, MessageSpec, MessageTemplate } from '@/lib/messages';
import { MESSAGE_GROUPS, MESSAGE_IMAGES, deleteMessageTemplate, fillVars, getMessageTemplates, isMissingTable, newSpec, saveMessageTemplate, specToBody, toRows } from '@/lib/messages';
import { askConfirm, askPrompt, showAlert } from '@/lib/dialog';
import type { OutboxMessage } from '@/lib/leave';
import { deleteOutbox, getOutbox } from '@/lib/leave';

// 알림 메시지 (관리자) — 알림 종류마다 카카오 알림톡 모양(아이템리스트형)과 알림 조건을 적어 둔다.
// 왼쪽에서 그림·타이틀·항목 표·안내 글·버튼을 고치면 오른쪽 카톡 미리보기가 바로 바뀐다(예시 값으로 채움).
// 기본 종류의 모양·조건은 처음 안(1차)이고, 고친 뒤 [저장]하면 DB(message_templates.body 에 JSON)에 남는다. 아직 보내지는 않는다.

const SQL_HINT = 'Supabase SQL Editor에서 supabase/message-templates.sql 을 한 번 실행해야 저장돼요.';
const MAX_ITEMS = 10;   // 알림톡 아이템리스트 최대 줄 수

type Draft = { spec: MessageSpec; condition: string };

export default function MessagesPage() {
  const { isAdmin } = useAdmin();
  const [saved, setSaved] = useState<MessageTemplate[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [failed, setFailed] = useState('');
  const [noTable, setNoTable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSaved(await getMessageTemplates()); setFailed(''); setNoTable(false);
    } catch (e) {
      // 테이블이 아직 없어도 기본 종류는 보여 주고 적을 수 있게 — 저장만 안 된다
      if (isMissingTable(e)) { setNoTable(true); setSaved([]); }
      else setFailed((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  const rows = toRows(saved);
  const draftOf = (t: MessageRow): Draft => drafts[t.id] ?? { spec: t.spec, condition: t.condition };
  const isDirty = (t: MessageRow) => !!drafts[t.id] && (specToBody(drafts[t.id].spec) !== specToBody(t.spec) || drafts[t.id].condition !== t.condition);
  const edit = (t: MessageRow, patch: Partial<Draft>) => setDrafts(d => ({ ...d, [t.id]: { ...draftOf(t), ...patch } }));
  const dropDraft = (t: MessageRow) => setDrafts(d => { const { [t.id]: _, ...rest } = d; return rest; });

  const save = async (t: MessageRow) => {
    setBusy(t.id);
    const d = draftOf(t);
    try {
      const next = await saveMessageTemplate({ id: t.id, grp: t.grp, label: t.label, sort: t.sort, body: specToBody(d.spec), condition: d.condition });
      setSaved(s => [...s.filter(x => x.id !== t.id), next]);
      dropDraft(t);
    } catch (e) {
      showAlert(isMissingTable(e) ? `저장하지 못했어요.\n${SQL_HINT}` : `저장하지 못했어요.\n${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const add = async (grp: string) => {
    const label = (await askPrompt('알림 종류 이름'))?.trim();
    if (!label) return;
    const sort = Math.max(0, ...rows.filter(x => x.grp === grp).map(x => x.sort)) + 10;
    try {
      const t = await saveMessageTemplate({ id: `custom_${Date.now().toString(36)}`, grp, label, body: specToBody(newSpec()), condition: '', sort });
      setSaved(s => [...s, t]);
    } catch (e) {
      showAlert(isMissingTable(e) ? `추가하지 못했어요.\n${SQL_HINT}` : `추가하지 못했어요.\n${(e as Error).message}`);
    }
  };

  const rename = async (t: MessageRow) => {
    const label = (await askPrompt('알림 종류 이름', t.label))?.trim();
    if (!label || label === t.label) return;
    try {
      const next = await saveMessageTemplate({ id: t.id, grp: t.grp, label, sort: t.sort, body: specToBody(t.spec), condition: t.condition });
      setSaved(s => [...s.filter(x => x.id !== t.id), next]);
    } catch (e) {
      showAlert(isMissingTable(e) ? `바꾸지 못했어요.\n${SQL_HINT}` : `바꾸지 못했어요.\n${(e as Error).message}`);
    }
  };

  const remove = async (t: MessageRow) => {
    if (!(await askConfirm(`'${t.label}' 알림을 지울까요?`))) return;
    try {
      await deleteMessageTemplate(t.id);
      setSaved(s => s.filter(x => x.id !== t.id));
      dropDraft(t);
    } catch (e) {
      showAlert(`지우지 못했어요.\n${(e as Error).message}`);
    }
  };

  if (!isAdmin) return <p className="text-center text-[14px] text-[#aaa] py-32">관리자만 볼 수 있는 화면이에요.</p>;

  const groups = MESSAGE_GROUPS.map(g => ({ ...g, rows: rows.filter(t => (MESSAGE_GROUPS.some(x => x.key === t.grp) ? t.grp : 'etc') === g.key) }))
    .filter(g => g.rows.length || g.key !== 'etc');

  return (
    <div className="px-3 md:px-6 pt-6 pb-14 fade-up">
      <div className="max-w-[1200px] mx-auto">
        <h1 className="display-heading mb-2">알림 메시지</h1>
        <p className="text-[12px] text-[#999] mb-6 leading-[1.8]">
          카카오 알림톡으로 보낼 모양이에요. 왼쪽 칸을 고치면 오른쪽 미리보기가 바로 바뀌고, [저장]을 누르면 남아요.<br />
          회색 단추를 누르면 마지막으로 고르던 칸에 <code className="text-[#555]">#{'{'}이름{'}'}</code>처럼 보낼 때 바뀌는 자리가 들어가요. 미리보기는 예시 값으로 채워요.<br />
          알림 조건은 처음 안을 적어 두었어요 — 맞게 고쳐 주세요. 아직 실제로 보내지는 않아요.
        </p>
        {loading && <p className="text-[12px] text-[#aaa] mb-4">불러오는 중…</p>}
        {failed && <p className="text-[13px] text-red-400 mb-4">불러오지 못했어요. ({failed})</p>}
        {noTable && <p className="text-[13px] text-[#b45309] bg-[#fffbeb] border border-[#fde68a] rounded-md px-3 py-2 mb-4">적어 볼 수는 있지만 아직 저장은 안 돼요. {SQL_HINT}</p>}

        {groups.map(g => (
          <Fragment key={g.key}>
            <h2 className="mt-8 mb-3 text-[14px] text-[var(--brand)]">{g.label}</h2>
            <div className="space-y-4">
              {g.rows.map(t => (
                <Card key={t.id} t={t} vars={g.vars} draft={draftOf(t)} dirty={isDirty(t)} busy={busy === t.id}
                  onEdit={p => edit(t, p)} onSave={() => save(t)} onCancel={() => dropDraft(t)} onRename={() => rename(t)}
                  onRemove={t.builtIn ? undefined : () => remove(t)} />
              ))}
            </div>
            <button onClick={() => add(g.key)} className="mt-2 text-[12px] text-[#888] hover:text-[#0a0a0a]">+ 알림 추가</button>
          </Fragment>
        ))}

        <Outbox rows={rows} />
      </div>
    </div>
  );
}

/** 칸 이름 — 변수 단추가 들어갈 곳 */
type FieldKey = 'title' | 'sub' | 'body' | 'btnName' | 'btnUrl' | `item:${number}:${'name' | 'value'}`;

function Card({ t, vars, draft, dirty, busy, onEdit, onSave, onCancel, onRename, onRemove }: {
  t: MessageRow; vars: string[]; draft: Draft; dirty: boolean; busy: boolean;
  onEdit: (p: Partial<Draft>) => void; onSave: () => void; onCancel: () => void; onRename: () => void; onRemove?: () => void;
}) {
  const { spec } = draft;
  const last = useRef<{ key: FieldKey; el: HTMLInputElement | HTMLTextAreaElement } | null>(null);
  const setSpec = (patch: Partial<MessageSpec>) => onEdit({ spec: { ...spec, ...patch } });

  const getField = (k: FieldKey): string => {
    if (k === 'btnName') return spec.button.name;
    if (k === 'btnUrl') return spec.button.url;
    if (k.startsWith('item:')) { const [, i, part] = k.split(':'); return spec.items[Number(i)]?.[part as 'name' | 'value'] ?? ''; }
    return spec[k as 'title' | 'sub' | 'body'];
  };
  const setField = (k: FieldKey, v: string) => {
    if (k === 'btnName') return setSpec({ button: { ...spec.button, name: v } });
    if (k === 'btnUrl') return setSpec({ button: { ...spec.button, url: v } });
    if (k.startsWith('item:')) {
      const [, i, part] = k.split(':');
      return setSpec({ items: spec.items.map((x, j) => (j === Number(i) ? { ...x, [part]: v } : x)) });
    }
    setSpec({ [k]: v } as Partial<MessageSpec>);
  };
  // 변수 단추 — 마지막으로 고르던 칸의 커서 자리에 #{변수}를 넣는다 (고른 칸이 없으면 안내 글 끝에)
  const insertVar = (v: string) => {
    const token = `#{${v}}`;
    const key = last.current?.key ?? 'body';
    const el = last.current?.el;
    const cur = getField(key);
    const at = el?.selectionStart ?? cur.length;
    const end = el?.selectionEnd ?? at;
    setField(key, cur.slice(0, at) + token + cur.slice(end));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at + token.length, at + token.length); });
  };
  const bind = (k: FieldKey) => ({
    value: getField(k),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setField(k, e.target.value),
    onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { last.current = { key: k, el: e.target }; },
    onSelect: (e: React.SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>) => { last.current = { key: k, el: e.currentTarget }; },
  });

  const input = 'w-full min-w-0 border border-[#e5e5e5] rounded-md px-2.5 py-1.5 text-[13px] focus:outline-none focus:border-[var(--brand)]';
  const area = 'w-full border border-[#e5e5e5] rounded-md px-2.5 py-2 pb-4 text-[13px] leading-[1.7] resize-none block focus:outline-none focus:border-[var(--brand)]';
  const label = 'block text-[11px] text-[#999] mb-1';

  return (
    <div className="rounded-xl border border-[#e5e5e5] bg-white">
      {/* 머리 — 이름 · 저장/취소 */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-[#f0f0f0]">
        <button onClick={onRename} title="이름 바꾸기" className="text-left text-[15px] text-[#27272a] hover:opacity-70">{t.label}</button>
        {!t.saved && !dirty && <span className="text-[11px] text-[#b45309] bg-[#fffbeb] rounded px-1.5 py-0.5">처음 안 — 아직 저장 안 함</span>}
        {t.saved && !dirty && t.updatedAt && <span className="text-[11px] text-[#bbb]">{new Date(t.updatedAt).toLocaleDateString('ko-KR')} 저장</span>}
        <div className="ml-auto flex items-center gap-2">
          {(dirty || !t.saved) && (
            <button onClick={onSave} disabled={busy}
              className="text-[12px] px-3 py-1 bg-[var(--brand)] text-white rounded disabled:opacity-50">{busy ? '저장 중…' : '저장'}</button>
          )}
          {dirty && (
            <button onClick={onCancel} disabled={busy}
              className="text-[12px] px-3 py-1 border border-[#e5e5e5] text-[#555] rounded hover:bg-[#f8f8f8] disabled:opacity-50">취소</button>
          )}
          {onRemove && <button onClick={onRemove} className="text-[11px] text-[#aaa] underline underline-offset-2 hover:text-red-500">삭제</button>}
        </div>
      </div>

      <div className="grid gap-5 p-4 md:grid-cols-[minmax(0,1fr)_300px]">
        {/* 왼쪽 — 고치는 칸 */}
        <div className="min-w-0 space-y-3">
          <div>
            <span className={label}>맨 위 그림</span>
            <div className="flex flex-wrap gap-1.5">
              {MESSAGE_IMAGES.map(m => (
                <button key={m.key} type="button" onClick={() => setSpec({ image: m.key })}
                  className={`text-[12px] px-2.5 py-1 rounded-full border ${spec.image === m.key ? 'border-[var(--brand)] bg-[var(--brand)] text-white' : 'border-[#e5e5e5] text-[#555] hover:bg-[#f8f8f8]'}`}>{m.label}</button>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block min-w-0"><span className={label}>타이틀</span><input className={input} {...bind('title')} /></label>
            <label className="block min-w-0"><span className={label}>설명</span><input className={input} {...bind('sub')} /></label>
          </div>
          <div>
            <span className={label}>항목 표 (최대 {MAX_ITEMS}줄 · 항목 이름은 짧게)</span>
            <div className="space-y-1.5">
              {spec.items.map((it, i) => (
                <div key={i} className="flex gap-1.5">
                  <input className={`${input} !w-[34%]`} placeholder="항목" aria-label={`${i + 1}번째 항목 이름`} {...bind(`item:${i}:name`)} />
                  <input className={input} placeholder="내용" aria-label={`${i + 1}번째 항목 내용`} {...bind(`item:${i}:value`)} />
                  <button type="button" onClick={() => setSpec({ items: spec.items.filter((_, j) => j !== i) })} aria-label="이 줄 지우기"
                    className="shrink-0 w-8 text-[#bbb] hover:text-red-500">✕</button>
                </div>
              ))}
            </div>
            {spec.items.length < MAX_ITEMS && (
              <button type="button" onClick={() => setSpec({ items: [...spec.items, { name: '', value: '' }] })}
                className="mt-1.5 text-[12px] text-[#888] hover:text-[#0a0a0a]">+ 줄 추가</button>
            )}
          </div>
          <div>
            <span className={label}>안내 글</span>
            <Resizable><textarea rows={3} className={area} {...bind('body')} /></Resizable>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <label className="block min-w-0"><span className={label}>버튼 이름 (비우면 버튼 없음)</span><input className={input} {...bind('btnName')} /></label>
            <label className="block min-w-0"><span className={label}>버튼 링크</span><input className={input} placeholder="https://we-center.vercel.app/…" {...bind('btnUrl')} /></label>
          </div>
          <div className="flex flex-wrap gap-1">
            {vars.map(v => (
              <button key={v} type="button" onMouseDown={e => e.preventDefault()} onClick={() => insertVar(v)}
                className="text-[11px] px-1.5 py-0.5 rounded bg-[#f3f3f3] text-[#666] hover:bg-[#e8e8e8]">#{'{'}{v}{'}'}</button>
            ))}
          </div>
        </div>

        {/* 오른쪽 — 카톡 미리보기 */}
        <div className="min-w-0">
          <span className={label}>미리보기 (예시 값)</span>
          <KakaoPreview spec={spec} vars={t.samples} />
        </div>
      </div>

      {/* 알림 조건 */}
      <div className="px-4 pb-4">
        <span className={label}>알림 조건 — 언제, 누구에게 보내는지</span>
        <Resizable>
          <textarea rows={3} value={draft.condition} onChange={e => onEdit({ condition: e.target.value })} className={area}
            placeholder="예) 수업 전날 저녁 8시, 다음 날 수업이 있는 아이마다 한 번" />
        </Resizable>
      </div>
    </div>
  );
}

/** 카카오톡 대화방에 보일 모양 — 실제 카카오톡에서는 글꼴·여백이 조금 다르고 글자 색은 바꿀 수 없다 */
function KakaoPreview({ spec, vars }: { spec: MessageSpec; vars: Record<string, string> }) {
  const img = MESSAGE_IMAGES.find(m => m.key === spec.image)?.src;
  const fill = (s: string) => fillVars(s, vars);
  return (
    <div className="rounded-lg bg-[#b2c7da] p-3">
      <div className="flex gap-2 items-start">
        <div className="w-9 h-9 shrink-0 rounded-[13px] bg-white grid place-items-center text-[12px] font-bold text-[var(--brand)]">We</div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] text-[#3f4b5a] mb-1">위 We</div>
          <div className="w-full max-w-[260px] rounded-[4px_14px_14px_14px] bg-white overflow-hidden shadow-[0_1px_1px_rgba(0,0,0,0.06)]">
            <div className="bg-[#fee500] px-3 py-2 text-[11px] font-bold text-[#3c1e1e]">알림톡 도착</div>
            {img && <img src={img} alt="" className="block w-[calc(100%-20px)] mx-[10px] mt-[10px] rounded-md" />}
            {spec.title && <div className="px-3 pt-3 text-[13.5px] font-bold text-[#1f2328] break-keep">{fill(spec.title)}</div>}
            {spec.sub && <div className="px-3 text-[11.5px] text-[#6b7280]">{fill(spec.sub)}</div>}
            {spec.items.length > 0 && (
              <dl className="mx-3 mt-2 mb-1 border-t border-[#eceef1]">
                {spec.items.map((it, i) => (
                  <div key={i} className="flex justify-between gap-3 py-1.5 border-b border-[#eceef1] text-[12.5px]">
                    <dt className="shrink-0 text-[#6b7280]">{fill(it.name)}</dt>
                    <dd className="text-right font-bold tabular-nums text-[#1f2328] break-keep">{fill(it.value)}</dd>
                  </div>
                ))}
              </dl>
            )}
            {spec.body && <div className="px-3 pt-2 pb-3 text-[12.5px] leading-[1.65] text-[#1f2328] whitespace-pre-line">{fill(spec.body)}</div>}
            {spec.button.name && (
              <div className="mx-2.5 mb-2.5 rounded-md border border-[#eceef1] bg-[#f7f8fa] py-2 text-center text-[12.5px]" title={spec.button.url}>{fill(spec.button.name)}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 입력칸 오른쪽 아래 손잡이 — 잡고 위아래로 끌면 높이가 바뀐다 (마우스·손가락 둘 다) */
function Resizable({ children }: { children: React.ReactNode }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const start = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = boxRef.current?.querySelector('textarea');
    if (!el) return;
    e.preventDefault();
    const y0 = e.clientY;
    const h0 = el.offsetHeight;
    const move = (ev: PointerEvent) => { el.style.height = `${Math.max(60, h0 + ev.clientY - y0)}px`; };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <div ref={boxRef} className="relative">
      {children}
      <div onPointerDown={start} title="끌어서 높이 조절" aria-hidden="true"
        className="absolute right-0.5 bottom-0.5 w-4 h-4 cursor-ns-resize touch-none flex items-end justify-end text-[#bbb] hover:text-[var(--brand)]">
        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M9 1 1 9M9 5 5 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
      </div>
    </div>
  );
}

/** 보낼 알림 — 휴무 등으로 쌓인 알림 (솔라피 연결 전이라 아직 안 보냄). 받는 아이·번호·내용 미리보기, 지우기 */
function Outbox({ rows }: { rows: MessageRow[] }) {
  const [list, setList] = useState<OutboxMessage[] | null>(null);
  const [failed, setFailed] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(() => { getOutbox().then(l => { setList(l); setFailed(''); }).catch(e => setFailed((e as Error).message)); }, []);
  useEffect(() => { load(); }, [load]);
  const STATUS: Record<OutboxMessage['status'], string> = { pending: '보낼 것', sent: '보냄', failed: '실패', skipped: '안 보냄' };
  const remove = async (m: OutboxMessage) => {
    if (!(await askConfirm(`${m.childName} 알림을 지울까요? (보내지 않아요)`))) return;
    try { await deleteOutbox(m.id); load(); } catch (e) { showAlert(`지우지 못했어요.\n${(e as Error).message}`); }
  };
  return (
    <section className="mt-12">
      <h2 className="mb-1 text-[14px] text-[var(--brand)]">보낼 알림</h2>
      <p className="text-[12px] text-[#999] mb-3">휴무 등으로 쌓인 알림이에요. 솔라피(알림톡) 연결 뒤 여기서 보내요 — 지금은 아직 보내지 않아요.</p>
      {failed && <p className="text-[13px] text-[#b45309]">불러오지 못했어요 — SQL(supabase/teacher-leave.sql)을 실행했는지 확인해 주세요. ({failed})</p>}
      {list && list.length === 0 && <p className="text-[13px] text-[#bbb]">쌓인 알림이 없어요.</p>}
      {list && list.length > 0 && (
        <div className="rounded-xl border border-[#e5e5e5] bg-white divide-y divide-[#f0f0f0]">
          {list.map(m => {
            const t = rows.find(r => r.id === m.templateId);
            const vars = { ...(t?.samples ?? {}), ...m.vars };
            return (
              <div key={m.id} className="px-4 py-2.5 text-[13px]">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-[#999] tabular-nums">{new Date(m.createdAt).toLocaleDateString('ko-KR')}</span>
                  <span className="text-[#27272a]">{m.childName}</span>
                  <span className="text-[#888] tabular-nums">{m.phone ?? '번호 없음'}</span>
                  <span className="text-[#888]">{t?.label ?? m.templateId}</span>
                  <span className="text-[#555]">{[m.vars['날짜'], m.vars['시간'], m.vars['사유']].filter(Boolean).join(' · ')}</span>
                  <span className={`text-[11px] px-1.5 rounded ${m.status === 'pending' ? 'bg-[#fffbeb] text-[#b45309]' : m.status === 'sent' ? 'bg-[#ecfdf5] text-[#047857]' : 'bg-[#fef2f2] text-[#b91c1c]'}`}>{STATUS[m.status]}</span>
                  <div className="ml-auto flex gap-2">
                    {t && <button onClick={() => setOpen(o => (o === m.id ? null : m.id))} className="text-[11px] text-[#888] underline underline-offset-2">{open === m.id ? '접기' : '미리보기'}</button>}
                    {m.status === 'pending' && <button onClick={() => remove(m)} className="text-[11px] text-[#aaa] underline underline-offset-2 hover:text-red-500">지우기</button>}
                  </div>
                </div>
                {open === m.id && t && <div className="mt-2 max-w-[300px]"><KakaoPreview spec={t.spec} vars={vars} /></div>}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
