// PDF Araç Kutusu — Service Worker
// Strateji:
//   • HTML sayfaları (araç kodları burada) → NETWORK-FIRST: çevrimiçiyken hep güncel,
//     çevrimdışıyken önbellekten. Böylece güncellemeler anında görünür.
//   • Kütüphaneler / ikonlar (değişmeyen ağır dosyalar) → CACHE-FIRST: hızlı + offline.
// Not: Tüm ağ istekleri HTTP önbelleğini atlar (cache:'reload'/'no-store'). Aksi halde
//      tarayıcının HTTP önbelleği SW'ye eski dosya verip "güncel değil" sorununa yol açıyor.

const CACHE = 'pdf-kutu-v16';

const ASSETS = [
  './',
  './index.html',
  './resim-to-pdf.html',
  './birlestir.html',
  './ayir.html',
  './sayfa-yonetimi.html',
  './filigran-kaldir.html',
  './metin-duzenle.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './lib/pdf.min.js',
  './lib/pdf.worker.min.js',
  './lib/pdf-lib.min.js',
  './lib/fontkit.min.js',
  './lib/Arimo-Regular.ttf',
  './lib/Arimo-Bold.ttf',
  './lib/Tinos-Regular.ttf',
  './lib/Cousine-Regular.ttf'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // HTTP önbelleğini atlayarak (reload) taze indir, sonra önbelleğe koy.
      Promise.allSettled(ASSETS.map(async (url) => {
        try {
          const res = await fetch(url, { cache: 'reload' });
          if (res && res.ok) await cache.put(url, res);
        } catch (_) { /* tek dosya inmezse kurulum patlamasın */ }
      }))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isHtmlRequest(req) {
  if (req.mode === 'navigate') return true;
  const url = new URL(req.url);
  if (url.pathname.endsWith('/')) return true;
  if (url.pathname.endsWith('.html')) return true;
  const accept = req.headers.get('accept') || '';
  return accept.includes('text/html');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  if (isHtmlRequest(req)) {
    // NETWORK-FIRST (HTTP önbelleğini atla): ağdan çek, önbelleği güncelle;
    // ağ yoksa önbellekten ver.
    event.respondWith(
      fetch(new Request(req.url, { cache: 'no-store' }))
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req.url, clone));
          }
          return res;
        })
        // Ağ yoksa: SADECE aynı sayfanın önbelleklenmiş hâlini döndür. Başka bir sayfaya
        // (ör. index.html) asla düşme — yanlış sayfa gösterip kafa karıştırır.
        .catch(() => caches.match(req.url).then((m) =>
          m || new Response('<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:2rem;color:#334155">Çevrimdışısın ve bu sayfa henüz önbelleğe alınmamış. Bağlanınca tekrar dene.</body>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } })))
    );
    return;
  }

  // CACHE-FIRST: önce önbellek, yoksa ağdan çek ve önbelleğe ekle.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, clone));
        }
        return res;
      });
    })
  );
});
