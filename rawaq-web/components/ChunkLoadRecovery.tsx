'use client'

import { useEffect } from 'react'

const RELOAD_FLAG = 'rawaq_chunk_reload_attempted'

function isChunkLoadFailure(reason: unknown) {
  if (!reason) return false
  const message = reason instanceof Error ? reason.message : String(reason)
  return /ChunkLoadError|Loading chunk .* failed|_next\/static\/chunks/i.test(message)
}

async function clearRuntimeCaches() {
  if (!('caches' in window)) return
  const keys = await caches.keys()
  await Promise.all(keys.filter((key) => key.startsWith('rawaq-')).map((key) => caches.delete(key)))
}

export function ChunkLoadRecovery() {
  useEffect(() => {
    const recover = async (reason: unknown) => {
      if (!isChunkLoadFailure(reason)) return
      if (sessionStorage.getItem(RELOAD_FLAG) === '1') return

      sessionStorage.setItem(RELOAD_FLAG, '1')
      await clearRuntimeCaches().catch(() => {})
      window.location.reload()
    }

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      recover(event.reason)
    }

    const onError = (event: ErrorEvent) => {
      recover(event.error ?? event.message)
    }

    window.addEventListener('unhandledrejection', onUnhandledRejection)
    window.addEventListener('error', onError)

    return () => {
      window.removeEventListener('unhandledrejection', onUnhandledRejection)
      window.removeEventListener('error', onError)
    }
  }, [])

  return null
}
