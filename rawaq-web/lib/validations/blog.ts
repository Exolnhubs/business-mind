import { z } from 'zod'

export const IMAGE_MAX_BYTES = 10 * 1024 * 1024 // 10 MB
export const VIDEO_MAX_BYTES = 50 * 1024 * 1024 // 50 MB
export const VIDEO_MAX_SECONDS = 60

export const BlogMediaInput = z.object({
  kind: z.enum(['image', 'video', 'link']),
  url: z.string().url(),
  title: z.string().max(200).optional().nullable(),
  thumbnail_url: z.string().url().optional().nullable(),
  caption: z.string().max(500).optional().nullable(),
  position: z.number().int().min(0).default(0),
})

export const CreateBlogPostSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(10000).optional().nullable(),
  status: z.enum(['draft', 'published']).default('draft'),
  media: z.array(BlogMediaInput).max(20).default([]),
})

export const UpdateBlogPostSchema = CreateBlogPostSchema.partial()

export type BlogMediaInput = z.infer<typeof BlogMediaInput>
export type CreateBlogPostInput = z.infer<typeof CreateBlogPostSchema>
export type UpdateBlogPostInput = z.infer<typeof UpdateBlogPostSchema>
