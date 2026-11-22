// optikē 서비스 워커.
// GitHub Pages 는 파일을 10분 동안 기억하라고 알려 주기 때문에, 새로 올려도 아이폰이 예전 파일을 쓴다.
// 그래서 같은 주소의 파일은 항상 서버에서 새로 받고(기억해 둔 것 무시),
// 인터넷이 안 될 때만 마지막으로 받은 파일을 보여 준다.
const CACHE = 'optike';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(new Request(req.url, { cache: 'no-store', credentials: 'same-origin' }));
      if (res.ok) { const c = await caches.open(CACHE); c.put(req.url, res.clone()); }
      return res;
    } catch (err) {
      const hit = await caches.match(req.url);
      if (hit) return hit;
      throw err;
    }
  })());
});
