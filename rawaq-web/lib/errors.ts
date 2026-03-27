import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

export class ApiException extends Error {
  constructor(
    public readonly message: string,
    public readonly statusCode: number = 400,
    public readonly code?: string
  ) {
    super(message)
    this.name = 'ApiException'
  }
}

export class UnauthorizedException extends ApiException {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED')
  }
}

export class ForbiddenException extends ApiException {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN')
  }
}

export class NotFoundException extends ApiException {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND')
  }
}

export class ConflictException extends ApiException {
  constructor(message: string) {
    super(message, 409, 'CONFLICT')
  }
}

export class BadRequestException extends ApiException {
  constructor(message: string) {
    super(message, 400, 'BAD_REQUEST')
  }
}

// Map Supabase/postgres error codes to friendly messages
function mapDbError(error: { code?: string; message?: string }): { message: string; status: number } {
  switch (error.code) {
    case 'P0001': return { message: 'Event is fully booked', status: 409 }
    case 'P0002': return { message: 'You already have an active booking for this event', status: 409 }
    case 'P0003': return { message: 'This ticket type is sold out', status: 409 }
    case '23505': return { message: 'Duplicate entry', status: 409 }
    case '23503': return { message: 'Referenced record not found', status: 404 }
    case 'PGRST116': return { message: 'Record not found', status: 404 }
    default: return { message: error.message || 'Database error', status: 500 }
  }
}

export function handleApiError(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: 'Validation failed', details: error.flatten().fieldErrors },
      { status: 422 }
    )
  }

  if (error instanceof ApiException) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.statusCode }
    )
  }

  // Supabase/Postgres errors
  if (error instanceof Error && 'code' in error) {
    const mapped = mapDbError(error as { code?: string; message?: string })
    return NextResponse.json({ error: mapped.message }, { status: mapped.status })
  }

  // Supabase returns errors as plain objects with { code, message }
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const mapped = mapDbError(error as { code?: string; message?: string })
    return NextResponse.json({ error: mapped.message }, { status: mapped.status })
  }

  console.error('[API Error]', error)
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ data }, { status })
}

export function created<T>(data: T): NextResponse {
  return NextResponse.json({ data }, { status: 201 })
}
