import { z } from 'zod'

const HolderSchema = z.object({
  full_name:     z.string().min(1).max(120),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format'),
  relation:      z.string().min(1).max(60),
  position:      z.number().int().min(2),
})

export const CreateBookingSchema = z.object({
  event_id:       z.string().uuid(),
  occurrence_id:  z.string().uuid().optional().nullable(),
  ticket_type_id: z.string().uuid().optional().nullable(),
  promo_code:     z.string().max(32).optional().nullable(),
  notes:          z.string().max(500).optional(),
  group_size:     z.number().int().min(1).max(10).default(1),
  holders:        z.array(HolderSchema).optional().default([]),
})

export const UpdateBookingSchema = z.object({
  status: z.enum(['cancelled', 'confirmed', 'waitlisted']).optional(),
  holders: z.array(HolderSchema).optional(),
}).refine((value) => value.status !== undefined || value.holders !== undefined, {
  message: 'At least one booking update field is required',
})

export type CreateBookingInput = z.infer<typeof CreateBookingSchema>
export type UpdateBookingInput = z.infer<typeof UpdateBookingSchema>
export type HolderInput = z.infer<typeof HolderSchema>
