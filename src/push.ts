import { api } from '@/api/client'

/**
 * Web push for this browser: the service worker (push only, no caching),
 * a subscription made with the manager's public key and handed to it,
 * and the way back out. On iOS this works only once the site is on the
 * home screen; elsewhere any modern browser will do. `state()` says
 * where this browser stands so the settings menu can show it.
 */
export function supported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  return reg
}

export async function state(): Promise<'unsupported' | 'off' | 'on' | 'blocked'> {
  if (!supported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'blocked'
  const reg = await navigator.serviceWorker.getRegistration('/sw.js')
  const sub = reg ? await reg.pushManager.getSubscription() : null
  return sub ? 'on' : 'off'
}

function toKey(base64url: string): Uint8Array {
  const b64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

/** Asks the browser, subscribes, tells the manager; false when the person refused. */
export async function enable(): Promise<boolean> {
  if ((await Notification.requestPermission()) !== 'granted') return false
  const reg = await registration()
  const { publicKey } = await api.pushKey()
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: toKey(publicKey) as BufferSource,
    }))
  await api.pushSubscribe(sub.toJSON())
  return true
}

export async function disable(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration('/sw.js')
  const sub = reg ? await reg.pushManager.getSubscription() : null
  if (!sub) return
  await api.pushUnsubscribe(sub.endpoint).catch(() => undefined)
  await sub.unsubscribe()
}
