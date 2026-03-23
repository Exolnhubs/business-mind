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
  const rtf = new Intl.RelativeTimeFormat(locale === 'ar' ? 'ar' : 'en', { numeric: 'auto' })
  if (diff < 60)    return rtf.format(-Math.round(diff), 'seconds')
  if (diff < 3600)  return rtf.format(-Math.round(diff / 60), 'minutes')
  if (diff < 86400) return rtf.format(-Math.round(diff / 3600), 'hours')
  return rtf.format(-Math.round(diff / 86400), 'days')
}

export function truncate(str: string, n: number): string {
  return str.length > n ? str.slice(0, n - 1) + '…' : str
}
