'use client'

export function OfflineRetryButton() {
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      style={{
        padding: '12px 28px',
        borderRadius: 999,
        border: 'none',
        background: '#D4A574',
        color: '#1a0d04',
        fontWeight: 700,
        fontSize: 16,
        cursor: 'pointer',
      }}
    >
      Retry
    </button>
  )
}
