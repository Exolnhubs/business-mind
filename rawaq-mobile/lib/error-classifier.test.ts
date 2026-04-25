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
  for (const status of [500, 502, 503, 504]) {
    assert.deepEqual(classifyResponse(res(status)), { kind: 'transient' }, `status ${status}`)
  }
})

test('401/403 become auth', () => {
  for (const status of [401, 403]) {
    assert.deepEqual(classifyResponse(res(status)), { kind: 'auth' }, `status ${status}`)
  }
})

test('400/404/409/422 become client', () => {
  for (const status of [400, 404, 409, 422]) {
    assert.deepEqual(classifyResponse(res(status)), { kind: 'client' }, `status ${status}`)
  }
})

test('200 returns null', () => {
  assert.equal(classifyResponse(res(200)), null)
})

test('AbortError thrown by our timeout becomes timeout', () => {
  const err = new DOMException('aborted', 'AbortError')
  assert.deepEqual(classifyThrown(err, { isOnline: true, timedOut: true }), { kind: 'timeout' })
})

test('Network throw with offline flag becomes offline', () => {
  const err = new TypeError('Network request failed')
  assert.deepEqual(classifyThrown(err, { isOnline: false, timedOut: false }), { kind: 'offline' })
})

test('Network throw while online becomes transient', () => {
  const err = new TypeError('Network request failed')
  assert.deepEqual(classifyThrown(err, { isOnline: true, timedOut: false }), { kind: 'transient' })
})

test('Unknown error becomes unknown', () => {
  assert.deepEqual(classifyThrown('string-error', { isOnline: true, timedOut: false }), { kind: 'unknown' })
})
