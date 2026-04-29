import { test } from 'node:test'
import assert from 'node:assert/strict'
import { profileCacheKey } from './profile-cache'

test('profileCacheKey returns namespaced key for a given userId', () => {
  assert.equal(profileCacheKey('abc-123'), 'profile:auth:abc-123')
})

test('profileCacheKey uses the full userId string', () => {
  const id = '550e8400-e29b-41d4-a716-446655440000'
  assert.equal(profileCacheKey(id), `profile:auth:${id}`)
})
