import { z } from 'zod'

const EventFrequencySchema = z.enum(['one_time', 'weekly', 'monthly'])

// Base object — keep as ZodObject so .partial() / .extend() work on it
const EventBaseSchema = z.object({
  category_id: z.string().uuid().optional(),
  title: z.string().min(3).max(200),
  title_ar: z.string().min(3).max(200).optional(),
  description: z.string().max(5000).optional(),
  description_ar: z.string().max(5000).optional(),
  cover_image_url: z.string().url().optional(),
  start_at: z.string().datetime(),
  end_at: z.string().datetime().optional(),
  event_frequency: EventFrequencySchema.default('one_time'),
  recurrence_until: z.string().datetime().optional(),
  venue_name: z.string().max(200).optional(),
  venue_name_ar: z.string().max(200).optional(),
  address: z.string().max(500).optional(),
  city: z.string().min(1).max(100),
  country: z.string().length(2).default('SA'),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  capacity: z.number().int().positive().optional(),
  is_free: z.boolean().default(true),
  price: z.number().positive().optional(),
  currency: z.string().length(3).default('SAR'),
  gender_restriction: z.enum(['male', 'female', 'mixed']).default('mixed'),
  is_family_friendly: z.boolean().default(true),
  is_private: z.boolean().default(false),
  is_premium_only: z.boolean().default(false),
  is_published: z.boolean().default(false),
})

// Extend base with community fields
const EventCommunityFields = {
  visibility_type: z.enum(['micro', 'interest', 'city', 'national']).default('city'),
  community_ids: z.array(z.string().uuid()).max(10).optional(),
}

export const CreateEventSchema = EventBaseSchema.extend(EventCommunityFields).refine(
  (d) => d.is_free || (d.price !== undefined && d.price > 0),
  { message: 'Paid events must have a price', path: ['price'] }
).refine(
  (d) => !d.end_at || new Date(d.end_at) > new Date(d.start_at),
  { message: 'end_at must be after start_at', path: ['end_at'] }
).refine(
  (d) => !d.recurrence_until || new Date(d.recurrence_until) >= new Date(d.start_at),
  { message: 'recurrence_until must be on or after start_at', path: ['recurrence_until'] }
)

export const UpdateEventSchema = EventBaseSchema.partial().extend({
  category_id: z.string().uuid().nullable().optional(),
  title_ar: z.string().min(3).max(200).nullable().optional(),
  description: z.string().max(5000).nullable().optional(),
  description_ar: z.string().max(5000).nullable().optional(),
  cover_image_url: z.string().url().nullable().optional(),
  end_at: z.string().datetime().nullable().optional(),
  event_frequency: EventFrequencySchema.optional(),
  recurrence_until: z.string().datetime().nullable().optional(),
  venue_name: z.string().max(200).nullable().optional(),
  venue_name_ar: z.string().max(200).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  capacity: z.number().int().positive().nullable().optional(),
  price: z.number().positive().nullable().optional(),
  is_cancelled: z.boolean().optional(),
  cancelled_reason: z.string().max(500).optional(),
  visibility_type: z.enum(['micro', 'interest', 'city', 'national']).optional(),
  community_ids: z.array(z.string().uuid()).max(10).optional(),
})

export const ListEventsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
  city: z.string().optional(),
  category_id: z.string().uuid().optional(),
  gender: z.enum(['male', 'female', 'mixed']).optional(),
  is_family_friendly: z.coerce.boolean().optional(),
  is_free: z.coerce.boolean().optional(),
  date_from: z.string().datetime().optional(),
  date_to: z.string().datetime().optional(),
  search: z.string().max(100).optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  radius_km: z.coerce.number().positive().max(500).optional(),
  organizer_id: z.string().uuid().optional(),
  organizer_own: z.coerce.boolean().optional(),
  community: z.string().optional(),            // community slug filter
  visibility: z.enum(['micro', 'interest', 'city', 'national']).optional(),
  hosted_by: z.enum(['company', 'individual', 'all']).default('all'),
})

export type CreateEventInput = z.infer<typeof CreateEventSchema>
export type UpdateEventInput = z.infer<typeof UpdateEventSchema>
export type ListEventsInput = z.infer<typeof ListEventsSchema>
