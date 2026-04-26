import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Colors, FontSize, FontWeight, Radius, Shadow, Spacing } from '@/theme'
import type { Community, HappeningType, HappeningWithAuthor } from '@/types/database'
import { PlanBadge } from '@/components/ui/PlanBadge'

export type HappeningDiscoveryItem = HappeningWithAuthor & {
  community: Pick<Community, 'id' | 'name' | 'name_ar' | 'slug' | 'level' | 'cover_url'> & { is_member?: boolean }
  distance_km?: number | null
}

type Props = {
  happening: HappeningDiscoveryItem
  variant?: 'rail'
  onToggleRsvp?: (happening: HappeningDiscoveryItem) => void
  onToggleReact?: (happening: HappeningDiscoveryItem) => void
  onOpenComments?: (happening: HappeningDiscoveryItem) => void
  onShowParticipants?: (happening: HappeningDiscoveryItem) => void
}

const TYPE_META: Record<HappeningType, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }> = {
  open_invite: { label: 'Open invite', icon: 'sparkles-outline', color: '#0f766e', bg: '#ccfbf1' },
  info: { label: 'Update', icon: 'megaphone-outline', color: '#1d4ed8', bg: '#dbeafe' },
  question: { label: 'Ping', icon: 'hand-left-outline', color: '#7c2d12', bg: '#ffedd5' },
  alert: { label: 'Meetup alert', icon: 'location-outline', color: '#b91c1c', bg: '#fee2e2' },
}

function getTimeLeft(expiresAt: string) {
  const ttlMs = new Date(expiresAt).getTime() - Date.now()
  if (ttlMs <= 0) return 'Expired'
  const hours = Math.floor(ttlMs / 3_600_000)
  const minutes = Math.floor((ttlMs % 3_600_000) / 60_000)
  return hours > 0 ? `${hours}h ${minutes}m left` : `${minutes}m left`
}

export function HappeningDiscoveryCard({
  happening,
  variant = 'rail',
  onToggleRsvp,
  onToggleReact,
  onOpenComments,
  onShowParticipants,
}: Props) {
  const router = useRouter()
  const meta = TYPE_META[happening.type]
  const timeLeft = getTimeLeft(happening.expires_at)
  const communityName = happening.community.name_ar || happening.community.name

  async function openLocation() {
    if (happening.lat === null || happening.lng === null) return
    const url = `https://www.google.com/maps/search/?api=1&query=${happening.lat},${happening.lng}`
    await Linking.openURL(url)
  }

  return (
    <TouchableOpacity
      style={[styles.card, variant === 'rail' && styles.cardRail]}
      activeOpacity={0.86}
      onPress={() => router.push(`/communities/${happening.community.slug}` as any)}
    >
      <View style={styles.topRow}>
        <View style={[styles.typeBadge, { backgroundColor: meta.bg }]}>
          <Ionicons name={meta.icon} size={12} color={meta.color} />
          <Text style={[styles.typeBadgeText, { color: meta.color }]}>{meta.label}</Text>
        </View>
        {happening.distance_km !== null && happening.distance_km !== undefined ? (
          <Text style={styles.distanceText}>{happening.distance_km} km</Text>
        ) : null}
      </View>

      <Text style={styles.bodyText} numberOfLines={4}>{happening.body}</Text>

      <View style={styles.metaRow}>
        <Ionicons name="people-outline" size={12} color={Colors.gray[500]} />
        <Text style={styles.metaText} numberOfLines={1}>{communityName}</Text>
      </View>
      <View style={styles.metaRow}>
        <Ionicons name="time-outline" size={12} color={Colors.gray[500]} />
        <Text style={styles.metaText}>{timeLeft}</Text>
      </View>
      {happening.location_label ? (
        <TouchableOpacity style={styles.metaRow} onPress={openLocation}>
          <Ionicons name="location-outline" size={12} color={Colors.brand[600]} />
          <Text style={[styles.metaText, styles.locationText]} numberOfLines={1}>{happening.location_label}</Text>
        </TouchableOpacity>
      ) : null}

      <View style={styles.footer}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: Spacing.sm }}>
          <Text style={[styles.authorText, { marginBottom: 0 }]} numberOfLines={1}>
            {happening.author.display_name}
          </Text>
          <PlanBadge planId={happening.author.plan_id} size={13} />
        </View>
        <TouchableOpacity
          onPress={(e) => {
            e.stopPropagation()
            if (happening.rsvp_count > 0) onShowParticipants?.(happening)
          }}
          activeOpacity={0.7}
          disabled={happening.rsvp_count === 0}
          style={styles.participantsRow}
        >
          <Ionicons name="people-outline" size={13} color={Colors.gray[600]} />
          <Text style={styles.participantsText}>
            {happening.rsvp_count > 0 ? `${happening.rsvp_count} joined` : 'No one joined yet'}
          </Text>
          {happening.rsvp_count > 0 && (
            <Ionicons name="chevron-forward" size={12} color={Colors.gray[500]} />
          )}
        </TouchableOpacity>
        <View style={styles.actions}>
          <TouchableOpacity
            onPress={() => onOpenComments?.(happening)}
            style={styles.actionBtn}
          >
            <Text style={styles.actionText}>Chat</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onToggleRsvp?.(happening)}
            style={[styles.actionBtn, happening.user_has_rsvp && styles.actionBtnActive]}
          >
            <Text style={[styles.actionText, happening.user_has_rsvp && styles.actionTextActive]}>
              Join · {happening.rsvp_count}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onToggleReact?.(happening)}
            style={[styles.actionBtn, happening.user_has_reacted && styles.reactBtnActive]}
          >
            <Text style={[styles.actionText, happening.user_has_reacted && styles.reactTextActive]}>
              Like · {happening.reaction_count}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#f8fffe',
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: '#99f6e4',
    padding: Spacing.md,
    ...Shadow.card,
  },
  cardRail: {
    width: 268,
    marginRight: Spacing.md,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  typeBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
  distanceText: {
    fontSize: FontSize.xs,
    color: Colors.gray[500],
    fontWeight: FontWeight.medium,
  },
  bodyText: {
    fontSize: FontSize.sm,
    color: Colors.gray[900],
    lineHeight: 20,
    fontWeight: FontWeight.semibold,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.xs,
  },
  metaText: {
    flex: 1,
    fontSize: FontSize.xs,
    color: Colors.gray[500],
  },
  locationText: {
    color: Colors.brand[700],
  },
  footer: {
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#d1fae5',
  },
  authorText: {
    fontSize: FontSize.xs,
    color: Colors.gray[600],
    marginBottom: Spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  actionBtn: {
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
  },
  actionBtnActive: {
    borderColor: Colors.brand[500],
    backgroundColor: Colors.brand[50],
  },
  reactBtnActive: {
    borderColor: '#0f766e',
    backgroundColor: '#ccfbf1',
  },
  actionText: {
    fontSize: 11,
    color: Colors.gray[600],
    fontWeight: FontWeight.semibold,
  },
  actionTextActive: {
    color: Colors.brand[700],
  },
  reactTextActive: {
    color: '#0f766e',
  },
  participantsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: Spacing.sm,
  },
  participantsText: {
    flex: 1,
    fontSize: 11,
    color: Colors.gray[600],
    fontWeight: FontWeight.medium,
  },
})
