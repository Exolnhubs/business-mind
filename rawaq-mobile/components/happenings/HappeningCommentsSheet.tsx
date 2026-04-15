import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { CommentThread } from '@/components/comments/CommentThread'
import { supabase } from '@/lib/supabase'
import { Colors, FontSize, FontWeight, Radius, Shadow, Spacing } from '@/theme'
import type { CommentWithAuthor, Community, HappeningWithAuthor } from '@/types/database'

type HappeningsCommentTarget = HappeningWithAuthor & {
  community: Pick<Community, 'id' | 'name' | 'name_ar' | 'slug' | 'level'>
}

type Props = {
  visible: boolean
  happening: HappeningsCommentTarget | null
  currentUserId: string | null
  onClose: () => void
}

export function HappeningCommentsSheet({ visible, happening, currentUserId, onClose }: Props) {
  const [loading, setLoading] = useState(false)
  const [comments, setComments] = useState<CommentWithAuthor[]>([])

  useEffect(() => {
    if (!visible || !happening) return
    let active = true
    const currentHappening = happening

    async function loadComments() {
      setLoading(true)
      const { data } = await supabase
        .from('comments')
        .select(`*, author:profiles!user_id(id, display_name, avatar_url, plan_id),
          replies:comments!parent_id(*, author:profiles!user_id(id, display_name, avatar_url, plan_id))
        `)
        .eq('happening_id', currentHappening.id)
        .is('parent_id', null)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(40)

      if (active) {
        setComments((data ?? []) as unknown as CommentWithAuthor[])
        setLoading(false)
      }
    }

    void loadComments()
    return () => {
      active = false
    }
  }, [happening, visible])

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>Happening Chat</Text>
              <Text style={styles.subtitle}>
                Ask questions, answer others, and help people decide whether to join.
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={18} color={Colors.gray[600]} />
            </TouchableOpacity>
          </View>

          {happening ? (
            <View style={styles.contextCard}>
              <Text style={styles.contextCommunity} numberOfLines={1}>
                {happening.community.name_ar || happening.community.name}
              </Text>
              <Text style={styles.contextBody} numberOfLines={3}>
                {happening.body}
              </Text>
            </View>
          ) : null}

          <ScrollView
            style={styles.threadScroll}
            contentContainerStyle={styles.threadContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            showsVerticalScrollIndicator={false}
          >
            {loading || !happening ? (
              <View style={styles.centerState}>
                <ActivityIndicator color={Colors.brand[600]} />
              </View>
            ) : (
              <CommentThread
                target={{ happeningId: happening.id }}
                initialComments={comments}
                currentUserId={currentUserId}
                emptyTitle="No questions yet"
                loginPrompt="Sign in to ask a question"
              />
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  sheet: {
    height: '88%',
    maxHeight: '88%',
    backgroundColor: Colors.white,
    borderTopLeftRadius: Radius.xl + 4,
    borderTopRightRadius: Radius.xl + 4,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing['2xl'],
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.gray[300],
    alignSelf: 'center',
    marginBottom: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.gray[900],
  },
  subtitle: {
    marginTop: Spacing.xs,
    fontSize: FontSize.sm,
    color: Colors.gray[500],
    lineHeight: 20,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.gray[100],
  },
  contextCard: {
    borderRadius: Radius.lg,
    backgroundColor: '#f7fafc',
    borderWidth: 1,
    borderColor: Colors.gray[100],
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadow.card,
  },
  contextCommunity: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.brand[600],
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  contextBody: {
    marginTop: Spacing.xs,
    fontSize: FontSize.sm,
    color: Colors.gray[800],
    lineHeight: 20,
    fontWeight: FontWeight.medium,
  },
  threadScroll: {
    flex: 1,
    minHeight: 260,
  },
  threadContent: {
    flexGrow: 1,
    paddingBottom: Spacing['3xl'],
  },
  centerState: {
    paddingVertical: Spacing['3xl'],
    alignItems: 'center',
    justifyContent: 'center',
  },
})
