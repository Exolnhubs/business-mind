import { z } from 'zod'

export const CreateTipSchema = z.object({
  event_id: z.string().uuid(),
  amount: z.number().positive().multipleOf(0.01).max(10000),
  currency: z.string().length(3).default('SAR'),
  message: z.string().max(300).optional(),
})

export type CreateTipInput = z.infer<typeof CreateTipSchema>
