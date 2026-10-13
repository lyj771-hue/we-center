'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { useAdmin } from '@/components/AdminContext';
import type { MessageTemplate } from '@/lib/messages';
import { DEFAULT_TEMPLATES, MESSAGE_GROUPS, deleteMessageTemplate, fillVars, getMessageTemplates, isMissingTable, saveMessageTemplate } from '@/lib/messages';
import { askConfirm, askPrompt, showAlert } from '@/lib/dialog';

// 알림 메시지 (관리자) — 알림 종류마다 메시지 포맷과 알림 조건을 적어 둔다.
// 포맷의 #{변수}는 보낼 때 아이·날짜 등으로 바뀐다 (카카오 알림톡 템플릿과 같은 모양). 아직 보내지는 않고 적어 두는 곳.

// 기본 종류 — 지우지 않는다
const BUILT_IN = DEFAULT_TEMPLATES.map(t => t.id);
const SQL_HINT = 'Supabase SQL Editor에서 supabase/message-templates.sql 을 한 번 실행해야 저장돼요.';

export default function MessagesPage() {
  const { isAdmin } = useAdmin();
  const [saved, setSaved] = useState<MessageTemplate[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { body: string; condition: string }>>({});
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
      if (isMissingTable(e)) { setNoTable(true); setSaved(DEFAULT_TEMPLATES.map(t => ({ ...t, updatedAt: '' }))); }
      else setFailed((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  const draftOf = (t: MessageTemplate) => drafts[t.id] ?? { body: t.body, condition: t.condition };
  const isDirty = (t: MessageTemplate) => !!drafts[t.id] && (drafts[t.id].body !== t.body || drafts[t.id].condition !== t.condition);
  const edit = (t: MessageTemplate, patch: Partial<{ body: string; condition: string }>) =>
    setDrafts(d => ({ ...d, [t.id]: { ...draftOf(t), ...patch } }));

  const save = async (t: MessageTemplate) => {
    setBusy(t.id);
    try {
      const next = await saveMessageTemplate({ ...t, ...draftOf(t) });
      setSaved(s => s.map(x => (x.id === t.id ? next : x)));
      setDrafts(d => { const { [t.id]: _, ...rest } = d; return rest; });
    } catch (e) {
      showAlert(isMissingTable(e) ? `저장하지 못했어요.\n${SQL_HINT}` : `저장하지 못했어요.\n${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const add = async (grp: string) => {
    const label = (await askPrompt('알림 종류 이름'))?.trim();
    if (!label) return;
    const sort = Math.max(0, ...saved.filter(x => x.grp === grp).map(x => x.sort)) + 10;
    try {
      const t = await saveMessageTemplate({ id: `custom_${Date.now().toString(36)}`, grp, label, body: '', condition: '', sort });
      setSaved(s => [...s, t]);
    } catch (e) {
      showAlert(isMissingTable(e) ? `추가하지 못했어요.\n${SQL_HINT}` : `추가하지 못했어요.\n${(e as Error).message}`);
    }
  };

  const rename = async (t: MessageTemplate) => {
    const label = (await askPrompt('알림 종류 이름', t.label))?.trim();
    if (!label || label === t.label) return;
    try {
      const next = await saveMessageTemplate({ ...t, label });
      setSaved(s => s.map(x => (x.id === t.id ? { ...next, body: x.body, condition: x.condition } : x)));
    } catch (e) {
      showAlert(isMissingTable(e) ? `바꾸지 못했어요.\n${SQL_HINT}` : `바꾸지 못했어요.\n${(e as Error).message}`);
    }
  };

  const remove = async (t: MessageTemplate) => {
    if (!(await askConfirm(`'${t.label}' 알림을 지울까요?`))) return;
    try {
      await deleteMessageTemplate(t.id);
      setSaved(s => s.filter(x => x.id !== t.id));
    } catch (e) {
      showAlert(`지우지 못했어요.\n${(e as Error).message}`);
    }
  };

  if (!isAdmin) return <p className="text-center text-[14px] text-[#aaa] py-32">관리자만 볼 수 있는 화면이에요.</p>;

  const th = 'px-3 py-2.5 font-normal text-[12px] text-[#888] text-left whitespace-nowrap';
  const groups = MESSAGE_GROUPS.map(g => ({ ...g, rows: saved.filter(t => (MESSAGE_GROUPS.some(x => x.key === t.grp) ? t.grp : 'etc') === g.key) }))
    .filter(g => g.rows.length || g.key !== 'etc');

  return (
    <div className="px-3 md:px-6 pt-6 pb-14 fade-up">
      <div className="max-w-[1200px] mx-auto">
        <h1 className="display-heading mb-2">알림 메시지</h1>
        <p className="text-[12px] text-[#999] mb-6 leading-[1.8]">
          알림마다 메시지 내용과 알림 조건을 칸에 직접 써 주세요. 고친 뒤 [저장]을 누르면 돼요.<br />
          회색 단추는 쓰고 싶을 때만 — 누르면 <code className="text-[#555]">#{'{'}아이이름{'}'}</code>처럼 보낼 때 바뀌는 자리가 들어가요.
        </p>
        {loading && <p className="text-[12px] text-[#aaa] mb-4">불러오는 중…</p>}
        {failed && <p className="text-[13px] text-red-400 mb-4">불러오지 못했어요. ({failed})</p>}
        {noTable && <p className="text-[13px] text-[#b45309] bg-[#fffbeb] border border-[#fde68a] rounded-md px-3 py-2 mb-4">적어 볼 수는 있지만 아직 저장은 안 돼요. {SQL_HINT}</p>}

        <div className="overflow-x-auto rounded-xl border border-[#e5e5e5] bg-white">
          <table className="w-full min-w-[820px] text-[14px] border-collapse table-fixed">
            <colgroup><col className="w-[24%]" /><col className="w-[46%]" /><col className="w-[30%]" /></colgroup>
            <thead>
              <tr className="border-b border-[#eee] bg-[#fafafa]">
                <th className={th}>알림 종류</th>
                <th className={th}>메시지 포맷</th>
                <th className={th}>알림 조건</th>
              </tr>
            </thead>
            <tbody>
              {groups.map(g => (
                <Fragment key={g.key}>
                  <tr className="border-b border-[#eee]">
                    <td colSpan={3} className="px-3 pt-4 pb-1.5 text-[13px] text-[var(--brand)]">{g.label}</td>
                  </tr>
                  {g.rows.map(t => (
                    <Row key={t.id} t={t} vars={g.vars} draft={draftOf(t)} dirty={isDirty(t)} busy={busy === t.id}
                      onEdit={p => edit(t, p)} onSave={() => save(t)} onRename={() => rename(t)}
                      onRemove={BUILT_IN.includes(t.id) ? undefined : () => remove(t)} />
                  ))}
                  <tr className="border-b border-[#eee]">
                    <td colSpan={3} className="px-3 py-2">
                      <button onClick={() => add(g.key)} className="text-[12px] text-[#888] hover:text-[#0a0a0a]">+ 알림 추가</button>
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Row({ t, vars, draft, dirty, busy, onEdit, onSave, onRename, onRemove }: {
  t: MessageTemplate; vars: string[]; draft: { body: string; condition: string }; dirty: boolean; busy: boolean;
  onEdit: (p: Partial<{ body: string; condition: string }>) => void; onSave: () => void; onRename: () => void; onRemove?: () => void;
}) {
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  // 변수 단추 — 커서 자리에 #{변수}를 넣는다
  const insertVar = (v: string) => {
    const el = bodyRef.current;
    const token = `#{${v}}`;
    const at = el ? el.selectionStart : draft.body.length;
    const end = el ? el.selectionEnd : at;
    onEdit({ body: draft.body.slice(0, at) + token + draft.body.slice(end) });
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at + token.length, at + token.length); });
  };
  const area = 'w-full border border-[#e5e5e5] rounded-md px-2.5 py-2 text-[13px] leading-[1.7] resize-y focus:outline-none focus:border-[var(--brand)]';

  return (
    <tr className="border-b border-[#f3f3f3] align-top">
      <td className="px-3 py-3">
        <button onClick={onRename} title="이름 바꾸기" className="text-left text-[14px] text-[#27272a] hover:opacity-70">{t.label}</button>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {dirty && (
            <button onClick={onSave} disabled={busy}
              className="text-[12px] px-3 py-1 bg-[var(--brand)] text-white rounded disabled:opacity-50">{busy ? '저장 중…' : '저장'}</button>
          )}
          {onRemove && <button onClick={onRemove} className="text-[11px] text-[#aaa] underline underline-offset-2 hover:text-red-500">삭제</button>}
        </div>
        {!dirty && t.updatedAt && (t.body || t.condition) && (
          <p className="mt-1 text-[11px] text-[#bbb]">{new Date(t.updatedAt).toLocaleDateString('ko-KR')} 저장</p>
        )}
      </td>
      <td className="px-3 py-3">
        <textarea ref={bodyRef} value={draft.body} onChange={e => onEdit({ body: e.target.value })} rows={4}
          placeholder={'예) #{보호자명}님, 내일 #{날짜}(#{요일}) #{시간} #{선생님} 선생님 수업이 있어요.'} className={area} />
        <div className="mt-1.5 flex flex-wrap gap-1">
          {vars.map(v => (
            <button key={v} onClick={() => insertVar(v)}
              className="text-[11px] px-1.5 py-0.5 rounded bg-[#f3f3f3] text-[#666] hover:bg-[#e8e8e8]">#{'{'}{v}{'}'}</button>
          ))}
        </div>
        {draft.body.includes('#{') && (
          <div className="mt-2 rounded-md bg-[#fef9e7] px-2.5 py-2 text-[12px] leading-[1.7] text-[#555] whitespace-pre-wrap">
            <span className="block text-[10px] text-[#b59a3c] mb-0.5">미리보기 (예시 값)</span>
            {fillVars(draft.body)}
          </div>
        )}
      </td>
      <td className="px-3 py-3">
        <textarea value={draft.condition} onChange={e => onEdit({ condition: e.target.value })} rows={4}
          placeholder="예) 수업 전날 저녁 8시, 다음 날 수업이 있는 아이마다 한 번" className={area} />
      </td>
    </tr>
  );
}
