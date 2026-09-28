// LAVAALL OS service worker. Scope is /ops. Shows a native notification
// from the encrypted push payload and opens the founders thread.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (err) {
    data = {};
  }
  const title = typeof data.title === 'string' && data.title ? data.title : 'LAVAALL';
  const text = typeof data.body === 'string' && data.body ? data.body : 'New message';
  const sent = data.sentAt ? new Date(data.sentAt) : null;
  const time = sent && !Number.isNaN(sent.getTime()) ? sent.toLocaleString() : '';
  const body = time ? `${text} · ${time}` : text;
  const tag = typeof data.tag === 'string' && data.tag ? data.tag : 'founders-chat';
  event.waitUntil(self.registration.showNotification(title, {
    body,
    tag,
    renotify: true,
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = 'https://www.lavaall.com/ops/founders';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    const open = windows.find((client) => String(client.url || '').includes('/ops'));
    if (open && typeof open.focus === 'function') return open.focus();
    if (self.clients.openWindow) return self.clients.openWindow(target);
    return undefined;
  }));
});
