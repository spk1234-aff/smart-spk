// แจ้งเตือน push (ถูกโหลดเข้า service worker หลักผ่าน workbox importScripts)
self.addEventListener('push', function (e) {
  var j = {};
  try { j = e.data ? e.data.json() : {}; } catch (err) { try { j = { data: { title: 'SPK Pro.', body: e.data.text() } }; } catch (e2) {} }
  var d = j.data || j.notification || j || {};
  var title = d.title || 'SPK Pro.';
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || '', icon: 'icon-192.png', badge: 'icon-192.png',
    tag: d.tag || undefined, data: { page: d.page || '' }
  }));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var page = (e.notification.data || {}).page || '';
  var base = self.registration.scope;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.url.indexOf(base) === 0 && 'focus' in c) { c.postMessage({ type: 'push-go', page: page }); return c.focus(); }
    }
    return self.clients.openWindow(base + (page ? '?go=' + encodeURIComponent(page) : ''));
  }));
});
