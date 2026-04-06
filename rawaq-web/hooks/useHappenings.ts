'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import type { HappeningWithAuthor } from '@/types/database'

export function useHappenings(slug: string, isMember: boolean) {
  const [happenings, setHappenings]   = useState<HappeningWithAuthor[]>([])
  const [loading, setLoading]         = useState(true)
  const [posting, setPosting]         = useState(false)
  const channelRef                    = useRef<ReturnType<typeof createSupabaseBrowserClient>['channel'] extends ((...args: infer A) => infer R) ? R : never | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/communities/${slug}/happenings?per_page=20`)
      if (res.ok) {
        const json = await res.json() as { data: { happenings: HappeningWithAuthor[] } }
        setHappenings(json.data.happenings ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [slug])

  // Initial fetch
  useEffect(() => { load() }, [load])

  // Realtime subscription
  useEffect(() => {
    const supabase = createSupabaseBrowserClient()

    const channel = supabase
      .channel(`community-happenings-${slug}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'happenings' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            // Re-fetch to get the author join
            load()
          } else if (payload.eventType === 'DELETE') {
            setHappenings((prev) => prev.filter((h) => h.id !== (payload.old as { id: string }).id))
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as HappeningWithAuthor
            setHappenings((prev) =>
              prev.map((h) => h.id === updated.id ? { ...h, ...updated } : h)
            )
          }
        }
      )
      .subscribe()

    channelRef.current = channel as any
    return () => { supabase.removeChannel(channel) }
  }, [slug, load])

  async function post(data: {
    type: 'open_invite' | 'info' | 'question' | 'alert'
    body: string
    expires_in_hours?: number
    lat?: number
    lng?: number
  }) {
    setPosting(true)
    try {
      const res = await fetch(`/api/communities/${slug}/happenings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (res.ok) {
        const json = await res.json() as { data: HappeningWithAuthor }
        setHappenings((prev) => [json.data, ...prev])
      }
      return res.ok
    } finally {
      setPosting(false)
    }
  }

  async function toggleRsvp(happening: HappeningWithAuthor) {
    const method = happening.user_has_rsvp ? 'DELETE' : 'POST'
    const res    = await fetch(`/api/happenings/${happening.id}/rsvp`, { method })
    if (res.ok) {
      const json = await res.json() as { data: { rsvp: boolean; rsvp_count: number } }
      setHappenings((prev) =>
        prev.map((h) => h.id === happening.id
          ? { ...h, user_has_rsvp: json.data.rsvp, rsvp_count: json.data.rsvp_count }
          : h
        )
      )
    }
  }

  async function toggleReact(happening: HappeningWithAuthor) {
    const method = happening.user_has_reacted ? 'DELETE' : 'POST'
    const res    = await fetch(`/api/happenings/${happening.id}/react`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method === 'POST' ? JSON.stringify({ emoji: '👍' }) : undefined,
    })
    if (res.ok) {
      const json = await res.json() as { data: { reacted: boolean; reaction_count: number } }
      setHappenings((prev) =>
        prev.map((h) => h.id === happening.id
          ? { ...h, user_has_reacted: json.data.reacted, reaction_count: json.data.reaction_count }
          : h
        )
      )
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/happenings/${id}`, { method: 'DELETE' })
    if (res.ok) setHappenings((prev) => prev.filter((h) => h.id !== id))
  }

  return { happenings, loading, posting, post, toggleRsvp, toggleReact, remove, reload: load }
}
