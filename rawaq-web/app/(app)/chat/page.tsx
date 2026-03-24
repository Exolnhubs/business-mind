'use client'

import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/auth-context'
import { formatRelativeTime } from '@/lib/utils'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'

interface ChatMessage {
  id: string
  content: string
  created_at: string
  mentions: string[]
  author: { id: string; display_name: string; avatar_url: string | null } | null
}

const PAGE_SIZE = 50

export default function ChatPage() {
  const { user, profile, loading: authLoading } = useAuth()
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [fetching, setFetching] = useState(true)
  const [sending, setSending] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [content, setContent] = useState('')
  const [, startTransition] = useTransition()

  const bottomRef = useRef<HTMLDivElement>(null)
  const oldestCursorRef = useRef<string | null>(null)
  // Track if the user is scrolled near bottom to decide whether to auto-scroll
  const containerRef = useRef<HTMLDivElement>(null)

  // Redirect if not authenticated (after auth loads)
  useEffect(() => {
    if (!authLoading && !user) router.replace('/login')
  }, [authLoading, user, router])

  // Load initial messages
  useEffect(() => {
    if (!user) return
    loadMessages()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  async function loadMessages() {
    setFetching(true)
    const res = await fetch(`/api/chat?limit=${PAGE_SIZE}`)
    if (res.ok) {
      const { data } = await res.json() as { data: ChatMessage[] }
      // API returns newest-first; reverse to show oldest-first in the chat window
      const ordered = [...data].reverse()
      setMessages(ordered)
      setHasMore(data.length === PAGE_SIZE)
      if (data.length > 0) {
        oldestCursorRef.current = data[data.length - 1].created_at
      }
    }
    setFetching(false)
    // Scroll to bottom after initial load
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'instant' }), 50)
  }

  async function loadMore() {
    if (!oldestCursorRef.current || loadingMore) return
    setLoadingMore(true)
    const res = await fetch(`/api/chat?limit=${PAGE_SIZE}&before=${encodeURIComponent(oldestCursorRef.current)}`)
    if (res.ok) {
      const { data } = await res.json() as { data: ChatMessage[] }
      const ordered = [...data].reverse()
      setMessages((prev) => [...ordered, ...prev])
      setHasMore(data.length === PAGE_SIZE)
      if (data.length > 0) oldestCursorRef.current = data[data.length - 1].created_at
    }
    setLoadingMore(false)
  }

  // Real-time subscription
  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel('global-chat')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'global_chat' },
        async (payload) => {
          const { data: author } = await supabase
            .from('profiles')
            .select('id, display_name, avatar_url')
            .eq('id', payload.new.user_id)
            .single()

          const newMsg: ChatMessage = {
            ...(payload.new as ChatMessage),
            author: author ?? { id: payload.new.user_id, display_name: 'Unknown', avatar_url: null },
          }

          startTransition(() => {
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev
              return [...prev, newMsg]
            })
          })

          // Auto-scroll only if the user is already near the bottom
          const el = containerRef.current
          if (el) {
            const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120
            if (nearBottom) {
              setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 30)
            }
          }
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  async function sendMessage(e: FormEvent) {
    e.preventDefault()
    const text = content.trim()
    if (!text || sending || !user) return

    setSending(true)
    setContent('')

    // Optimistic insert
    const tempId = `temp-${Date.now()}`
    const optimistic: ChatMessage = {
      id: tempId,
      content: text,
      created_at: new Date().toISOString(),
      mentions: [],
      author: { id: user.id, display_name: profile?.display_name ?? 'You', avatar_url: profile?.avatar_url ?? null },
    }
    setMessages((prev) => [...prev, optimistic])
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 30)

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text, mentions: [] }),
    })

    if (!res.ok) {
      // Roll back optimistic message on failure
      setMessages((prev) => prev.filter((m) => m.id !== tempId))
      setContent(text)
    } else {
      // Replace temp with real message (realtime will also fire; dedup handles it)
      const { data: real } = await res.json() as { data: ChatMessage }
      setMessages((prev) => prev.map((m) => (m.id === tempId ? real : m)))
    }

    setSending(false)
  }

  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 flex flex-col" style={{ height: 'calc(100vh - 5rem)' }}>
      {/* Header */}
      <div className="mb-4 shrink-0">
        <h1 className="text-xl font-bold text-gray-900">💬 Global Chat</h1>
        <p className="text-sm text-gray-500 mt-0.5">Chat with everyone on Rawaq</p>
      </div>

      {/* Messages container */}
      <div
        ref={containerRef}
        className="card flex-1 overflow-y-auto p-4 space-y-3 min-h-0"
      >
        {/* Load more */}
        {hasMore && (
          <div className="text-center pb-2">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="btn-ghost text-xs text-brand-600"
            >
              {loadingMore ? <Spinner size="sm" /> : 'Load older messages'}
            </button>
          </div>
        )}

        {fetching ? (
          <div className="flex items-center justify-center h-full">
            <Spinner size="lg" />
          </div>
        ) : messages.length === 0 ? (
          <EmptyState icon="💬" title="No messages yet" description="Start the conversation!" />
        ) : (
          messages.map((msg) => {
            const isOwn = msg.author?.id === user.id
            return (
              <div
                key={msg.id}
                className={`flex gap-2.5 items-end ${isOwn ? 'flex-row-reverse' : ''}`}
              >
                {/* Avatar */}
                <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 text-xs font-bold flex items-center justify-center uppercase shrink-0">
                  {msg.author?.display_name?.[0] ?? '?'}
                </div>

                <div className={`flex flex-col gap-0.5 max-w-[72%] ${isOwn ? 'items-end' : 'items-start'}`}>
                  {/* Author + time */}
                  <span className="text-xs text-gray-400 px-1">
                    {isOwn ? 'You' : msg.author?.display_name ?? 'Unknown'}
                    {' · '}
                    {formatRelativeTime(msg.created_at)}
                  </span>

                  {/* Bubble */}
                  <div
                    className={`px-3.5 py-2 rounded-2xl text-sm leading-relaxed break-words ${
                      isOwn
                        ? 'bg-brand-500 text-white rounded-br-sm'
                        : 'bg-white border border-gray-100 text-gray-900 rounded-bl-sm shadow-sm'
                    } ${msg.id.startsWith('temp-') ? 'opacity-60' : ''}`}
                  >
                    {msg.content}
                  </div>
                </div>
              </div>
            )
          })
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={sendMessage} className="flex gap-2 mt-3 shrink-0">
        <input
          type="text"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Type a message…"
          disabled={sending}
          maxLength={1000}
          className="input flex-1"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              sendMessage(e as unknown as FormEvent)
            }
          }}
        />
        <button
          type="submit"
          disabled={!content.trim() || sending}
          className="btn-primary px-4"
        >
          {sending ? <Spinner size="sm" /> : '➤'}
        </button>
      </form>
    </div>
  )
}
