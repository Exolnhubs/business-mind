import { z } from 'zod'

export const CreateBookingSchema = z.object({
  event_id: z.string().uuid(),
  notes: z.string().max(500).optional(),
})

export const UpdateBookingSchema = z.object({
  status: z.enum(['cancelled', 'confirmed', 'waitlisted']),
})

export type CreateBookingInput = z.infer<typeof CreateBookingSchema>
export type UpdateBookingInput = z.infer<typeof UpdateBookingSchema>
