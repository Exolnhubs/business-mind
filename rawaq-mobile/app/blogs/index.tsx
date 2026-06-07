import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, FlatList, StyleSheet, Image, TouchableOpacity, RefreshControl,
} from 'react-native'
import { Stack, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { apiGet } from '@/lib/api'
import { useLocale } from '@/contexts/locale-context'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/theme'
import type { BlogCard } from '@/types/database'

export default function BlogsScreen() {
  const { t, locale } = useLocale()
  const router = useRouter()
  const [cards, setCards] = useState<BlogCard[] | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (force = false) => {
    // apiGet unwraps one ok() envelope; the list payload is { data: [...], total }.
    const { data } = await apiGet<{ data: BlogCard[]; total: number }>('/api/blogs', { force })
    setCards(data?.data ?? [])
    setRefreshing(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const renderItem = useCallback(({ item }: { item: BlogCard }) => {
    const title = locale === 'ar' && item.title_ar ? item.title_ar : item.title
    const orgName = locale === 'ar' && item.organizer_name_ar ? item.organizer_name_ar : item.organizer_name
    const meta = [orgName, item.city].filter(Boolean).join(' · ')
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => router.push(`/events/${item.event_id}/blog` as any)}
      >
        <View style={styles.coverWrap}>
          {item.cover_image_url
            ? <Image source={{ uri: item.cover_image_url }} style={styles.cover} resizeMode="cover" />
            : <View style={[styles.cover, styles.coverPlaceholder]}><Text style={styles.coverEmoji}>📝</Text></View>}
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{t('blogs.posts_count').replace('{n}', String(item.blog_posts_count))}</Text>
          </View>
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle} numberOfLines={2}>{title}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaText} numberOfLines={1}>{meta}</Text>
            {item.organizer_rating != null && (
              <View style={styles.ratingPill}>
                <Ionicons name="star" size={11} color="#d97706" />
                <Text style={styles.ratingText}>{item.organizer_rating.toFixed(1)}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    )
  }, [locale, router, t])

  return (
    <>
      <Stack.Screen options={{ title: t('blogs.title') }} />
      {cards === null ? (
        <View style={styles.center}><Spinner /></View>
      ) : (
        <FlatList
          data={cards}
          keyExtractor={(c) => c.event_id}
          renderItem={renderItem}
          contentContainerStyle={cards.length === 0 ? styles.emptyContainer : styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); void load(true) }}
              tintColor={Colors.brand[500]}
            />
          }
          ListHeaderComponent={cards.length > 0 ? <Text style={styles.subtitle}>{t('blogs.subtitle')}</Text> : null}
          ListEmptyComponent={<EmptyState title={t('blogs.empty_title')} description={t('blogs.empty_desc')} icon="📝" />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.gray[50] },
  listContent: { padding: Spacing.md, gap: Spacing.md, backgroundColor: Colors.gray[50] },
  emptyContainer: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl, backgroundColor: Colors.gray[50] },
  subtitle: { fontSize: FontSize.sm, color: Colors.gray[500], marginBottom: Spacing.xs },
  card: { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.gray[100], overflow: 'hidden' },
  coverWrap: { position: 'relative' },
  cover: { width: '100%', aspectRatio: 16 / 9, backgroundColor: Colors.gray[100] },
  coverPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  coverEmoji: { fontSize: 30 },
  countBadge: { position: 'absolute', top: Spacing.sm, right: Spacing.sm, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 2 },
  countBadgeText: { color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
  cardBody: { padding: Spacing.md, gap: Spacing.xs },
  cardTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.gray[900] },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  metaText: { flex: 1, fontSize: FontSize.xs, color: Colors.gray[500] },
  ratingPill: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  ratingText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: '#d97706' },
})
