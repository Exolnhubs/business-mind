import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyResponse, classifyThrown } from './error-classifier'

function res(status: number, headers: Record<string, string> = {}): Response {
  return new Response(null, { status, headers })
}

test('429 with Retry-After becomes rate_limited with seconds', () => {
  const out = classifyResponse(res(429, { 'Retry-After': '12' }))
  assert.deepEqual(out, { kind: 'rate_limited', retryAfterSec: 12 })
})

test('429 without Retry-After becomes rate_limited with null', () => {
  const out = classifyResponse(res(429))
  assert.deepEqual(out, { kind: 'rate_limited', retryAfterSec: null })
})

test('500/502/503/504 become transient', () => {
  for (const s of [500, 502, 503, 504]) {
    assert.deepEqual(classifyResponse(res(s)), { kind: 'transient' }, `status ${s}`)
  }
})

test('401/403 become auth', () => {
  for (const s of [401, 403]) {
    assert.deepEqual(classifyResponse(res(s)), { kind: 'auth' }, `status ${s}`)
  }
})

test('400/404/409/422 become client', () => {
  for (const s of [400, 404, 409, 422]) {
    assert.deepEqual(classifyResponse(res(s)), { kind: 'client' }, `status ${s}`)
  }
})

test('200 returns null (not an error)', () => {
  assert.equal(classifyResponse(res(200)), null)
})

test('AbortError thrown by our timeout becomes timeout', () => {
  const err = new DOMException('aborted', 'AbortError')
  assert.deepEqual(classifyThrown(err, { isOnline: true, timedOut: true }), { kind: 'timeout' })
})

test('Network throw with offline flag becomes offline', () => {
  const err = new TypeError('Failed to fetch')
  assert.deepEqual(classifyThrown(err, { isOnline: false, timedOut: false }), { kind: 'offline' })
})

test('Network throw while online becomes transient', () => {
  const err = new TypeError('Failed to fetch')
  assert.deepEqual(classifyThrown(err, { isOnline: true, timedOut: false }), { kind: 'transient' })
})

test('Unknown error type becomes unknown', () => {
  assert.deepEqual(classifyThrown('string-error', { isOnline: true, timedOut: false }), { kind: 'unknown' })
})
