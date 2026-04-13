import { z } from 'zod'

export const CreateCommentSchema = z.object({
  event_id: z.string().uuid().optional(),
  happening_id: z.string().uuid().optional(),
  content: z.string().min(0).max(2000).default(''),
  parent_id: z.string().uuid().optional(),
  mentions: z.array(z.string().uuid()).max(20).default([]),
  media_url: z.string().url().optional().nullable(),
}).refine(
  (input) => Number(Boolean(input.event_id)) + Number(Boolean(input.happening_id)) === 1,
  { message: 'Exactly one comment target must be provided', path: ['event_id'] },
)

export const ListCommentsSchema = z.object({
  event_id: z.string().uuid().optional(),
  happening_id: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(50),
  parent_id: z.string().uuid().optional().nullable(),
}).refine(
  (input) => Number(Boolean(input.event_id)) + Number(Boolean(input.happening_id)) === 1,
  { message: 'Exactly one comment target must be provided', path: ['event_id'] },
)

export const ReportCommentSchema = z.object({
  reason: z.enum(['spam', 'inappropriate', 'harassment', 'misinformation', 'other']),
  details: z.string().max(500).optional(),
})

export type CreateCommentInput = z.infer<typeof CreateCommentSchema>
export type ListCommentsInput = z.infer<typeof ListCommentsSchema>
export type ReportCommentInput = z.infer<typeof ReportCommentSchema>
