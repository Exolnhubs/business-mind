import { useEffect, useRef, useState } from 'react'
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth-context'
import { useLocale } from '@/contexts/locale-context'
import { formatRelativeTime } from '@/lib/utils'
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/theme'
import type { GlobalChat, Profile } from '@/types/database'

interface ChatMessage extends GlobalChat {
  author: Pick<Profile, 'id' | 'display_name' | 'avatar_url'> | null
}

type ChatAuthor = Pick<Profile, 'id' | 'display_name' | 'avatar_url'>

async function attachAuthors(rows: GlobalChat[]): Promise<ChatMessage[]> {
  const authorIds = [...new Set(rows.map((row) => row.user_id))]
  if (authorIds.length === 0) {
    return rows.map((row) => ({ ...row, author: null }))
  }

  const { data: authors } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .in('id', authorIds)

  const authorById = new Map<string, ChatAuthor>(
    (authors ?? []).map((author) => [author.id, author]),
  )

  return rows.map((row) => ({
    ...row,
    author: authorById.get(row.user_id) ?? null,
  }))
}

export default function ChatScreen() {
  const { user, profile } = useAuth()
  const { t } = useLocale()
  const listRef = useRef<FlatList>(null)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading]   = useState(true)
  const [text, setText]         = useState('')
  const [sending, setSending]   = useState(false)

  useEffect(() => {
    async function loadMessages() {
      const { data } = await supabase
        .from('global_chat')
        .select('*')
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(50)

      const hydrated = await attachAuthors((data ?? []) as GlobalChat[])
      setMessages(hydrated.reverse())
      setLoading(false)
    }

    void loadMessages()

    // Realtime subscription
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

          const msg: ChatMessage = {
            ...(payload.new as ChatMessage),
            author: author ?? null,
          }

          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev
            return [...prev, msg]
          })

          // Scroll to bottom
          setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100)
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  async function send() {
    if (!text.trim() || !user || sending) return
    setSending(true)
    const content = text.trim()
    setText('')

    const { data } = await supabase
      .from('global_chat')
      .insert({ user_id: user.id, content, mentions: [], is_deleted: false })
      .select()
      .single()

    if (data) {
      const msg: ChatMessage = {
        ...data,
        author: { id: user.id, display_name: profile?.display_name ?? 'You', avatar_url: null },
      }
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev
        return [...prev, msg]
      })
    }
    setSending(false)
  }

  const isMe = (msg: ChatMessage) => msg.user_id === user?.id

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.brand[500]} />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => {
            const mine = isMe(item)
            return (
              <View style={[styles.msgRow, mine && styles.msgRowMe]}>
                {!mine && (
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {(item.author?.display_name ?? '?')[0].toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={[styles.bubble, mine && styles.bubbleMe]}>
                  {!mine && (
                    <Text style={styles.senderName}>{item.author?.display_name ?? 'Unknown'}</Text>
                  )}
                  <Text style={[styles.msgText, mine && styles.msgTextMe]}>{item.content}</Text>
                  <Text style={[styles.msgTime, mine && styles.msgTimeMe]}>
                    {formatRelativeTime(item.created_at)}
                  </Text>
                </View>
              </View>
            )
          }}
        />
      )}

      {/* Input bar */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={t('chat.placeholder')}
          placeholderTextColor={Colors.gray[400]}
          multiline
          maxLength={500}
          editable={!!user}
        />
        <TouchableOpacity
          onPress={send}
          disabled={!text.trim() || sending || !user}
          style={[styles.sendBtn, (!text.trim() || !user) && styles.sendBtnDisabled]}
        >
          {sending
            ? <ActivityIndicator size="small" color={Colors.white} />
            : <Text style={styles.sendText}>↑</Text>
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray[50] },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: Spacing.md, paddingBottom: Spacing.sm },
  msgRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md, alignItems: 'flex-end' },
  msgRowMe: { justifyContent: 'flex-end' },
  avatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.brand[100], justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  avatarText: { fontSize: 12, fontWeight: FontWeight.bold, color: Colors.brand[700] },
  bubble: { maxWidth: '75%', backgroundColor: Colors.white, borderRadius: Radius.lg, borderBottomLeftRadius: 4, padding: Spacing.md, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 },
  bubbleMe: { backgroundColor: Colors.brand[500], borderBottomLeftRadius: Radius.lg, borderBottomRightRadius: 4 },
  senderName: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.brand[600], marginBottom: 3 },
  msgText: { fontSize: FontSize.base, color: Colors.gray[900], lineHeight: 20 },
  msgTextMe: { color: Colors.white },
  msgTime: { fontSize: FontSize.xs, color: Colors.gray[400], marginTop: 4, textAlign: 'right' },
  msgTimeMe: { color: 'rgba(255,255,255,0.7)' },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm, padding: Spacing.md, backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.gray[100] },
  input: { flex: 1, borderWidth: 1, borderColor: Colors.gray[200], borderRadius: Radius.xl, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm + 2, fontSize: FontSize.base, color: Colors.gray[900], maxHeight: 100 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.brand[500], justifyContent: 'center', alignItems: 'center' },
  sendBtnDisabled: { backgroundColor: Colors.gray[300] },
  sendText: { color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold },
})
