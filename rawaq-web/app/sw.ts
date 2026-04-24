/// <reference lib="webworker" />

import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import {
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  Serwist,
  StaleWhileRevalidate,
} from 'serwist'

import { classifyRequest, USER_CACHES_PREFIX } from '@/lib/sw-matchers'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

const CACHE_VERSION = 'v1'
const CACHE_NAMES = {
  static:    `rawaq-static-${CACHE_VERSION}`,
  apiPublic: `rawaq-api-public-${CACHE_VERSION}`,
  pages:     `rawaq-pages-${CACHE_VERSION}`,
} as const

const serwist = new Serwist({
  precacheEntries: [
    ...(self.__SW_MANIFEST ?? []),
    { url: '/offline', revision: CACHE_VERSION },
  ],
  skipWaiting: true,
  clientsClaim: true,
  disableDevLogs: true,
  fallbacks: {
    entries: [
      {
        url: '/offline',
        matcher: ({ request }) => request.destination === 'document',
      },
    ],
  },
  runtimeCaching: [
    {
      matcher: ({ request }) => classifyRequest(request) === 'static',
      handler: new CacheFirst({
        cacheName: CACHE_NAMES.static,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 200,
            maxAgeSeconds: 60 * 60 * 24 * 30,
          }),
        ],
      }),
    },
    {
      matcher: ({ request }) => classifyRequest(request) === 'swr-public',
      handler: new StaleWhileRevalidate({
        cacheName: CACHE_NAMES.apiPublic,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 200,
            maxAgeSeconds: 60 * 5,
          }),
        ],
      }),
    },
    {
      matcher: ({ request }) => classifyRequest(request) === 'pages',
      handler: new NetworkFirst({
        cacheName: CACHE_NAMES.pages,
        networkTimeoutSeconds: 3,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 50,
            maxAgeSeconds: 60 * 60 * 24,
          }),
        ],
      }),
    },
    {
      matcher: () => true,
      handler: new NetworkOnly(),
    },
  ],
})

self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      const current = new Set<string>(Object.values(CACHE_NAMES))
      await Promise.all(
        keys
          .filter((k) => k.startsWith('rawaq-') && !current.has(k))
          .filter((k) => !k.startsWith('rawaq-precache-'))
          .map((k) => caches.delete(k)),
      )
    })(),
  )
})

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  const data = event.data as { type?: string } | undefined
  if (data?.type !== 'CLEAR_CACHES') return
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((name) => USER_CACHES_PREFIX.some((p) => name.startsWith(p)))
          .map((name) => caches.delete(name)),
      )
    })(),
  )
})

serwist.addEventListeners()
