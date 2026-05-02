'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { useLocale } from '@/contexts/locale-context'

interface ChatMessage {
  role: 'user' | 'model'
  parts: [{ text: string }]
}

interface Ticket {
  ticket_number: string
  category: string
}

type BubbleRole = 'user' | 'bot' | 'ticket'

interface Bubble {
  id: string
  role: BubbleRole
  text?: string
  ticket?: Ticket
}

const STORAGE_KEY_MSGS = 'support_chat_messages_web'
const STORAGE_KEY_HIST = 'support_chat_history_web'

const CATEGORY_EMOJI: Record<string, string> = {
  harassment: '🚨',
  refund:     '💰',
  legal:      '⚖️',
  technical:  '🔧',
  general:    '📋',
}

export function SupportChatWidget() {
  const { user } = useAuth()
  const { t, dir } = useLocale()

  const makeWelcome = (): Bubble => ({ id: 'welcome', role: 'bot', text: t('support.welcome') })

  const [open,     setOpen]     = useState(false)
  const [bubbles,  setBubbles]  = useState<Bubble[]>([makeWelcome()])
  const [history,  setHistory]  = useState<ChatMessage[]>([])
  const [input,    setInput]    = useState('')
  const [sending,  setSending]  = useState(false)
  const [hydrated, setHydrated] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLInputElement>(null)

  // ── Hydrate from localStorage ────────────────────────────────────────────────
  useEffect(() => {
    try {
      const msgs = localStorage.getItem(STORAGE_KEY_MSGS)
      const hist = localStorage.getItem(STORAGE_KEY_HIST)
      if (msgs) setBubbles(JSON.parse(msgs))
      if (hist) setHistory(JSON.parse(hist))
    } catch { /* ignore */ }
    setHydrated(true)
  }, [])

  // ── Persist on change ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(STORAGE_KEY_MSGS, JSON.stringify(bubbles))
      localStorage.setItem(STORAGE_KEY_HIST, JSON.stringify(history))
    } catch { /* ignore */ }
  }, [bubbles, history, hydrated])

  // ── Scroll to bottom ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (open) setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
  }, [bubbles, open])

  // ── Focus input when panel opens ─────────────────────────────────────────────
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150)
  }, [open])

  // ── Send message ─────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || sending) return
    setInput('')

    const userBubble: Bubble = { id: Date.now().toString(), role: 'user', text }
    setBubbles((prev) => [...prev, userBubble])
    setSending(true)

    const newHistory: ChatMessage[] = [...history, { role: 'user', parts: [{ text }] }]

    try {
      const res  = await fetch('/api/support/chat', {
        method:      'POST',
        credentials: 'same-origin',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ messages: newHistory }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? t('support.request_failed'))

      const { reply, ticket } = json.data as { reply: string; ticket: Ticket | null }

      const next: Bubble[] = [{ id: (Date.now() + 1).toString(), role: 'bot', text: reply }]
      if (ticket) next.push({ id: (Date.now() + 2).toString(), role: 'ticket', ticket })

      setBubbles((prev) => [...prev, ...next])
      setHistory([...newHistory, { role: 'model', parts: [{ text: reply }] }])
    } catch {
      setBubbles((prev) => [
        ...prev,
        { id: (Date.now() + 1).toString(), role: 'bot', text: t('support.error_reply') },
      ])
    } finally {
      setSending(false)
    }
  }, [input, sending, history, t])

  // ── Clear chat ───────────────────────────────────────────────────────────────
  function clearChat() {
    try {
      localStorage.removeItem(STORAGE_KEY_MSGS)
      localStorage.removeItem(STORAGE_KEY_HIST)
    } catch { /* ignore */ }
    setBubbles([makeWelcome()])
    setHistory([])
    setInput('')
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage() }
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="fixed bottom-6 end-6 z-50 flex flex-col items-end gap-3">

      {/* ── Chat panel ──────────────────────────────────────────────────────── */}
      {open && (
        <div
          dir={dir}
          className="w-[360px] max-h-[560px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden support-chat-panel"
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-brand-500 text-white shrink-0">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-base shrink-0">
              🎧
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-tight">{t('support.title')}</p>
              <p className="text-[11px] text-white/75 leading-tight">
                {user ? t('support.logged_in_ai') : t('support.ai_powered')}
              </p>
            </div>
            <button
              onClick={clearChat}
              aria-label="Clear chat"
              title="Clear chat"
              className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close support chat"
              className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0 bg-gray-50">
            {!hydrated ? (
              <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
                {t('support.loading')}
              </div>
            ) : (
              bubbles.map((bubble) => {
                // Ticket confirmation card
                if (bubble.role === 'ticket' && bubble.ticket) {
                  const { ticket } = bubble
                  return (
                    <div
                      key={bubble.id}
                      className="rounded-xl border border-purple-200 bg-purple-50 p-3 text-center space-y-1.5"
                    >
                      <div className="flex items-center justify-center gap-2">
                        <span className="text-lg">{CATEGORY_EMOJI[ticket.category] ?? '📋'}</span>
                        <span className="text-sm font-semibold text-purple-800">
                          {t('support.ticket_opened')}
                        </span>
                      </div>
                      <p className="text-base font-bold text-purple-700 tracking-widest">
                        {ticket.ticket_number}
                      </p>
                      <p className="text-xs text-gray-500 leading-relaxed">
                        {t('support.ticket_hint')}
                      </p>
                    </div>
                  )
                }

                // User / bot bubble
                const isUser = bubble.role === 'user'
                return (
                  <div
                    key={bubble.id}
                    className={`flex items-end gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
                  >
                    {!isUser && (
                      <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center shrink-0 text-sm mb-0.5">
                        🎧
                      </div>
                    )}
                    <div
                      className={`max-w-[76%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                        isUser
                          ? 'bg-brand-500 text-white rounded-br-sm'
                          : 'bg-white text-gray-900 rounded-bl-sm shadow-sm border border-gray-100'
                      }`}
                    >
                      {bubble.text}
                    </div>
                  </div>
                )
              })
            )}

            {/* Typing indicator */}
            {sending && (
              <div className="flex items-end gap-2">
                <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center shrink-0 text-sm">
                  🎧
                </div>
                <div className="bg-white rounded-2xl rounded-bl-sm px-3 py-2.5 shadow-sm border border-gray-100">
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input row — gated on auth */}
          {!user ? (
            <div className="px-4 py-3 border-t border-gray-100 bg-white text-center shrink-0 space-y-1.5">
              <p className="text-xs text-gray-500">{t('support.sign_in_prompt')}</p>
              <a
                href="/auth/login"
                className="inline-block text-xs font-semibold text-brand-600 hover:underline"
              >
                {t('nav.login')} →
              </a>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2.5 border-t border-gray-100 bg-white shrink-0">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('support.placeholder')}
                disabled={sending}
                className="flex-1 bg-gray-100 rounded-full px-4 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:opacity-50 transition-all"
              />
              <button
                onClick={() => void sendMessage()}
                disabled={!input.trim() || sending}
                aria-label="Send message"
                className="w-9 h-9 rounded-full bg-brand-500 text-white flex items-center justify-center shrink-0 hover:bg-brand-600 disabled:opacity-40 transition-colors active:scale-95"
              >
                {sending ? (
                  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                  </svg>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Floating trigger button ──────────────────────────────────────────── */}
      <div className="relative group">

        {/* Tooltip — visible on hover when closed */}
        {!open && (
          <div className="support-fab-tooltip">
            {t('support.title')}
          </div>
        )}

        {/* Expanding pulse ring — only when closed */}
        {!open && (
          <span
            aria-hidden="true"
            className="support-pulse-ring pointer-events-none absolute inset-0 rounded-full bg-brand-400"
          />
        )}

        <button
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? 'Close support chat' : 'Open support chat'}
          className="support-fab relative z-10 w-14 h-14 rounded-full text-white flex items-center justify-center"
        >
          <span className={`support-fab-icon ${open ? 'support-fab-icon-exit' : ''}`} aria-hidden="true">
            {open ? (
              /* X icon */
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              /* Headphones icon — matches the bot persona */
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3c-4.97 0-9 4.03-9 9v7c0 1.1.9 2 2 2h1c1.1 0 2-.9 2-2v-3c0-1.1-.9-2-2-2H5v-2c0-3.87 3.13-7 7-7s7 3.13 7 7v2h-1c-1.1 0-2 .9-2 2v3c0 1.1.9 2 2 2h1c1.1 0 2-.9 2-2v-7c0-4.97-4.03-9-9-9z" />
              </svg>
            )}
          </span>
        </button>
      </div>
    </div>
  )
}
