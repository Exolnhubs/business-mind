'use client'

import { useEffect } from 'react'

async function clearRawaqCaches() {
  if (typeof window === 'undefined') return
  if (!('caches' in window)) return

  const keys = await caches.keys()
  await Promise.all(keys.filter((key) => key.startsWith('rawaq-')).map((key) => caches.delete(key)))
}

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return

    if (process.env.NODE_ENV !== 'production') {
      const cleanupDevServiceWorkers = async () => {
        try {
          const registrations = await navigator.serviceWorker.getRegistrations()
          await Promise.all(registrations.map((registration) => registration.unregister()))
          await clearRawaqCaches()
        } catch (err) {
          console.warn('[sw] dev cleanup failed:', err)
        }
      }
      cleanupDevServiceWorkers()
      return
    }

    const register = async () => {
      try {
        await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      } catch (err) {
        console.warn('[sw] registration failed:', err)
      }
    }
    register()
  }, [])

  return null
}
