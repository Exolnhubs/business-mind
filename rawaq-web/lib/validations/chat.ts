import { z } from 'zod'

export const CreateChatMessageSchema = z.object({
  content: z.string().min(1).max(1000),
  mentions: z.array(z.string().uuid()).max(10).default([]),
})

export const ListChatSchema = z.object({
  before: z.string().datetime().optional(), // cursor-based pagination
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export type CreateChatMessageInput = z.infer<typeof CreateChatMessageSchema>
export type ListChatInput = z.infer<typeof ListChatSchema>
