import { useState, useRef, useEffect, useCallback } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
  ScrollView,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth-context'
import { EventCard } from '@/components/events/EventCard'
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/theme'
import type { EventWithOrganizer } from '@/types/database'

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000'

interface ChatMessage {
  role: 'user' | 'model'
  parts: [{ text: string }]
}

interface BotMessage {
  id: string
  role: 'user' | 'bot' | 'events'
  text?: string
  events?: EventWithOrganizer[]
}

const WELCOME: BotMessage = {
  id: 'welcome',
  role: 'bot',
  text: "Hey! 👋 I'm your smart event guide. Tell me a bit about yourself and I'll find events you'll love!\n\nLet's start — which city are you in? 🌍",
}

export default function DiscoverScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const [messages, setMessages] = useState<BotMessage[]>([WELCOME])
  const [history, setHistory] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)
  const listRef = useRef<FlatList>(null)

  // Scroll to bottom whenever messages change
  useEffect(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100)
  }, [messages])

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || sending) return
    setInput('')

    const userMsg: BotMessage = { id: Date.now().toString(), role: 'user', text }
    setMessages((prev) => [...prev, userMsg])
    setSending(true)

    const newHistory: ChatMessage[] = [
      ...history,
      { role: 'user', parts: [{ text }] },
    ]

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }

      const res = await fetch(`${API_URL}/api/recommendations/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ messages: newHistory }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Request failed')

      const { reply, events, done: isDone } = json.data as {
        reply: string
        events: EventWithOrganizer[]
        done: boolean
      }

      const botMsg: BotMessage = { id: (Date.now() + 1).toString(), role: 'bot', text: reply }
      setMessages((prev) => [...prev, botMsg])

      // Append model reply to history
      setHistory([
        ...newHistory,
        { role: 'model', parts: [{ text: reply }] },
      ])

      if (isDone && events.length > 0) {
        setMessages((prev) => [
          ...prev,
          { id: (Date.now() + 2).toString(), role: 'events', events },
        ])
        setDone(true)
      } else if (isDone && events.length === 0) {
        setMessages((prev) => [
          ...prev,
          { id: (Date.now() + 2).toString(), role: 'bot', text: "Hmm, I couldn't find any matching events right now. Try adjusting your preferences or check back soon! 🙁" },
        ])
        setDone(true)
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: (Date.now() + 1).toString(), role: 'bot', text: "Sorry, something went wrong. Please try again. 😔" },
      ])
    } finally {
      setSending(false)
    }
  }, [input, sending, history])

  function restart() {
    setMessages([WELCOME])
    setHistory([])
    setDone(false)
    setInput('')
  }

  function renderItem({ item }: { item: BotMessage }) {
    if (item.role === 'events') {
      return (
        <View style={styles.eventsBlock}>
          <Text style={styles.eventsLabel}>✨ Here are your picks!</Text>
          {(item.events ?? []).map((event) => (
            <EventCard key={event.id} event={event} isSaved={false} />
          ))}
        </View>
      )
    }

    const isUser = item.role === 'user'
    return (
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleBot]}>
        {!isUser && (
          <View style={styles.botAvatar}>
            <Text style={{ fontSize: 14 }}>✨</Text>
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
          <Text style={styles.headerTitle}>Smart Picks</Text>
          <Text style={styles.headerSub}>Powered by AI ✨</Text>
        </View>
        {done && (
          <TouchableOpacity onPress={restart} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="refresh" size={20} color={Colors.brand[500]} />
          </TouchableOpacity>
        )}
        {!done && <View style={{ width: 22 }} />}
      </View>

      {/* Message list */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />

      {/* Input */}
      {!done && (
        <View style={[styles.inputRow, { paddingBottom: insets.bottom + Spacing.sm }]}>
          <TextInput
            style={styles.input}
            placeholder="Type your reply…"
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
      )}

      {done && (
        <View style={[styles.doneBar, { paddingBottom: insets.bottom + Spacing.sm }]}>
          <TouchableOpacity style={styles.restartBtn} onPress={restart}>
            <Ionicons name="refresh" size={16} color={Colors.brand[600]} />
            <Text style={styles.restartBtnText}>Start over</Text>
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.gray[50] },

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
  headerTitle: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.gray[900] },
  headerSub:   { fontSize: FontSize.xs, color: Colors.gray[400], marginTop: 1 },

  list: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['2xl'] },

  bubble: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm },
  bubbleUser: { justifyContent: 'flex-end' },
  bubbleBot:  { justifyContent: 'flex-start' },

  botAvatar: {
    width: 30,
    height: 30,
    borderRadius: Radius.full,
    backgroundColor: Colors.brand[100],
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },

  bubbleInner: {
    maxWidth: '78%',
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  bubbleInnerUser: {
    backgroundColor: Colors.brand[500],
    borderBottomRightRadius: 4,
  },
  bubbleInnerBot: {
    backgroundColor: Colors.white,
    borderBottomLeftRadius: 4,
    ...Shadow.card,
  },
  bubbleText: { fontSize: FontSize.base, color: Colors.gray[900], lineHeight: 22 },
  bubbleTextUser: { color: Colors.white },

  eventsBlock: { gap: Spacing.md },
  eventsLabel: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    color: Colors.gray[800],
    textAlign: 'center',
    paddingVertical: Spacing.sm,
  },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[100],
  },
  input: {
    flex: 1,
    backgroundColor: Colors.gray[100],
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    fontSize: FontSize.base,
    color: Colors.gray[900],
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: Colors.brand[500],
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },

  doneBar: {
    alignItems: 'center',
    paddingTop: Spacing.md,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[100],
  },
  restartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.brand[300],
  },
  restartBtnText: { fontSize: FontSize.sm, color: Colors.brand[600], fontWeight: FontWeight.medium },
})
