import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { RateLimitException } from './errors'

const redis = Redis.fromEnv()

function sw(
  requests: number,
  window: `${number} ${'s' | 'm' | 'h' | 'd'}`,
  prefix: string,
) {
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(requests, window),
    prefix: `rl:${prefix}`,
    analytics: true,
  })
}

export const limiters = {
  globalIp:       sw(300, '1 m',  'global'),
  bookings:       sw(10,  '1 m',  'bookings'),
  payments:       sw(5,   '1 m',  'payments'),
  chat:           sw(10,  '1 m',  'chat'),
  comments:       sw(15,  '1 m',  'comments'),
  supportTickets: sw(5,   '1 h',  'support:tickets'),
  supportChat:    sw(20,  '1 m',  'support:chat'),
  tips:           sw(5,   '1 m',  'tips'),
  organizerReq:   sw(3,   '24 h', 'organizer:req'),
  reactions:      sw(30,  '1 m',  'reactions'),
  rsvp:           sw(20,  '1 m',  'rsvp'),
  communityJoin:  sw(10,  '1 m',  'community:join'),
  happenings:     sw(5,   '1 m',  'happenings'),
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
