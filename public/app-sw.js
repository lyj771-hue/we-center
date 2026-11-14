// 보호자 앱 서비스워커 — 웹 푸시를 받아 알림으로 띄우고, 누르면 그 화면을 연다. (범위: /app)
// 보내는 쪽(/api/push/send)은 { title, body, url } 을 JSON으로 보낸다.

// 앱 아이콘 뱃지 = 알림 센터에 남아 있는 우리 알림 수 (아이폰 홈 화면 앱 iOS 16.4+, 안드로이드는 런처가 알아서 점·숫자)
async function syncBadge() {
  if (!self.navigator || !('setAppBadge' in self.navigator)) return;
  try {
    const n = (await self.registration.getNotifications()).length;
    if (n > 0) await self.navigator.setAppBadge(n); else await self.navigator.clearAppBadge();
  } catch {
    try { await self.navigator.setAppBadge(); } catch { /* 뱃지 없어도 괜찮다 */ }
  }
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'We 센터';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: '/app/icon-192.png',
    badge: '/app/icon-192.png',
    data: { url: data.url || '/app' },
    tag: data.tag || undefined,
  }).then(syncBadge));
});

// 알림을 밀어서 지우면 뱃지 숫자도 줄인다
self.addEventListener('notificationclose', (event) => event.waitUntil(syncBadge()));

// 앱을 열면 앱이 'clear-badge' 를 보낸다 — 알림 센터의 우리 알림을 닫고 뱃지를 지운다
self.addEventListener('message', (event) => {
  if (event.data !== 'clear-badge') return;
  event.waitUntil((async () => {
    for (const n of await self.registration.getNotifications()) n.close();
    try { await self.navigator.clearAppBadge(); } catch { /* 무시 */ }
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(syncBadge());
  const url = new URL((event.notification.data && event.notification.data.url) || '/app', self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // 앱이 열려 있으면 그 창을 그 화면으로
    for (const w of wins) {
      if (w.url.startsWith(self.location.origin + '/app') && 'focus' in w) {
        await w.focus();
        if ('navigate' in w) return w.navigate(url);
        return;
      }
    }
    return self.clients.openWindow(url);
  })());
});
