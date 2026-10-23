// Service worker ของระบบตรวจเขต: เก็บไฟล์หน้าเว็บไว้ให้เปิดเร็ว (ข้อมูลจริงอ่านจาก Firestore เสมอ)
const CACHE = "zone-v1";
const SHELL = ["./", "index.html", "app.js", "map.png", "../logo.png", "../icon-192.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  // network-first: ได้โค้ดใหม่ทันทีที่อัปโหลด ถ้าออฟไลน์ใช้ของในแคช
  e.respondWith(fetch(e.request).then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request)));
});
