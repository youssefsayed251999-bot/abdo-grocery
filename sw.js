/* Service worker — تخزين مؤقت + إشعارات */
const CACHE = "abdo-grocery-v10";
const ASSETS = [
  "./",
  "index.html",
  "css/styles.css",
  "js/seed.js",
  "js/product-images.js",
  "js/core.js",
  "js/api.js",
  "js/sync.js",
  "js/front.js",
"js/boot.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/favicon.svg"
];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS).catch(() => {})));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // متعملش كاش أبدًا لواجهة المزامنة (API) أو البث اللحظي (SSE)
  if (url.pathname.startsWith("/api/")) return;
  // ملف الإعدادات بيختلف بين النسختين — سيبه للشبكة دايمًا
  if (/\/js\/config\.js$/.test(url.pathname)) return;

  const isCode = req.mode === "navigate" || url.pathname === "/" ||
    /\.(html|js|css|webmanifest)$/i.test(url.pathname);

  if (isCode) {
    // الملفات الأساسية وكود التطبيق: الشبكة الأول (عشان التحديثات توصل فورًا)
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req).then((hit) => hit || caches.match("index.html")))
    );
  } else {
    // الصور والأيقونات: الكاش الأول (أسرع وتشتغل أوفلاين)
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }))
    );
  }
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const href = (e.notification.data && e.notification.data.href) || "#/";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) { c.focus(); c.postMessage({ type: "navigate", href }); return; }
      }
      if (self.clients.openWindow) return self.clients.openWindow(href);
    })
  );
});
