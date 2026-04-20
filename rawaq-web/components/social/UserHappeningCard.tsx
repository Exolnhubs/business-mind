import Link from 'next/link'
import { formatRelativeTime } from '@/lib/utils'

interface Community { name: string; slug: string }
interface HappeningCardProps {
  id: string
  body: string
  created_at: string
  expires_at: string | null
  communities: Community | null
  reactions: Array<{ count: number }>
  rsvps: Array<{ count: number }>
}

export function UserHappeningCard({ body, created_at, expires_at, communities, reactions, rsvps }: HappeningCardProps) {
  const isPast = expires_at ? new Date(expires_at) < new Date() : false
  const reactionCount = reactions?.[0]?.count ?? 0
  const rsvpCount = rsvps?.[0]?.count ?? 0

  return (
    <div className="card p-4 space-y-2">
      {communities && (
        <Link href={`/communities/${communities.slug}`} className="inline-block text-xs font-medium text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full hover:bg-brand-100 transition-colors">
          {communities.name}
        </Link>
      )}
      <p className="text-sm text-gray-800 line-clamp-3 leading-relaxed">{body}</p>
      <div className="flex items-center gap-3 text-xs text-gray-400">
        <span>{formatRelativeTime(created_at)}</span>
        {reactionCount > 0 && <span>👍 {reactionCount}</span>}
        {rsvpCount > 0 && <span>✋ {rsvpCount}</span>}
        {isPast && <span className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded text-[10px] font-medium">Past</span>}
      </div>
    </div>
  )
}

export function UserHappeningCardSkeleton() {
  return (
    <div className="card p-4 space-y-2">
      <div className="skeleton h-3 w-24 rounded" />
      <div className="skeleton h-4 w-full rounded" />
      <div className="skeleton h-3 w-3/4 rounded" />
      <div className="skeleton h-3 w-1/3 rounded" />
    </div>
  )
}
