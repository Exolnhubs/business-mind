import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native'
import { useRouter } from 'expo-router'
import { Badge } from '@/components/ui/Badge'
import { formatDate, formatCurrency } from '@/lib/utils'
import { useLocale } from '@/contexts/locale-context'
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/theme'
import type { EventWithOrganizer } from '@/types/database'

const CATEGORY_EMOJI: Record<string, string> = {
  sports: '⚽', art: '🎨', music: '🎵', tech: '💻', food: '🍽️',
  community: '🤝', education: '📚', health: '💪', business: '💼', entertainment: '🎭',
}

export function EventCard({ event }: { event: EventWithOrganizer }) {
  const router = useRouter()
  const { locale } = useLocale()

  const icon = CATEGORY_EMOJI[event.category?.name_en?.toLowerCase() ?? ''] ?? '📅'
  const spotsLeft = event.capacity ? event.capacity - event.bookings_count : null
  const isFull = spotsLeft !== null && spotsLeft <= 0
  const title = locale === 'ar' && event.title_ar ? event.title_ar : event.title

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.8}
      onPress={() => router.push(`/events/${event.id}`)}
    >
      {/* Cover */}
      <View style={styles.cover}>
        {event.cover_image_url
          ? <Image source={{ uri: event.cover_image_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          : <Text style={styles.coverEmoji}>{icon}</Text>
        }
        <View style={styles.badges}>
          {event.is_free && <Badge label="Free" variant="green" />}
          {event.is_family_friendly && <Badge label="👨‍👩‍👧 Family" variant="blue" />}
          {event.gender_restriction !== 'mixed' && (
            <Badge label={event.gender_restriction === 'male' ? '♂ Men' : '♀ Women'} variant="yellow" />
          )}
        </View>
        {isFull && (
          <View style={styles.fullOverlay}>
            <Badge label="Full" variant="red" />
          </View>
        )}
      </View>

      {/* Content */}
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>{title}</Text>

        <Text style={styles.meta}>📅 {formatDate(event.start_at, locale)}</Text>
        <Text style={styles.meta} numberOfLines={1}>
          📍 {event.city}{event.venue_name ? ` · ${event.venue_name}` : ''}
        </Text>

        <View style={styles.footer}>
          <Text style={styles.organizer} numberOfLines={1}>
            {event.organizer_profile?.business_name ?? event.organizer?.display_name ?? ''}
          </Text>
          <Text style={[styles.price, event.is_free && styles.priceGreen]}>
            {event.is_free ? 'Free' : formatCurrency(event.price ?? 0, locale)}
          </Text>
        </View>

        {spotsLeft !== null && spotsLeft > 0 && spotsLeft <= 10 && (
          <Text style={styles.urgency}>⚡ {spotsLeft} spot{spotsLeft !== 1 ? 's' : ''} left</Text>
        )}
      </View>
    </TouchableOpacity>
  )
}

export function EventCardSkeleton() {
  return (
    <View style={[styles.card, styles.skeleton]}>
      <View style={[styles.cover, { backgroundColor: Colors.gray[200] }]} />
      <View style={styles.body}>
        <View style={skeletonStyles.line} />
        <View style={[skeletonStyles.line, { width: '60%' }]} />
        <View style={[skeletonStyles.line, { width: '70%' }]} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
    ...Shadow.card,
  },
  skeleton: { opacity: 0.7 },
  cover: {
    height: 130,
    backgroundColor: Colors.brand[100],
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverEmoji: { fontSize: 48 },
  badges: {
    position: 'absolute',
    top: Spacing.sm,
    left: Spacing.sm,
    flexDirection: 'row',
    gap: Spacing.xs,
    flexWrap: 'wrap',
  },
  fullOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  body: { padding: Spacing.md },
  title: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    color: Colors.gray[900],
    marginBottom: Spacing.xs,
  },
  meta: { fontSize: FontSize.xs, color: Colors.gray[500], marginBottom: 2 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[100],
  },
  organizer: { fontSize: FontSize.xs, color: Colors.gray[500], flex: 1, marginRight: Spacing.sm },
  price: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.brand[600] },
  priceGreen: { color: Colors.green.text },
  urgency: { fontSize: FontSize.xs, color: '#ea580c', fontWeight: FontWeight.medium, marginTop: 4 },
})

const skeletonStyles = StyleSheet.create({
  line: {
    height: 12,
    backgroundColor: Colors.gray[200],
    borderRadius: 6,
    marginBottom: Spacing.sm,
    width: '85%',
  },
})
