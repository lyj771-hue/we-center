'use client';

import type { MessageSpec } from '@/lib/messages';
import { MESSAGE_IMAGES, fillVars } from '@/lib/messages';

// 알림톡 미리보기 — 알림 메시지(포맷 편집)·알림(보호자 알림 내역)에서 같이 쓴다

/** 카카오톡 대화방에 보일 모양 — 실제 카카오톡에서는 글꼴·여백이 조금 다르고 글자 색은 바꿀 수 없다 */
export default function KakaoPreview({ spec, vars }: { spec: MessageSpec; vars: Record<string, string> }) {
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
