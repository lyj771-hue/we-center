'use client';

import { supabase } from './supabaseClient';

// 보호자 앱 웹 푸시 — 기기 등록/해제(보호자), 보내기·현황(관리자). 서비스워커는 public/app-sw.js, 표는 supabase/push.sql.
// 안드로이드는 크롬에서 바로, 아이폰은 iOS 16.4 이상 + 홈 화면에 추가한 앱에서만 받을 수 있다.

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';
export const SW_URL = '/app-sw.js';
export const SW_SCOPE = '/app';

export type PushState = 'unsupported' | 'ios-needs-install' | 'denied' | 'off' | 'on';

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

/** 서비스워커 등록 (앱을 열 때마다 — 이미 있으면 그대로) */
export async function registerAppSw(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try { return await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE }); } catch { return null; }
}

/** 앱을 열거나 다시 볼 때 — 아이콘 뱃지와 알림 센터의 우리 알림을 지운다 */
export async function clearAppBadge() {
  try { await (navigator as Navigator & { clearAppBadge?: () => Promise<void> }).clearAppBadge?.(); } catch { /* 지원 안 하면 그만 */ }
  try { (await navigator.serviceWorker?.getRegistration(SW_SCOPE))?.active?.postMessage('clear-badge'); } catch { /* 무시 */ }
}

async function getReg() {
  return (await navigator.serviceWorker.getRegistration(SW_SCOPE)) ?? (await registerAppSw());
}

/** 이 기기 알림 상태 */
export async function getPushState(): Promise<PushState> {
  if (typeof window === 'undefined') return 'unsupported';
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!supported) return isIos() && !isStandalone() ? 'ios-needs-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await getReg();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

const b64ToBytes = (b64: string) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
};

/** 알림 켜기 — 허용을 묻고, 이 기기를 DB에 등록 */
export async function enablePush(): Promise<PushState> {
  if (!VAPID_PUBLIC) throw new Error('푸시 키가 설정되지 않았어요 (NEXT_PUBLIC_VAPID_PUBLIC_KEY)');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'off';
  const reg = await getReg();
  if (!reg) throw new Error('서비스워커를 등록하지 못했어요');
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription())
    ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID_PUBLIC) }));
  const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  const { error } = await supabase.rpc('save_push_subscription', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_ua: navigator.userAgent });
  if (error) throw error;
  return 'on';
}

/** 알림 끄기 — 이 기기 등록을 지운다 */
export async function disablePush(): Promise<PushState> {
  const reg = await getReg();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe().catch(() => {});
  }
  return 'off';
}

// ── 관리자 ──

export interface PushSub { userId: string; createdAt: string; userAgent?: string }
export async function listPushSubs(): Promise<PushSub[]> {
  const { data, error } = await supabase.from('push_subscriptions').select('user_id, created_at, user_agent').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(r => ({ userId: r.user_id, createdAt: r.created_at, userAgent: r.user_agent ?? undefined }));
}

export interface PushLog { id: string; title: string; body: string; url?: string; targetLabel?: string; devices: number; sent: number; failed: number; removed: number; createdAt: string }
export async function listPushLog(): Promise<PushLog[]> {
  const { data, error } = await supabase.from('push_log').select('*').order('created_at', { ascending: false }).limit(50);
  if (error) throw error;
  return (data ?? []).map(r => ({ id: r.id, title: r.title, body: r.body, url: r.url ?? undefined, targetLabel: r.target_label ?? r.target, devices: r.devices, sent: r.sent, failed: r.failed, removed: r.removed, createdAt: r.created_at }));
}

/** 관리자: 보내기 — target = all / eunpyeong / uijeongbu / user:<보호자 id> */
export async function sendPush(input: { target: string; targetLabel: string; title: string; body: string; url: string }) {
  const { data } = await supabase.auth.getSession();
  const res = await fetch('/api/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}) },
    body: JSON.stringify(input),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? `오류 ${res.status}`);
  return j as { devices: number; sent: number; failed: number; removed: number; errors?: string[] };
}
