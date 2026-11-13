'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdmin } from '@/components/AdminContext';
import type { Member, Post } from '@/lib/types';
import { getAllPosts, getMembers } from '@/lib/store';
import type { PushLog, PushSub } from '@/lib/push';
import { listPushLog, listPushSubs, sendPush } from '@/lib/push';
import { askConfirm, showAlert } from '@/lib/dialog';

// 앱 푸시 (관리자) — 보호자 앱에서 [알림 받기]를 켠 보호자에게 알림 보내기.
//   받는 사람: 전체 / 수색 / 의정부 / 한 보호자.  누르면 열 화면: 앱 홈·수업신청·결제·공지사항(글 하나)
//   보낸 기록과 알림 켠 보호자 목록. 표는 supabase/push.sql, 보내기는 /api/push/send

const pad = (n: number) => String(n).padStart(2, '0');
const fmt = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const device = (ua?: string) => !ua ? '기기' : /iphone|ipad/i.test(ua) ? '아이폰' : /android/i.test(ua) ? '안드로이드' : /mac|windows/i.test(ua) ? '컴퓨터' : '기기';

const OPEN_TO = [
  { url: '/app', label: '앱 홈' },
  { url: '/app/book', label: '수업신청' },
  { url: '/app/pay', label: '결제' },
  { url: '/app/notices', label: '공지사항 목록' },
];

export default function PushAdminPage() {
  const { isAdmin } = useAdmin();
  const [subs, setSubs] = useState<PushSub[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [log, setLog] = useState<PushLog[]>([]);
  const [notices, setNotices] = useState<Post[]>([]);
  const [failed, setFailed] = useState('');

  const [target, setTarget] = useState('all');
  const [title, setTitle] = useState('공지사항이 등록되었어요');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('/app/notices');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, m, l] = await Promise.all([listPushSubs(), getMembers(), listPushLog()]);
      setSubs(s); setMembers(m); setLog(l); setFailed('');
    } catch (e) { setFailed((e as Error).message); }
    getAllPosts('notices').then(p => setNotices(p.slice(0, 10))).catch(() => {});
  }, []);
  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  // 보호자별로 묶기 (기기 여러 대)
  const people = useMemo(() => {
    const by = new Map<string, PushSub[]>();
    for (const s of subs) by.set(s.userId, [...(by.get(s.userId) ?? []), s]);
    return [...by.entries()].map(([userId, list]) => {
      const m = members.find(x => x.userId === userId);
      return { userId, name: m?.nickname ?? '(알 수 없음)', center: m?.center === 'uijeongbu' ? '의정부' : '수색', list };
    }).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }, [subs, members]);

  if (!isAdmin) return <p className="text-center text-[14px] text-[#aaa] py-32">관리자만 볼 수 있는 화면이에요.</p>;

  const targetLabel = target === 'all' ? '전체' : target === 'eunpyeong' ? '수색' : target === 'uijeongbu' ? '의정부'
    : `${people.find(p => `user:${p.userId}` === target)?.name ?? ''} 보호자`;

  // 공지 글 고르기 — 내용·누를 곳을 그 글로 채운다
  const pickNotice = (id: string) => {
    const n = notices.find(x => x.id === id);
    if (!n) return;
    setTitle('공지사항이 등록되었어요');
    setBody(n.title);
    setUrl(`/app/notices/${n.id}`);
  };

  const send = async () => {
    if (!title.trim()) { showAlert('제목을 적어 주세요.'); return; }
    if (!(await askConfirm(`받는 사람: ${targetLabel}\n제목: ${title}\n내용: ${body || '(없음)'}\n\n앱 푸시를 보낼까요?`))) return;
    setSending(true);
    try {
      const r = await sendPush({ target, targetLabel, title: title.trim(), body: body.trim(), url });
      await showAlert(r.devices === 0 ? '알림을 켠 기기가 없어서 보내지 않았어요.'
        : `보냈어요.\n기기 ${r.devices}대 중 성공 ${r.sent}${r.failed ? ` · 실패 ${r.failed}` : ''}${r.removed ? ` · 정리 ${r.removed}(앱 삭제·알림 끔)` : ''}`);
      load();
    } catch (e) { showAlert(`보내지 못했어요.\n${(e as Error).message}`); }
    finally { setSending(false); }
  };

  const card = 'bg-white border border-[#ececec] rounded-xl p-5 md:p-6';
  const label = 'block text-[12px] text-[#888] mb-1';
  const field = 'w-full border border-[#ddd] rounded-lg px-3 py-2 text-[14px] outline-none focus:border-[var(--brand)]';

  return (
    <div className="px-5 md:px-8 pt-8 pb-14 md:pt-14 fade-up max-w-[1100px] mx-auto space-y-6">
      <div>
        <h1 className="display-heading mb-2">앱 푸시</h1>
        <p className="text-[13px] text-[#888]">보호자 앱에서 알림을 켠 분에게만 가요. 알림을 켠 보호자 <b className="text-[var(--brand)] font-normal">{people.length}명</b> · 기기 {subs.length}대</p>
        {failed && <p className="mt-2 text-[13px] text-red-500">불러오지 못했어요 — supabase/push.sql 을 실행했는지 확인해 주세요. ({failed})</p>}
      </div>

      <div className="grid md:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
        {/* 보내기 */}
        <section className={`${card} space-y-4`}>
          <h2 className="text-[16px]">보내기</h2>
          <div>
            <span className={label}>받는 사람</span>
            <select value={target} onChange={e => setTarget(e.target.value)} className={field}>
              <option value="all">전체 (알림 켠 모든 보호자)</option>
              <option value="eunpyeong">수색점 보호자</option>
              <option value="uijeongbu">의정부점 보호자</option>
              {people.map(p => <option key={p.userId} value={`user:${p.userId}`}>{p.name} 보호자 ({p.center})</option>)}
            </select>
          </div>
          {notices.length > 0 && (
            <div>
              <span className={label}>공지 글로 채우기 (선택)</span>
              <select defaultValue="" onChange={e => pickNotice(e.target.value)} className={field}>
                <option value="" disabled>공지 글 고르기</option>
                {notices.map(n => <option key={n.id} value={n.id}>{n.title}</option>)}
              </select>
            </div>
          )}
          <label className="block">
            <span className={label}>제목</span>
            <input value={title} onChange={e => setTitle(e.target.value)} maxLength={60} className={field} />
          </label>
          <label className="block">
            <span className={label}>내용</span>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={3} maxLength={200} className={field} placeholder="예: 11월 휴무 안내" />
          </label>
          <div>
            <span className={label}>알림을 누르면 열 화면</span>
            <select value={OPEN_TO.some(o => o.url === url) ? url : 'custom'} onChange={e => e.target.value !== 'custom' && setUrl(e.target.value)} className={field}>
              {OPEN_TO.map(o => <option key={o.url} value={o.url}>{o.label}</option>)}
              {!OPEN_TO.some(o => o.url === url) && <option value="custom">고른 공지 글</option>}
            </select>
          </div>

          {/* 미리 보기 — 휴대폰 알림 모양 */}
          <div className="rounded-2xl bg-[#f2f2f5] p-3">
            <div className="flex gap-3 bg-white rounded-xl p-3 shadow-sm">
              <img src="/app/icon-192.png" alt="" className="w-9 h-9 rounded-lg shrink-0" />
              <div className="min-w-0">
                <p className="text-[12px] text-[#999]">We 센터 · 지금</p>
                <p className="text-[14px] text-[#111] truncate">{title || '제목'}</p>
                {body && <p className="text-[13px] text-[#555] line-clamp-2">{body}</p>}
              </div>
            </div>
          </div>

          <button type="button" onClick={send} disabled={sending} className="w-full bg-[var(--brand)] text-white text-[14px] py-3 rounded-lg disabled:opacity-50">
            {sending ? '보내는 중…' : `${targetLabel}에게 보내기`}
          </button>
        </section>

        {/* 알림 켠 보호자 */}
        <section className={card}>
          <h2 className="text-[16px] mb-3">알림 켠 보호자</h2>
          {people.length === 0 ? <p className="text-[13px] text-[#bbb]">아직 없어요. 보호자 앱 홈의 [알림 받기 · 켜기]를 누르면 여기에 보여요.</p> : (
            <ul className="divide-y divide-[#f0f0f0] text-[13px]">
              {people.map(p => (
                <li key={p.userId} className="py-2 flex justify-between gap-2">
                  <span>{p.name} <span className="text-[#aaa]">· {p.center}</span></span>
                  <span className="text-[#999]">{p.list.map(s => device(s.userAgent)).join(', ')}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* 보낸 기록 */}
      <section className={card}>
        <h2 className="text-[16px] mb-3">보낸 기록</h2>
        {log.length === 0 ? <p className="text-[13px] text-[#bbb]">아직 보낸 앱 푸시가 없어요.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] min-w-[560px]">
              <thead><tr className="text-left text-[#999] border-b border-[#eee]"><th className="py-2 font-normal">보낸 때</th><th className="font-normal">받는 사람</th><th className="font-normal">제목 · 내용</th><th className="font-normal text-right">결과</th></tr></thead>
              <tbody>
                {log.map(l => (
                  <tr key={l.id} className="border-b border-[#f4f4f4] align-top">
                    <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{fmt(l.createdAt)}</td>
                    <td className="pr-3 whitespace-nowrap">{l.targetLabel}</td>
                    <td className="pr-3">{l.title}{l.body && <span className="block text-[#999]">{l.body}</span>}</td>
                    <td className="text-right whitespace-nowrap">{l.sent}/{l.devices}{l.failed ? <span className="text-red-500"> 실패 {l.failed}</span> : ''}{l.removed ? <span className="text-[#aaa]"> 정리 {l.removed}</span> : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
