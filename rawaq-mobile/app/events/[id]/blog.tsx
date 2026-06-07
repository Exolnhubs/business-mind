import { useEffect, useState } from 'react'
import {
  View, Text, ScrollView, StyleSheet, Image, TouchableOpacity, Linking,
} from 'react-native'
import { Stack, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { apiGet } from '@/lib/api'
import { useLocale } from '@/contexts/locale-context'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatDate } from '@/lib/utils'
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/theme'
import type { EventBlogPost, EventBlogMedia } from '@/types/database'

export default function EventBlogScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { t } = useLocale()
  const [posts, setPosts] = useState<EventBlogPost[] | null>(null)

  useEffect(() => {
    let active = true
    // apiGet unwraps one ok() envelope; the list payload is { data: [...] }.
    apiGet<{ data: EventBlogPost[] }>(`/api/events/${id}/blog`)
      .then(({ data }) => { if (active) setPosts(data?.data ?? []) })
    return () => { active = false }
  }, [id])

  return (
    <>
      <Stack.Screen options={{ title: t('blog.title') }} />
      {posts === null ? (
        <View style={styles.center}><Spinner /></View>
      ) : posts.length === 0 ? (
        <View style={styles.center}>
          <EmptyState title={t('blog.empty_title')} description={t('blog.empty_desc')} icon="📝" />
        </View>
      ) : (
        <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.subtitle}>{t('blog.subtitle')}</Text>
          {posts.map((post) => <BlogPostCard key={post.id} post={post} />)}
        </ScrollView>
      )}
    </>
  )
}

function BlogPostCard({ post }: { post: EventBlogPost }) {
  const { locale } = useLocale()
  return (
    <View style={styles.card}>
      <Text style={styles.postTitle}>{post.title}</Text>
      {post.published_at ? <Text style={styles.postDate}>{formatDate(post.published_at, locale)}</Text> : null}
      {post.body ? <Text style={styles.postBody}>{post.body}</Text> : null}
      {post.media.map((media) => <MediaItem key={media.id} media={media} />)}
    </View>
  )
}

function MediaItem({ media }: { media: EventBlogMedia }) {
  if (media.kind === 'image') {
    return (
      <View style={styles.mediaBlock}>
        <Image source={{ uri: media.url }} style={styles.media} resizeMode="cover" />
        {media.caption ? <Text style={styles.caption}>{media.caption}</Text> : null}
      </View>
    )
  }

  if (media.kind === 'video') {
    return (
      <View style={styles.mediaBlock}>
        <TouchableOpacity onPress={() => Linking.openURL(media.url)} activeOpacity={0.85} style={styles.videoWrap}>
          {media.thumbnail_url
            ? <Image source={{ uri: media.thumbnail_url }} style={styles.media} resizeMode="cover" />
            : <View style={[styles.media, styles.videoPlaceholder]} />}
          <View style={styles.playOverlay}><Ionicons name="play" size={26} color="#fff" /></View>
        </TouchableOpacity>
        {media.caption ? <Text style={styles.caption}>{media.caption}</Text> : null}
      </View>
    )
  }

  // link
  return (
    <TouchableOpacity style={styles.linkRow} onPress={() => Linking.openURL(media.url)} activeOpacity={0.85}>
      {media.thumbnail_url
        ? <Image source={{ uri: media.thumbnail_url }} style={styles.linkThumb} resizeMode="cover" />
        : <View style={styles.linkIcon}><Ionicons name="link" size={18} color={Colors.brand[600]} /></View>}
      <View style={{ flex: 1 }}>
        <Text style={styles.linkTitle} numberOfLines={1}>{media.title ?? media.url}</Text>
        <Text style={styles.linkUrl} numberOfLines={1}>{media.url}</Text>
      </View>
      <Ionicons name="open-outline" size={16} color={Colors.brand[600]} />
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray[50] },
  content: { padding: Spacing.md, gap: Spacing.md },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.gray[50], padding: Spacing.xl },
  subtitle: { fontSize: FontSize.sm, color: Colors.gray[500], marginBottom: Spacing.xs },
  card: { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.gray[100], padding: Spacing.lg, gap: Spacing.sm },
  postTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.gray[900] },
  postDate: { fontSize: FontSize.xs, color: Colors.gray[400] },
  postBody: { fontSize: FontSize.sm, color: Colors.gray[700], lineHeight: 21 },
  mediaBlock: { gap: 4, marginTop: Spacing.xs },
  media: { width: '100%', aspectRatio: 16 / 9, borderRadius: Radius.md, backgroundColor: Colors.gray[100] },
  videoWrap: { position: 'relative', justifyContent: 'center', alignItems: 'center' },
  videoPlaceholder: { backgroundColor: '#000' },
  playOverlay: { position: 'absolute', width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' },
  caption: { fontSize: FontSize.xs, color: Colors.gray[500] },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.sm, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.gray[100], marginTop: Spacing.xs },
  linkThumb: { width: 48, height: 48, borderRadius: Radius.sm, backgroundColor: Colors.gray[100] },
  linkIcon: { width: 48, height: 48, borderRadius: Radius.sm, backgroundColor: Colors.brand[50], justifyContent: 'center', alignItems: 'center' },
  linkTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.gray[900] },
  linkUrl: { fontSize: FontSize.xs, color: Colors.gray[400] },
})
