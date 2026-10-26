import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

// 화면끼리 바로 알리기 — 수업스케쥴·시간표 보기·시간표 관리 중 한 곳에서 칸이 바뀌면(신청·취소·올리기·x·저장),
// 같은 신호(broadcast)를 받은 다른 화면들이 곧바로 다시 읽는다. 표 권한(RLS)과 상관없이 모두 받는다(내용은 안 담고 "바뀜"만).

const TOPIC = 'we-schedule-sync';
let chan: RealtimeChannel | null = null;
const listeners = new Set<(center: string | null) => void>();

function channel() {
  if (!chan) {
    chan = supabase.channel(TOPIC, { config: { broadcast: { self: false } } });
    chan.on('broadcast', { event: 'changed' }, ({ payload }) => {
      for (const f of listeners) f((payload as { center?: string | null })?.center ?? null);
    });
    chan.subscribe();
  }
  return chan;
}

/** 칸이 바뀌었다고 다른 화면들에 알린다 */
export function notifyScheduleChanged(center?: string | null) {
  channel().send({ type: 'broadcast', event: 'changed', payload: { center: center ?? null } }).catch(() => {});
}

/** 다른 화면에서 바뀌면 fn — 그만 들으려면 돌려받은 함수를 부른다 */
export function onScheduleChanged(fn: (center: string | null) => void): () => void {
  channel();
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
