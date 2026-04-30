import { useState, useRef, useEffect, useCallback } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth-context'
import { useLocale } from '@/contexts/locale-context'
import { ScreenLoader } from '@/components/ui/ScreenLoader'
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/theme'

const API_URL           = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000'
const STORAGE_KEY_MSGS  = 'support_chat_messages'
const STORAGE_KEY_HIST  = 'support_chat_history'

// ── Types ──────────────────────────────────────────────────────────────────────

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
  id:     string
  role:   BubbleRole
  text?:  string
  ticket?: Ticket
}

// ── Welcome message ────────────────────────────────────────────────────────────

// ── Component ──────────────────────────────────────────────────────────────────

export default function SupportScreen() {
  const router  = useRouter()
  const insets  = useSafeAreaInsets()
  const { user } = useAuth()
  const { t } = useLocale()
  const welcome: Bubble = { id: 'welcome', role: 'bot', text: t('support.welcome') }

  const [bubbles,  setBubbles]  = useState<Bubble[]>([welcome])
  const [history,  setHistory]  = useState<ChatMessage[]>([])
  const [input,    setInput]    = useState('')
  const [sending,  setSending]  = useState(false)
  const [hydrated, setHydrated] = useState(false)

  const listRef = useRef<FlatList>(null)

  // ── Load persisted chat ────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      try {
        const [savedBubbles, savedHistory] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY_MSGS),
          AsyncStorage.getItem(STORAGE_KEY_HIST),
        ])
        if (savedBubbles) setBubbles(JSON.parse(savedBubbles))
        if (savedHistory) setHistory(JSON.parse(savedHistory))
      } catch {}
      setHydrated(true)
    }
    init()
  }, [])

  // ── Persist on change ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!hydrated) return
    AsyncStorage.setItem(STORAGE_KEY_MSGS, JSON.stringify(bubbles)).catch(() => {})
    AsyncStorage.setItem(STORAGE_KEY_HIST, JSON.stringify(history)).catch(() => {})
  }, [bubbles, history, hydrated])

  // ── Auto-scroll ────────────────────────────────────────────────────────────
  useEffect(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 120)
  }, [bubbles])

  // ── Send message ───────────────────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || sending) return
    setInput('')

    const userBubble: Bubble = { id: Date.now().toString(), role: 'user', text }
    setBubbles((prev) => [...prev, userBubble])
    setSending(true)

    const newHistory: ChatMessage[] = [
      ...history,
      { role: 'user', parts: [{ text }] },
    ]

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`

      const res  = await fetch(`${API_URL}/api/support/chat`, {
        method: 'POST',
        headers,
        body:   JSON.stringify({ messages: newHistory }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? t('support.request_failed'))

      const { reply, ticket } = json.data as { reply: string; ticket: Ticket | null }

      const nextBubbles: Bubble[] = [
        { id: (Date.now() + 1).toString(), role: 'bot', text: reply },
      ]

      if (ticket) {
        nextBubbles.push({
          id:     (Date.now() + 2).toString(),
          role:   'ticket',
          ticket,
        })
      }

      setBubbles((prev) => [...prev, ...nextBubbles])
      setHistory([
        ...newHistory,
        { role: 'model', parts: [{ text: reply }] },
      ])
    } catch {
      setBubbles((prev) => [
        ...prev,
        { id: (Date.now() + 1).toString(), role: 'bot', text: t('support.error_reply') },
      ])
    } finally {
      setSending(false)
    }
  }, [input, sending, history, t])

  // ── Clear chat ─────────────────────────────────────────────────────────────
  async function clearChat() {
    await Promise.all([
      AsyncStorage.removeItem(STORAGE_KEY_MSGS),
      AsyncStorage.removeItem(STORAGE_KEY_HIST),
    ])
    setBubbles([welcome])
    setHistory([])
    setInput('')
  }

  // ── Render bubble ──────────────────────────────────────────────────────────
  function renderItem({ item }: { item: Bubble }) {
    if (item.role === 'ticket' && item.ticket) {
      const { ticket } = item
      const CATEGORY_EMOJI: Record<string, string> = {
        harassment: '🚨',
        refund:     '💰',
        legal:      '⚖️',
        technical:  '🔧',
        general:    '📋',
      }
      return (
        <View style={styles.ticketCard}>
          <View style={styles.ticketCardHeader}>
            <Text style={styles.ticketCardIcon}>{CATEGORY_EMOJI[ticket.category] ?? '📋'}</Text>
            <Text style={styles.ticketCardTitle}>{t('support.ticket_opened')}</Text>
          </View>
          <Text style={styles.ticketNumber}>{ticket.ticket_number}</Text>
          <Text style={styles.ticketHint}>
            {t('support.ticket_hint')}
          </Text>
        </View>
      )
    }

    const isUser = item.role === 'user'
    return (
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleBot]}>
        {!isUser && (
          <View style={styles.botAvatar}>
            <Text style={{ fontSize: 14 }}>🎧</Text>
          </View>
        )}
        <View style={[styles.bubbleInner, isUser ? styles.bubbleInnerUser : styles.bubbleInnerBot]}>
          <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>
            {item.text}
          </Text>
        </View>
      </View>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.bottom + 8 : 0}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={22} color={Colors.gray[900]} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{t('support.title')}</Text>
          <Text style={styles.headerSub}>
            {user ? t('support.logged_in_ai') : t('support.ai_powered')}
          </Text>
        </View>
        <TouchableOpacity onPress={clearChat} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="refresh" size={20} color={Colors.gray[400]} />
        </TouchableOpacity>
      </View>

      {/* Message list */}
      {!hydrated
        ? <ScreenLoader fullScreen label={t('support.loading')} />
        : (
          <FlatList
            ref={listRef}
            data={bubbles}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />
        )
      }

      {/* Input */}
      <View style={[styles.inputRow, { paddingBottom: insets.bottom + Spacing.sm }]}>
        <TextInput
          style={styles.input}
          placeholder={t('support.placeholder')}
          placeholderTextColor={Colors.gray[400]}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={sendMessage}
          returnKeyType="send"
          editable={!sending}
          multiline={false}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || sending) && styles.sendBtnDisabled]}
          onPress={sendMessage}
          disabled={!input.trim() || sending}
        >
          {sending
            ? <ActivityIndicator size="small" color={Colors.white} />
            : <Ionicons name="send" size={18} color={Colors.white} />
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:          { flex: 1, backgroundColor: Colors.gray[50] },
  loadingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle:  { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.gray[900] },
  headerSub:    { fontSize: FontSize.xs, color: Colors.gray[400], marginTop: 1 },

  list: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['2xl'] },

  bubble:     { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm },
  bubbleUser: { justifyContent: 'flex-end' },
  bubbleBot:  { justifyContent: 'flex-start' },

  botAvatar: {
    width: 30, height: 30, borderRadius: Radius.full,
    backgroundColor: '#fef3c7',
    justifyContent: 'center', alignItems: 'center', marginBottom: 2,
  },

  bubbleInner:     { maxWidth: '78%', borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  bubbleInnerUser: { backgroundColor: Colors.brand[500], borderBottomRightRadius: 4 },
  bubbleInnerBot:  { backgroundColor: Colors.white, borderBottomLeftRadius: 4, ...Shadow.card },

  bubbleText:     { fontSize: FontSize.base, color: Colors.gray[900], lineHeight: 22 },
  bubbleTextUser: { color: Colors.white },

  // Ticket confirmation card
  ticketCard: {
    backgroundColor: '#fdf4ff',
    borderWidth: 1,
    borderColor: '#e9d5ff',
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginHorizontal: Spacing.sm,
    gap: Spacing.sm,
    ...Shadow.card,
  },
  ticketCardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  ticketCardIcon:   { fontSize: 20 },
  ticketCardTitle:  { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: '#6b21a8' },
  ticketNumber:     { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: '#7c3aed', textAlign: 'center', letterSpacing: 1 },
  ticketHint:       { fontSize: FontSize.xs, color: Colors.gray[500], textAlign: 'center', lineHeight: 18 },

  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingTop: Spacing.sm,
    backgroundColor: Colors.white,
    borderTopWidth: 1, borderTopColor: Colors.gray[100],
  },
  input: {
    flex: 1, backgroundColor: Colors.gray[100], borderRadius: Radius.full,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2,
    fontSize: FontSize.base, color: Colors.gray[900],
  },
  sendBtn:         { width: 40, height: 40, borderRadius: Radius.full, backgroundColor: Colors.brand[500], justifyContent: 'center', alignItems: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
})
