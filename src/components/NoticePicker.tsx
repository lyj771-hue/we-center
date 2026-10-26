'use client';

import type { MessageRow } from '@/lib/messages';
import { CENTER_LABEL, needsCenter, needsHoliday, type NoticeCenter, type NoticeSelection } from '@/lib/noticeAlimtalk';

/** 공지사항 글 — 공지 메시지(알림톡) 고르기. #{센터}가 있는 종류면 지점(하나, 필수), #{명절}이 있으면 명절(필수) */
export default function NoticePicker({ kinds, value, onChange, note }: { kinds: MessageRow[]; value: NoticeSelection; onChange: (v: NoticeSelection) => void; note?: string }) {
  const kind = kinds.find(k => k.id === value.kind);
  const wantCenter = !!kind && needsCenter(kind);
  const wantHoliday = !!kind && needsHoliday(kind);
  return (
    <div className="rounded-lg bg-[#f8fafc] border border-[#e5e7eb] px-4 py-3 space-y-2">
      <label className="flex flex-wrap items-center gap-2 text-[13px]">
        <span className="text-[#555] shrink-0">알림톡</span>
        <select value={value.kind} onChange={e => onChange({ kind: e.target.value, center: null, holiday: '' })}
          className="flex-1 min-w-[200px] border border-[#ddd] bg-white px-2 h-9 text-[13px]">
          <option value="">보내지 않음</option>
          {kinds.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
        </select>
      </label>
      {wantCenter && (
        <fieldset className="flex flex-wrap items-center gap-3 text-[13px]">
          <legend className="sr-only">센터</legend>
          <span className="text-[#555]">센터 <span className="text-[#e11d48]">*</span></span>
          {(Object.keys(CENTER_LABEL) as NoticeCenter[]).map(c => (
            <label key={c} className="flex items-center gap-1">
              <input type="radio" name="notice-center" checked={value.center === c} onChange={() => onChange({ ...value, center: c })} />
              {CENTER_LABEL[c]}
            </label>
          ))}
          <span className="text-[11px] text-[#999]">고른 센터 보호자에게만 가요</span>
        </fieldset>
      )}
      {wantHoliday && (
        <label className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className="text-[#555]">명절 <span className="text-[#e11d48]">*</span></span>
          <input value={value.holiday} onChange={e => onChange({ ...value, holiday: e.target.value })} placeholder="예: 추석, 설"
            className="border border-[#ddd] bg-white px-2 h-9 w-40 text-[13px] outline-none focus:border-[var(--brand)]" />
        </label>
      )}
      {kind && note && <p className="text-[11px] text-[#999]">{note}</p>}
    </div>
  );
}
