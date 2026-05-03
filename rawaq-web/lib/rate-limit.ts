import { Ratelimit } from '@upstash/ratelimit'
import { redis } from '@/lib/redis'
import { RateLimitException } from './errors'

// Single Redis instance — reused across requests within the same warm function
function sw(
  requests: number,
  window: `${number} ${'s' | 'm' | 'h' | 'd'}`,
  prefix: string,
) {
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(requests, window),
    prefix: `rl:${prefix}`,
    // analytics removed — without waitUntil it runs as a second synchronous
    // HTTP call to Upstash on every API request, doubling Redis round-trips
  })
}

export const limiters = {
  globalIp:               sw(300, '1 m',  'global'),
  bookings:               sw(10,  '1 m',  'bookings'),
  payments:               sw(5,   '1 m',  'payments'),
  chat:                   sw(10,  '1 m',  'chat'),
  comments:               sw(15,  '1 m',  'comments'),
  supportChat:            sw(20,  '1 m',  'support:chat'),
  recommendations:        sw(20,  '1 m',  'recommendations'),
  tips:                   sw(5,   '1 m',  'tips'),
  organizerReq:           sw(3,   '24 h', 'organizer:req'),
  reactions:              sw(30,  '1 m',  'reactions'),
  rsvp:                   sw(20,  '1 m',  'rsvp'),
  communityJoin:          sw(10,  '1 m',  'community:join'),
  happenings:             sw(5,   '1 m',  'happenings'),
  happeningParticipants:  sw(60,  '1 m',  'happening:participants'),
  eventCreate:            sw(20,  '1 h',  'events:create'),
  referralClaim:          sw(5,   '1 h',  'referral:claim'),
  communityCreate:        sw(3,   '30 d', 'community:create'),
}

export async function checkRateLimit(
  limiter: Ratelimit,
  identifier: string,
): Promise<void> {
  const { success, reset } = await limiter.limit(identifier)
  if (!success) {
    throw new RateLimitException(Math.ceil((reset - Date.now()) / 1000))
  }
}
