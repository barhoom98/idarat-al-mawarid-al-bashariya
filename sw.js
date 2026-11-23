// Offline shell for the installed app. Data always comes live from Supabase;
// only this site's own files are cached, network-first and revalidated (no-cache) so updates arrive on the next open.
// Also shows task reminders pushed by the edge function task-reminders (Settings → «تذكير المهام»).
const CACHE = 'millennium-hr-v20';
const SHELL = ['./', 'index.html', 'config.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-64.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' })
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match('index.html'))),
  );
});


// A reminder: { title, body, tag, url }. The phone plays its normal notification sound; it stays until it is opened or dismissed.
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'تذكير بمهمة', {
    body: d.body || '', dir: 'rtl', lang: 'ar', tag: d.tag || 'task-reminder', renotify: true, requireInteraction: true,
    icon: 'icons/icon-192.png', badge: 'icons/favicon-64.png', vibrate: [250, 120, 250, 120, 400], data: { url: d.url || './#tasks' },
  }));
});

// Opening it brings the app forward on the tasks page (or opens it).
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './#tasks', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const win = list.find((w) => w.url.startsWith(self.registration.scope));
    if (win) { win.postMessage({ type: 'open', hash: new URL(url).hash }); return win.focus(); }
    return self.clients.openWindow(url);
  }));
});
