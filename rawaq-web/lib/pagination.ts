export const MAX_PER_PAGE = 100

/**
 * Parse a `per_page` query string value, clamped to [1, MAX_PER_PAGE].
 * Falls back to `fallback` when the input is missing or invalid.
 */
export function parsePerPage(value: string | null | undefined, fallback = 20): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 1) return Math.min(fallback, MAX_PER_PAGE)
  return Math.min(Math.floor(n), MAX_PER_PAGE)
}

/**
 * Parse a `page` query string value (1-based).
 */
export function parsePage(value: string | null | undefined, fallback = 1): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 1) return fallback
  return Math.floor(n)
}

export interface PaginationParams {
  page: number
  per_page: number
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  per_page: number
  has_more: boolean
}

export function paginationRange(page: number, perPage: number): { from: number; to: number } {
  const from = (page - 1) * perPage
  return { from, to: from + perPage - 1 }
}

export function paginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  perPage: number,
): PaginatedResponse<T> {
  return {
    data,
    total,
    page,
    per_page: perPage,
    has_more: total > page * perPage,
  }
}
