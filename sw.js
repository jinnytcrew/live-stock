/* ══════════════════════════════════════════════════════════════════════════════
   [v9.76] 서비스 워커 — 앱이 닫혀 있어도 브라우저가 이 파일을 깨워 준다
   ─────────────────────────────────────────────────────────────────────────────
   여기서 하는 일은 딱 두 가지다.
     ① push       — 서버가 보낸 알림을 받아 화면에 띄운다
     ② notificationclick — 알림을 누르면 앱을 열고 해당 종목으로 데려간다
   캐시(오프라인)는 일부러 건드리지 않는다. 시세 앱에서 낡은 화면을 되살리면
   '어제 값이 오늘 값처럼' 보일 수 있어 오히려 위험하다.
   ══════════════════════════════════════════════════════════════════════════════ */
const SW_VER = 'v9.81';

self.addEventListener('install', (e) => {
  self.skipWaiting();                 // 새 버전을 바로 쓴다
});
self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());  // 이미 열려 있는 탭도 이 워커가 맡는다
});

/* ── 푸시 도착 ── */
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) {
    try { d = { title: 'LIVE증권', body: event.data ? event.data.text() : '' }; } catch (_) { d = {}; }
  }
  const title = d.title || 'LIVE증권';
  const opts = {
    body: d.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    /* 같은 종목의 알림이 여러 개 쌓이지 않게 묶는다 */
    tag: d.tag || ('live-' + (d.code || 'general')),
    renotify: !!d.renotify,
    requireInteraction: d.level >= 3,          // 손절선 이탈 같은 급한 건은 저절로 사라지지 않게
    silent: false,
    timestamp: d.ts || Date.now(),
    data: { url: d.url || '/', code: d.code || '', level: d.level || 1 },
    actions: d.code ? [
      { action: 'open', title: '종목 보기' },
      { action: 'close', title: '닫기' }
    ] : []
  };
  event.waitUntil(self.registration.showNotification(title, opts));
});

/* ── 알림 클릭 ── 이미 열려 있는 창이 있으면 그 창을 쓰고, 없으면 새로 연다 ── */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'close') return;
  const data = event.notification.data || {};
  const target = data.url || '/';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) {
        try { c.postMessage({ type: 'push-open', code: data.code || '', url: target }); } catch (e) {}
        return c.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(target);
  })());
});

/* ── 구독이 만료돼 브라우저가 새로 발급했을 때 ──
   이 처리가 없으면 어느 날 갑자기 알림이 조용히 끊긴다. */
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    try {
      const old = event.oldSubscription || null;
      let sub = event.newSubscription || null;
      if (!sub) {
        const r = await self.registration.pushManager.getSubscription();
        sub = r || null;
      }
      if (!sub) {
        /* 새 구독을 직접 만들어야 하는 경우 — 서버에서 공개키를 받아 재구독 */
        const kr = await fetch('/api/push?act=key').then(x => x.json()).catch(() => null);
        if (kr && kr.ok && kr.key) {
          sub = await self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: kr.key
          });
        }
      }
      if (sub) {
        await fetch('/api/push?act=sub', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sub: sub.toJSON ? sub.toJSON() : sub, old: old && old.endpoint })
        });
      }
    } catch (e) {}
  })());
});
