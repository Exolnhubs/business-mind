export function formatDate(date: string | Date, locale = 'en'): string {
  return new Date(date).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatTime(date: string | Date, locale = 'en'): string {
  return new Date(date).toLocaleTimeString(locale === 'ar' ? 'ar-SA' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatCurrency(amount: number, locale = 'en'): string {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-SA' : 'en-US', {
    style: 'currency',
    currency: 'SAR',
    minimumFractionDigits: 0,
  }).format(amount)
}

export function formatRelativeTime(date: string | Date, locale = 'en'): string {
  const diff = (Date.now() - new Date(date).getTime()) / 1000
  const isAr = locale === 'ar'

  // Intl.RelativeTimeFormat is not available in all Hermes builds
  if (typeof Intl !== 'undefined' && typeof (Intl as Record<string, unknown>).RelativeTimeFormat === 'function') {
    const rtf = new Intl.RelativeTimeFormat(isAr ? 'ar' : 'en', { numeric: 'auto' })
    if (diff < 60)    return rtf.format(-Math.round(diff), 'second')
    if (diff < 3600)  return rtf.format(-Math.round(diff / 60), 'minute')
    if (diff < 86400) return rtf.format(-Math.round(diff / 3600), 'hour')
    return rtf.format(-Math.round(diff / 86400), 'day')
  }

  // Hermes-safe fallback
  if (diff < 60)    return isAr ? 'الآن' : 'just now'
  if (diff < 3600)  { const m = Math.round(diff / 60);   return isAr ? `منذ ${m}د`  : `${m}m ago` }
  if (diff < 86400) { const h = Math.round(diff / 3600);  return isAr ? `منذ ${h}س`  : `${h}h ago` }
  const d = Math.round(diff / 86400); return isAr ? `منذ ${d}ي` : `${d}d ago`
}

export function truncate(str: string, n: number): string {
  return str.length > n ? str.slice(0, n - 1) + '…' : str
}
