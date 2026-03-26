import { useState } from 'react'
import { View, TextInput, TouchableOpacity, Text, StyleSheet, ActivityIndicator, Image, Alert, ActionSheetIOS, Platform } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { uploadViaApi } from '@/lib/upload'
import { MediaGalleryPicker } from '@/components/ui/MediaGalleryPicker'
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/theme'

interface Props {
  onSubmit: (content: string, mediaUrl?: string) => Promise<void>
  placeholder?: string
  onCancel?: () => void
  autoFocus?: boolean
}

export function CommentForm({ onSubmit, placeholder = 'Write a comment…', onCancel, autoFocus }: Props) {
  const [content, setContent] = useState('')
  const [mediaUri, setMediaUri] = useState<string | null>(null)
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [galleryOpen, setGalleryOpen] = useState(false)

  const canSubmit = !!content.trim() || !!mediaUrl

  async function uploadFromDevice() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.85,
      videoMaxDuration: 60,
    })
    if (result.canceled || !result.assets[0]) return

    setUploading(true)
    try {
      const url = await uploadViaApi(result.assets[0].uri, 'comment-media')
      setMediaUri(result.assets[0].uri)
      setMediaUrl(url)
    } catch (e: unknown) {
      Alert.alert('Upload failed', e instanceof Error ? e.message : 'Please try again.')
    } finally {
      setUploading(false)
    }
  }

  function handleAttach() {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Choose from my uploads', 'Upload new image'], cancelButtonIndex: 0 },
        (idx) => {
          if (idx === 1) setGalleryOpen(true)
          if (idx === 2) uploadFromDevice()
        },
      )
    } else {
      // Android: use Alert as a simple menu
      Alert.alert('Add image', undefined, [
        { text: 'Choose from my uploads', onPress: () => setGalleryOpen(true) },
        { text: 'Upload new image', onPress: uploadFromDevice },
        { text: 'Cancel', style: 'cancel' },
      ])
    }
  }

  function selectFromGallery(url: string) {
    setMediaUri(url)   // use public URL as preview too — already stored
    setMediaUrl(url)
  }

  function removeMedia() {
    setMediaUri(null)
    setMediaUrl(null)
  }

  async function handleSubmit() {
    if (!canSubmit) return
    setLoading(true)
    await onSubmit(content.trim(), mediaUrl ?? undefined)
    setContent('')
    setMediaUri(null)
    setMediaUrl(null)
    setLoading(false)
  }

  return (
    <View style={styles.container}>
      <MediaGalleryPicker
        visible={galleryOpen}
        onSelect={selectFromGallery}
        onUploadNew={uploadFromDevice}
        onClose={() => setGalleryOpen(false)}
      />

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

      {mediaUri && (
        <View style={styles.previewWrap}>
          <Image source={{ uri: mediaUri }} style={styles.preview} resizeMode="cover" />
          <TouchableOpacity onPress={removeMedia} style={styles.removeBtn}>
            <Text style={styles.removeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.actions}>
        <TouchableOpacity onPress={handleAttach} disabled={uploading} style={styles.attachBtn}>
          {uploading
            ? <ActivityIndicator size="small" color={Colors.brand[500]} />
            : <Text style={styles.attachText}>📎</Text>
          }
        </TouchableOpacity>

        <View style={styles.rightActions}>
          {onCancel && (
            <TouchableOpacity onPress={onCancel} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={!canSubmit || loading || uploading}
            style={[styles.postBtn, (!canSubmit || loading || uploading) && styles.postBtnDisabled]}
          >
            {loading ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={styles.postText}>Post</Text>}
          </TouchableOpacity>
        </View>
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
  previewWrap: { position: 'relative', marginTop: Spacing.sm, borderRadius: Radius.md, overflow: 'hidden', alignSelf: 'flex-start' },
  preview: { width: 120, height: 90, borderRadius: Radius.md },
  removeBtn: { position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  removeBtnText: { color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.sm },
  attachBtn: { paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs },
  attachText: { fontSize: 20 },
  rightActions: { flexDirection: 'row', gap: Spacing.sm },
  cancelBtn: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  cancelText: { fontSize: FontSize.sm, color: Colors.gray[500] },
  postBtn: { backgroundColor: Colors.brand[500], borderRadius: Radius.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  postBtnDisabled: { opacity: 0.5 },
  postText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.white },
})
