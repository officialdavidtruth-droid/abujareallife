// Service worker: installable app + cached static assets. Bump VERSION on every deploy-breaking change.
const VERSION = 'v2';
const CACHE = 'arl-static-' + VERSION;
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/') || u.pathname === '/sw.js') return;
  // The page itself: always ask the network first so a new build is never hidden behind an old cached page.
  if (r.mode === 'navigate') {
    e.respondWith(fetch(r, { cache: 'no-store' }).catch(() => caches.match(r).then(h => h || Response.error())));
    return;
  }
  // Hashed build files never change, so cache-first is safe.
  if (u.pathname.startsWith('/_next/static/')) {
    e.respondWith(caches.open(CACHE).then(async c => { const hit = await c.match(r); if (hit) return hit; const res = await fetch(r); if (res.ok) c.put(r, res.clone()); return res; }));
    return;
  }
  // Models/icons keep the same file name, so serve the cached copy fast but refresh it in the background.
  if (u.pathname.startsWith('/models/') || u.pathname.startsWith('/icons/')) {
    e.respondWith(caches.open(CACHE).then(async c => {
      const hit = await c.match(r);
      const net = fetch(r).then(res => { if (res.ok) c.put(r, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
  }
});