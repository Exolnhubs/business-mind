import { useState } from 'react'
import { View, TextInput, TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native'
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/theme'

interface Props {
  onSubmit: (content: string) => Promise<void>
  placeholder?: string
  onCancel?: () => void
  autoFocus?: boolean
}

export function CommentForm({ onSubmit, placeholder = 'Write a comment…', onCancel, autoFocus }: Props) {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    const trimmed = content.trim()
    if (!trimmed) return
    setLoading(true)
    await onSubmit(trimmed)
    setContent('')
    setLoading(false)
  }

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        value={content}
        onChangeText={setContent}
        placeholder={placeholder}
        placeholderTextColor={Colors.gray[400]}
        multiline
        autoFocus={autoFocus}
        maxLength={2000}
      />
      <View style={styles.actions}>
        {onCancel && (
          <TouchableOpacity onPress={onCancel} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={!content.trim() || loading}
          style={[styles.postBtn, (!content.trim() || loading) && styles.postBtnDisabled]}
        >
          {loading ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={styles.postText}>Post</Text>}
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { marginBottom: Spacing.md },
  input: {
    borderWidth: 1, borderColor: Colors.gray[200], borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2,
    fontSize: FontSize.base, color: Colors.gray[900], minHeight: 72, textAlignVertical: 'top',
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm, marginTop: Spacing.sm },
  cancelBtn: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  cancelText: { fontSize: FontSize.sm, color: Colors.gray[500] },
  postBtn: { backgroundColor: Colors.brand[500], borderRadius: Radius.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  postBtnDisabled: { opacity: 0.5 },
  postText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.white },
})
