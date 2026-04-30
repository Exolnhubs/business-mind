import React, { useEffect, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Image, Animated, Alert, ScrollView } from 'react-native'
import { useRouter } from 'expo-router'
import { Badge } from '@/components/ui/Badge'
import { formatCurrency } from '@/lib/utils'
import { useLocale } from '@/contexts/locale-context'
import { useAuth } from '@/contexts/auth-context'
import { apiDelete, apiPost } from '@/lib/api'
import { Colors, Spacing, Radius } from '@/theme'
import type { EventWithOrganizer } from '@/types/database'
import { FlameBackground } from '@/components/events/FlameBackground'

const CATEGORY_EMOJI: Record<string, string> = {
  sports: '⚽', art: '🎨', music: '🎵', tech: '💻', food: '🍽️',
  community: '🤝', education: '📚', health: '💪', business: '💼', entertainment: '🎭',
}

// Brand ink — matches web + splash
const INK = '#1a0d04'

function formatShortDate(isoDate: string, locale: string): string {
  try {
    return new Date(isoDate).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-US', {
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return ''
  }
}

interface EventCardProps {
  event: EventWithOrganizer
  isSaved?: boolean
  onUnsave?: (id: string) => void
  onSaveChange?: (id: string, saved: boolean) => void
  variant?: 'default' | 'rail'
}

export const EventCard = React.memo(function EventCard({
  event,
  isSaved: initialSaved = false,
  onUnsave,
  onSaveChange,
  variant = 'default',
}: EventCardProps) {
  const router = useRouter()
  const { locale, isRTL } = useLocale()
  const { user } = useAuth()
  const [saved, setSaved] = useState(initialSaved)
  const textDirStyle = isRTL ? cardStyles.rtlText : cardStyles.ltrText

  useEffect(() => { setSaved(initialSaved) }, [initialSaved])

  const icon = CATEGORY_EMOJI[event.category?.name_en?.toLowerCase() ?? ''] ?? '📅'
  const now = new Date()
  const hasHotOffer = (event.ticket_types ?? []).some(
    (tt) => tt.is_hot_offer && !!tt.hot_offer_ends_at && new Date(tt.hot_offer_ends_at) > now,
  )
  const spotsLeft = event.capacity ? event.capacity - event.bookings_count : null
  const isFull = spotsLeft !== null && spotsLeft <= 0
  const almostFull = spotsLeft !== null && spotsLeft > 0 && spotsLeft <= 10
  const shortDate = formatShortDate(event.start_at, locale)
  const title = locale === 'ar' && event.title_ar ? event.title_ar : event.title

  async function toggleSave() {
    if (!user) return
    const next = !saved
    setSaved(next)
    if (next) {
      const { error } = await apiPost(`/api/events/${event.id}/save`, {})
      if (error) {
        setSaved(false)
        Alert.alert('Save unavailable', error)
        return
      }
      onSaveChange?.(event.id, true)
    } else {
      const { error } = await apiDelete(`/api/events/${event.id}/save`)
      if (error) {
        setSaved(true)
        Alert.alert('Could not unsave', error)
        return
      }
      onUnsave?.(event.id)
      onSaveChange?.(event.id, false)
    }
  }

  return (
    <TouchableOpacity
      style={[cardStyles.card, variant === 'rail' && cardStyles.cardRail, hasHotOffer && cardStyles.cardHot]}
      activeOpacity={0.82}
      onPress={() => router.push(`/events/${event.id}`)}
    >
      {/* ── Cover ─────────────────────────────────────────── */}
      <View style={[cardStyles.cover, variant === 'rail' && cardStyles.coverRail]}>
        {/* Animated flames live behind the cover image for hot-offer cards */}
        {hasHotOffer && <FlameBackground />}
        {event.cover_image_url
          ? <Image
              source={{ uri: event.cover_image_url }}
              style={[StyleSheet.absoluteFill, hasHotOffer && cardStyles.coverImageHot]}
              resizeMode="cover"
            />
          : (
            <View style={cardStyles.coverPlaceholder}>
              <Text style={cardStyles.coverEmoji}>{icon}</Text>
            </View>
          )
        }

        {/* Soft scrim at bottom — lifts badges off the image */}
        <View style={cardStyles.coverScrim} />

        {/* Date badge — top left */}
        <View style={cardStyles.dateBadge}>
          <Text style={cardStyles.dateBadgeText}>{shortDate}</Text>
        </View>

        {/* Heart — top right */}
        {user && (
          <TouchableOpacity
            style={cardStyles.heartBtn}
            onPress={toggleSave}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            <Text style={cardStyles.heartIcon}>{saved ? '❤️' : '🤍'}</Text>
          </TouchableOpacity>
        )}

        {/* Attribute badges sit on the scrim */}
        <View style={cardStyles.badges}>
          {event.is_free && <Badge label="Free" variant="green" />}
          {hasHotOffer && <Badge label="🔥 Hot Offer" variant="orange" />}
          {event.is_family_friendly && <Badge label="Family" variant="blue" />}
          {event.gender_restriction !== 'mixed' && (
            <Badge
              label={event.gender_restriction === 'male' ? 'Men' : 'Women'}
              variant="yellow"
            />
          )}
        </View>

        {isFull && (
          <View style={cardStyles.fullOverlay}>
            <Badge label="Full" variant="red" />
          </View>
        )}
      </View>

      {/* ── Body ─────────────────────────────────────────── */}
      <View style={[cardStyles.body, hasHotOffer && cardStyles.bodyHot]}>
        <Text style={[cardStyles.title, {textAlign: 'left'}]} numberOfLines={2}>{title}</Text>

        <Text style={[cardStyles.location, {textAlign: 'left'}]} numberOfLines={1}>
          📍 {event.city}{event.venue_name ? ` · ${event.venue_name}` : ''}
        </Text>

        <View style={cardStyles.footer}>
          <Text style={[cardStyles.organizer, {textAlign: 'left'}]} numberOfLines={1}>
            {event.organizer?.organizer_profile?.business_name ?? event.organizer?.display_name ?? ''}
          </Text>
          <View style={[cardStyles.pricePill, event.is_free && cardStyles.pricePillFree]}>
            <Text style={[cardStyles.priceText, event.is_free && cardStyles.priceTextFree]}>
              {event.is_free ? 'Free' : formatCurrency(event.price ?? 0, event.currency, locale)}
            </Text>
          </View>
        </View>

        {almostFull && (
          <View style={cardStyles.urgencyRow}>
            <Text style={[cardStyles.urgencyText, textDirStyle]}>
              ⚡ {spotsLeft} spot{spotsLeft !== 1 ? 's' : ''} left
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  )
})

// ── Skeleton ──────────────────────────────────────────────────
export function EventCardSkeleton() {
  const shimmer = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [shimmer])

  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.88] })

  return (
    <Animated.View style={[skeletonStyles.card, { opacity }]}>
      <View style={skeletonStyles.cover} />
      <View style={skeletonStyles.body}>
        <View style={skeletonStyles.line} />
        <View style={[skeletonStyles.line, { width: '62%' }]} />
        <View style={[skeletonStyles.line, { width: '48%', marginTop: Spacing.sm }]} />
      </View>
    </Animated.View>
  )
}

// ── Rail Skeleton ──────────────────────────────────────────────
export function RailSkeleton({ variant }: { variant: 'featured' | 'hot' }) {
  const shimmer = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [shimmer])

  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.88] })
  const isFeatured = variant === 'featured'
  const barColor   = isFeatured ? Colors.gray[300] : 'rgba(255,255,255,0.18)'
  const coverColor = isFeatured ? Colors.gray[200] : 'rgba(255,255,255,0.12)'

  return (
    <View style={[
      railSkeletonStyles.section,
      isFeatured && {
        backgroundColor: Colors.brand[50],
        marginHorizontal: Spacing.lg,
        borderRadius: Radius.lg,
      },
    ]}>
      <Animated.View style={[railSkeletonStyles.header, { opacity }]}>
        <View style={railSkeletonStyles.headerLeft}>
          <View style={[railSkeletonStyles.eyebrow, { backgroundColor: barColor }]} />
          <View style={[railSkeletonStyles.title,   { backgroundColor: barColor }]} />
        </View>
        <View style={[railSkeletonStyles.badge, { backgroundColor: barColor }]} />
      </Animated.View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={railSkeletonStyles.scroller}
      >
        {[1, 2, 3].map((i) => (
          <Animated.View key={i} style={[railSkeletonStyles.card, { opacity }]}>
            <View style={[railSkeletonStyles.cardCover, { backgroundColor: coverColor }]} />
            <View style={railSkeletonStyles.cardBody}>
              <View style={[railSkeletonStyles.cardLine,      { backgroundColor: barColor }]} />
              <View style={[railSkeletonStyles.cardLineShort, { backgroundColor: barColor }]} />
            </View>
          </Animated.View>
        ))}
      </ScrollView>
    </View>
  )
}

const railSkeletonStyles = StyleSheet.create({
  section: {
    marginBottom: Spacing.lg,
    marginTop:    Spacing.xs,
    marginHorizontal: -Spacing.lg,
    paddingTop:   Spacing.md,
    paddingBottom: Spacing.lg,
    backgroundColor: '#1a0d04',
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  headerLeft: { gap: 6 },
  eyebrow:    { width: 60,  height: 10, borderRadius: 4 },
  title:      { width: 160, height: 22, borderRadius: 6 },
  badge:      { width: 50,  height: 24, borderRadius: Radius.full },
  scroller:   { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xs, gap: Spacing.sm },
  card:       { width: 268, borderRadius: Radius.lg, overflow: 'hidden' },
  cardCover:  { height: 148 },
  cardBody:   { paddingHorizontal: Spacing.sm, paddingTop: Spacing.sm, gap: 6 },
  cardLine:       { height: 14, borderRadius: 4 },
  cardLineShort:  { height: 12, width: '62%', borderRadius: 4 },
})

// ── Styles ────────────────────────────────────────────────────
const cardStyles = StyleSheet.create({
  rtlText: { textAlign: 'right', writingDirection: 'rtl' },
  ltrText: { textAlign: 'left', writingDirection: 'ltr' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
    shadowColor: INK,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.09,
    shadowRadius: 8,
    elevation: 3,
  },
  cardRail: {
    width: 268,
    marginBottom: 0,
    marginRight: Spacing.md,
  },
  cardHot: {
    shadowColor: '#F97316',
    shadowOpacity: 0.55,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 14,
  },

  // Cover
  cover: {
    height: 160,
    backgroundColor: '#2a1108',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  coverRail: { height: 148 },
  coverImageHot: {
    // Reduce image opacity so animated flames show through from behind
    opacity: 0.62,
  },
  coverPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#2a1108',
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverEmoji: { fontSize: 52 },

  // Dark vignette at bottom — makes badges readable on any image
  coverScrim: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
    backgroundColor: 'rgba(8,4,0,0.42)',
  },

  // Short date pill — amber tint, top-left
  dateBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(245,158,11,0.90)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  dateBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.2,
  },

  // Heart — frosted glass circle, top-right
  heartBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.88)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heartIcon: { fontSize: 14 },

  // Attribute badges — sit on the bottom scrim
  badges: {
    position: 'absolute',
    bottom: 8,
    left: 10,
    flexDirection: 'row',
    gap: 4,
    flexWrap: 'wrap',
  },

  fullOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.48)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Body
  body: { padding: 12 },
  bodyHot: {
    backgroundColor: '#FFFBEB',  // amber-50 — subtle warm glow in the card body
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: INK,
    marginBottom: 4,
    lineHeight: 20,
  },
  location: {
    fontSize: 12,
    color: Colors.gray[500],
    marginBottom: 8,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  organizer: {
    fontSize: 11,
    color: Colors.gray[400],
    flex: 1,
    marginRight: 8,
  },

  // Price — amber tinted pill for paid, green tint for free
  pricePill: {
    backgroundColor: 'rgba(245,158,11,0.10)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pricePillFree: {
    backgroundColor: 'rgba(34,197,94,0.10)',
  },
  priceText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#d97706',
  },
  priceTextFree: {
    color: '#16a34a',
  },

  // Urgency strip — "⚡ 3 spots left"
  urgencyRow: {
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#fef3c7',
  },
  urgencyText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#d97706',
  },
})

const skeletonStyles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
  },
  cover: {
    height: 160,
    backgroundColor: Colors.gray[200],
  },
  body: { padding: 12 },
  line: {
    height: 12,
    backgroundColor: Colors.gray[200],
    borderRadius: 6,
    marginBottom: Spacing.sm,
    width: '85%',
  },
})
