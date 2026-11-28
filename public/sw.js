// সার্ভিস ওয়ার্কার: অ্যাপ ইনস্টল করার জন্য। হিসাবের ডাটা (/api) কখনো ক্যাশ করা হয় না।
const C = 'hisab-v1';
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(C).then(c => c.addAll(['/', '/icon-192.png'])));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.pathname.startsWith('/api/')) return;
  // আগে নেটওয়ার্ক (সবসময় নতুন সংস্করণ), না পেলে ক্যাশ
  e.respondWith(
    fetch(e.request).then(r => { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); return r; })
      .catch(() => caches.match(e.request).then(m => m || caches.match('/')))
  );
});
