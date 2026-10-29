// ウェブ版のまとめ通知を出す（Web Push）。文は送る側（tools/digest.mjs）と同じ決まった一文だけで、中身は運ばない
self.addEventListener('push', e => {
  let n = {};
  try { n = e.data.json().notification || {}; } catch (err) { /* 読めなくても決まった文を出す */ }
  e.waitUntil(self.registration.showNotification(n.title || 'はんぶんこ', { body: n.body || '相手から届いたものがあります', icon: 'icon.svg', tag: 'digest' }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window' }).then(list => list.length ? list[0].focus() : clients.openWindow('./')));
});
