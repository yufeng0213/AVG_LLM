/**
 * Service Worker - 角色主动消息推送
 * 处理通知点击，导航回短信页面。
 */

const CACHE_NAME = 'avg-llm-v1'

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
    ),
  )
  self.clients.claim()
})

// 通知点击：导航到短信页面
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const data = event.notification.data || {}
  const smsAppUrl = data.targetUrl || self.location.origin

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // 找到已打开的窗口，聚焦它
      for (const client of clients) {
        if (client.url.includes(self.location.origin)) {
          // 通过 postMessage 告诉主应用打开短信页面
          client.postMessage({
            type: 'navigate-to-sms',
            contactId: data.contactId || null,
          })
          return client.focus()
        }
      }
      // 没有已打开的窗口，新开一个
      return self.clients.openWindow(smsAppUrl)
    }),
  )
})

// 接收主应用的 postMessage（生成新消息后触发通知）
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'show-notification') {
    const { title, body, contactId, targetUrl } = event.data
    self.registration.showNotification(title, {
      body,
      icon: '/favicon.svg',
      data: { contactId, targetUrl },
      tag: `sms-${contactId || 'general'}`, // 相同 tag 替换，不堆积
      renotify: true,
    })
  }
})
