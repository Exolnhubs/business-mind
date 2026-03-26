import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Text,
  TouchableOpacity,
  View,
  StyleSheet,
} from 'react-native'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth-context'
import { Colors, FontSize, FontWeight, Radius, Spacing } from '@/theme'

interface GalleryImage {
  name: string
  publicUrl: string
  createdAt: string | null
}

interface Props {
  visible: boolean
  onSelect: (publicUrl: string) => void
  onUploadNew: () => void
  onClose: () => void
}

export function MediaGalleryPicker({ visible, onSelect, onUploadNew, onClose }: Props) {
  const { user } = useAuth()
  const [images, setImages] = useState<GalleryImage[]>([])
  const [loading, setLoading] = useState(false)

  const loadImages = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const { data, error } = await supabase.storage
        .from('comment-media')
        .list(user.id, { limit: 50, sortBy: { column: 'created_at', order: 'desc' } })

      if (error || !data) return

      const imgs: GalleryImage[] = data
        .filter((f) => f.name !== '.emptyFolderPlaceholder')
        .map((f) => {
          const { data: { publicUrl } } = supabase.storage
            .from('comment-media')
            .getPublicUrl(`${user.id}/${f.name}`)
          return { name: f.name, publicUrl, createdAt: f.created_at ?? null }
        })

      setImages(imgs)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (visible) loadImages()
  }, [visible, loadImages])

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeTxt}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.title}>My uploads</Text>
          <TouchableOpacity onPress={() => { onClose(); onUploadNew() }} style={styles.newBtn}>
            <Text style={styles.newTxt}>Upload new</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={Colors.brand[500]} />
          </View>
        ) : images.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyIcon}>🖼️</Text>
            <Text style={styles.emptyText}>No uploads yet</Text>
            <TouchableOpacity onPress={() => { onClose(); onUploadNew() }} style={styles.uploadPromptBtn}>
              <Text style={styles.uploadPromptTxt}>Upload your first image</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={images}
            keyExtractor={(item) => item.name}
            numColumns={3}
            contentContainerStyle={styles.grid}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.thumb}
                onPress={() => { onSelect(item.publicUrl); onClose() }}
                activeOpacity={0.75}
              >
                <Image source={{ uri: item.publicUrl }} style={styles.thumbImg} resizeMode="cover" />
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    </Modal>
  )
}

const THUMB = 112

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.gray[200],
  },
  closeBtn: { padding: Spacing.xs },
  closeTxt: { fontSize: FontSize.lg, color: Colors.gray[500] },
  title: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.gray[900] },
  newBtn: {
    backgroundColor: Colors.brand[500], borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs + 2,
  },
  newTxt: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: FontSize.base, color: Colors.gray[500] },
  uploadPromptBtn: {
    marginTop: Spacing.sm, backgroundColor: Colors.brand[500],
    borderRadius: Radius.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
  },
  uploadPromptTxt: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.white },
  grid: { padding: Spacing.xs },
  thumb: {
    width: THUMB, height: THUMB, margin: Spacing.xs,
    borderRadius: Radius.md, overflow: 'hidden',
    backgroundColor: Colors.gray[100],
  },
  thumbImg: { width: '100%', height: '100%' },
})
