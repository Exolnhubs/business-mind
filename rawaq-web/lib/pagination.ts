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
