// The service worker exists for push and nothing else: no caching, the
// app is small and needs the manager anyway, and a stale cached build
// arguing with the manager's update badge is a bug nobody wants. A push
// shows a notification; a tap on it opens the agent it is about, in a
// window of the app if one is open.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = { title: 'agent-manager', body: '', url: '/', tag: undefined }
  try {
    data = { ...data, ...event.data.json() }
  } catch {
    /* a push without a readable payload still shows as itself */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      renotify: true,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if ('focus' in c) {
          c.navigate(url)
          return c.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
