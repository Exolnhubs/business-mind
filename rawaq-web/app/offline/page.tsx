import type { Metadata } from 'next'
import { OfflineRetryButton } from './RetryButton'

export const metadata: Metadata = {
  title: 'Offline',
  description: 'You are currently offline.',
}

export default function OfflinePage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: '#1a0d04',
        color: '#fff',
        fontFamily:
          "system-ui, -apple-system, 'Mulish', 'Noto Sans Arabic', sans-serif",
      }}
    >
      <div style={{ maxWidth: 420, textAlign: 'center' }}>
        <div
          style={{ fontSize: 64, lineHeight: 1, marginBottom: 16 }}
          aria-hidden
        >
          ✱
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 12px' }}>
          You&rsquo;re offline
        </h1>
        <p style={{ opacity: 0.75, margin: '0 0 24px', lineHeight: 1.5 }}>
          We couldn&rsquo;t reach the network. Some pages you&rsquo;ve already
          visited may still work from cache.
        </p>
        <OfflineRetryButton />
      </div>
    </main>
  )
}
