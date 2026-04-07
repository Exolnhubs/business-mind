export function generateCommunitySlug(name: string, id: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[\u0600-\u06FF]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'community'

  return `${base}-${id.slice(0, 6)}`
}
