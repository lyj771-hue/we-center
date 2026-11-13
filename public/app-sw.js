// 보호자 앱 서비스워커 — 웹 푸시를 받아 알림으로 띄우고, 누르면 그 화면을 연다. (범위: /app)
// 보내는 쪽(/api/push/send)은 { title, body, url } 을 JSON으로 보낸다.

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
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
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
