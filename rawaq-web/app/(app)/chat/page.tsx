'use client'

import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/auth-context'
import { useLocale } from '@/contexts/locale-context'
import { clientPostJson } from '@/lib/client-fetch'
import { formatRelativeTime } from '@/lib/utils'
import { Spinner } from '@/components/ui/Spinner'

interface ChatMessage {
  id: string
  content: string
  created_at: string
  mentions: string[]
  author: { id: string; display_name: string; avatar_url: string | null } | null
  isNew?: boolean
  isInitialBatch?: boolean
  batchIndex?: number
}

const PAGE_SIZE = 50

export default function ChatPage() {
  const { user, profile, loading: authLoading } = useAuth()
  const router = useRouter()
  const { t } = useLocale()
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
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login')
  }, [authLoading, user, router])

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
      const ordered = [...data].reverse()
      setMessages(
        ordered.map((m, i) => ({ ...m, isInitialBatch: true, batchIndex: i }))
      )
      setHasMore(data.length === PAGE_SIZE)
      if (data.length > 0) oldestCursorRef.current = data[data.length - 1].created_at
    }
    setFetching(false)
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
            author: author ?? { id: payload.new.user_id, display_name: t('chat.unknown'), avatar_url: null },
            isNew: true,
          }

          startTransition(() => {
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev
              return [...prev, newMsg]
            })
          })

          const el = containerRef.current
          if (el) {
            const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120
            if (nearBottom) setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 30)
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

    const tempId = `temp-${Date.now()}`
    const optimistic: ChatMessage = {
      id: tempId,
      content: text,
      created_at: new Date().toISOString(),
      mentions: [],
      author: { id: user.id, display_name: profile?.display_name ?? t('chat.you'), avatar_url: profile?.avatar_url ?? null },
      isNew: true,
    }
    setMessages((prev) => [...prev, optimistic])
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 30)

    try {
      const { data: real } = await clientPostJson<{ data: ChatMessage }>('/api/chat', { content: text, mentions: [] })
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...real, isNew: false } : m)))
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId))
      setContent(text)
    }

    setSending(false)
    inputRef.current?.focus()
  }

  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div className="chat-page-wrap">
      <div className="chat-panel">

        {/* ── Header ──────────────────────────────── */}
        <div className="chat-header">
          <div className="chat-header-pattern" aria-hidden="true" />
          <div className="chat-header-content">
            <div>
              <h1 className="chat-title">{t('chat.title')}</h1>
              <p className="chat-subtitle">{t('chat.subtitle')}</p>
            </div>
            <div className="chat-live-badge" aria-label="Live chat active">
              <span className="chat-live-dot" aria-hidden="true" />
              {t('chat.live')}
            </div>
          </div>
        </div>

        {/* ── Messages ────────────────────────────── */}
        <div ref={containerRef} className="chat-messages-wrap">

          {hasMore && (
            <div className="chat-load-more-wrap">
              <button onClick={loadMore} disabled={loadingMore} className="chat-load-more-btn">
                {loadingMore ? (
                  <Spinner size="sm" />
                ) : (
                  <>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                      <path d="M6 10V2M6 2L2.5 5.5M6 2L9.5 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    {t('chat.load_older')}
                  </>
                )}
              </button>
            </div>
          )}

          {fetching ? (
            <div className="chat-state-center">
              <Spinner size="lg" />
              <span className="chat-state-label">{t('chat.loading')}</span>
            </div>
          ) : messages.length === 0 ? (
            <div className="chat-state-center">
              <div className="chat-empty-icon" aria-hidden="true">
                <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                  <rect x="4" y="6" width="32" height="22" rx="6" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.4"/>
                  <path d="M12 28L8 34" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/>
                  <circle cx="14" cy="17" r="2" fill="currentColor" opacity="0.5"/>
                  <circle cx="20" cy="17" r="2" fill="currentColor" opacity="0.5"/>
                  <circle cx="26" cy="17" r="2" fill="currentColor" opacity="0.5"/>
                </svg>
              </div>
              <p className="chat-empty-title">{t('chat.empty_title')}</p>
              <p className="chat-empty-body">{t('chat.empty_desc')}</p>
            </div>
          ) : (
            messages.map((msg) => {
              const isOwn = msg.author?.id === user.id
              const isPending = msg.id.startsWith('temp-')

              let animClass = ''
              if (msg.isNew) animClass = ' chat-msg--new'
              else if (msg.isInitialBatch) animClass = ' chat-msg--initial'

              return (
                <div
                  key={msg.id}
                  className={`chat-msg-row${isOwn ? ' chat-msg-row--own' : ''}${animClass}`}
                  style={msg.isInitialBatch
                    ? { animationDelay: `${Math.min((msg.batchIndex ?? 0) * 30, 360)}ms` }
                    : undefined
                  }
                >
                  {/* Avatar */}
                  <div
                    className={`chat-avatar${isOwn ? ' chat-avatar--own' : ''}`}
                    aria-hidden="true"
                    title={isOwn ? t('chat.you') : (msg.author?.display_name ?? t('chat.unknown'))}
                  >
                    {msg.author?.avatar_url ? (
                      <Image src={msg.author.avatar_url} alt="" fill sizes="40px" className="chat-avatar-img" />
                    ) : (
                      (msg.author?.display_name?.[0] ?? '?').toUpperCase()
                    )}
                  </div>

                  {/* Bubble + meta */}
                  <div className={`chat-msg-body${isOwn ? ' chat-msg-body--own' : ''}`}>
                    <span className={`chat-msg-meta${isOwn ? ' chat-msg-meta--own' : ''}`}>
                      {isOwn ? t('chat.you') : (msg.author?.display_name ?? t('chat.unknown'))}
                      <span className="chat-msg-time">· {formatRelativeTime(msg.created_at)}</span>
                    </span>
                    <div
                      className={`chat-bubble${isOwn ? ' chat-bubble--own' : ' chat-bubble--other'}${isPending ? ' chat-bubble--pending' : ''}`}
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

        {/* ── Input ───────────────────────────────── */}
        <form onSubmit={sendMessage} className="chat-input-wrap">
          <div className="chat-input-row">
            <input
              ref={inputRef}
              type="text"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t('chat.placeholder')}
              disabled={sending}
              maxLength={1000}
              className="chat-input"
              autoComplete="off"
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
              className="chat-send-btn"
              aria-label="Send message"
            >
              {sending ? (
                <Spinner size="sm" />
              ) : (
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <path
                    d="M15.5 2.5L8 10M15.5 2.5L10.5 15.5L8 10M15.5 2.5L2.5 7L8 10"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          </div>
          <p className="chat-input-hint">
            {t('chat.enter_to_send')}
            {content.length > 0 && (
              <span className="chat-char-count"> · {content.length}/1000</span>
            )}
          </p>
        </form>

      </div>
    </div>
  )
}
