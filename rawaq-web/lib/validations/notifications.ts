import { z } from 'zod'

export const RegisterDeviceSchema = z.object({
  token: z.string().min(10).max(500),
  platform: z.enum(['ios', 'android', 'web']),
})

export const ListNotificationsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(30),
  unread_only: z.coerce.boolean().default(false),
})

export type RegisterDeviceInput = z.infer<typeof RegisterDeviceSchema>
export type ListNotificationsInput = z.infer<typeof ListNotificationsSchema>
