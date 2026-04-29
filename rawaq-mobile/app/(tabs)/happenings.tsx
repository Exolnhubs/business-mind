import { useCallback, useEffect, useState } from 'react'
import { FlatList, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View, Alert } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { apiDelete, apiGet, apiPost } from '@/lib/api'
import { useAuth } from '@/contexts/auth-context'
import { HappeningDiscoveryCard, type HappeningDiscoveryItem } from '@/components/happenings/HappeningDiscoveryCard'
import { HappeningCommentsSheet } from '@/components/happenings/HappeningCommentsSheet'
import { HappeningParticipantsSheet } from '@/components/happenings/HappeningParticipantsSheet'
import { EmptyState } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/Spinner'
import { Colors, FontSize, FontWeight, Radius, Shadow, Spacing } from '@/theme'
import { useLocale } from '@/contexts/locale-context'

type ActiveCommunity = {
  id: string
  name: string
  name_ar: string | null
  slug: string
  level: string
  cover_url: string | null
  is_member: boolean
  happening_count: number
}

export default function HappeningsTab() {
  const router = useRouter()
  const { user } = useAuth()
  const { t, locale } = useLocale()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [happenings, setHappenings] = useState<HappeningDiscoveryItem[]>([])
  const [activeCommunities, setActiveCommunities] = useState<ActiveCommunity[]>([])
  const [selectedHappening, setSelectedHappening] = useState<HappeningDiscoveryItem | null>(null)
  const [selectedParticipants, setSelectedParticipants] = useState<HappeningDiscoveryItem | null>(null)

  const patchHappening = useCallback((id: string, updater: (item: HappeningDiscoveryItem) => HappeningDiscoveryItem) => {
    setHappenings((prev) => prev.map((item) => (item.id === id ? updater(item) : item)))
  }, [])

  const load = useCallback(async (force = false) => {
    setLoading(true)
    const [{ data: happeningsData }, { data: activeData }] = await Promise.all([
      apiGet<{ happenings: HappeningDiscoveryItem[] }>('/api/happenings/discover?limit=20', { force }),
      apiGet<{ communities: ActiveCommunity[] }>('/api/happenings/active?limit=10', { force }),
    ])
    const nextHappenings = happeningsData?.happenings ?? []
    const nextCommunities = activeData?.communities ?? []

    setHappenings(nextHappenings)
    setActiveCommunities(nextCommunities)
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  async function toggleRsvp(happening: HappeningDiscoveryItem) {
    if (!user) {
      router.push('/auth/login' as any)
      return
    }
    const { data, error } = happening.user_has_rsvp
      ? await apiDelete<{ rsvp: boolean; rsvp_count: number }>(`/api/happenings/${happening.id}/rsvp`)
      : await apiPost<{ rsvp: boolean; rsvp_count: number }>(`/api/happenings/${happening.id}/rsvp`, {})
    if (error) {
      Alert.alert(t('happenings.unavailable'), error)
      return
    }
    if (!data) {
      return
    }
    patchHappening(happening.id, (item) => ({ ...item, user_has_rsvp: data.rsvp, rsvp_count: data.rsvp_count }))
  }

  async function toggleReact(happening: HappeningDiscoveryItem) {
    if (!user) {
      router.push('/auth/login' as any)
      return
    }
    const { data, error } = happening.user_has_reacted
      ? await apiDelete<{ reacted: boolean; reaction_count: number }>(`/api/happenings/${happening.id}/react`)
      : await apiPost<{ reacted: boolean; reaction_count: number }>(`/api/happenings/${happening.id}/react`, {})
    if (error) {
      Alert.alert(t('happenings.unavailable'), error)
      return
    }
    if (!data) {
      return
    }
    patchHappening(happening.id, (item) => ({ ...item, user_has_reacted: data.reacted, reaction_count: data.reaction_count }))
  }

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.center}><Spinner /></View>
      ) : (
        <FlatList
          data={happenings}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true)
                void load(true)
              }}
              tintColor={Colors.brand[500]}
            />
          }
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View>
              <View style={styles.hero}>
                <Text style={styles.eyebrow}>{t('happenings.eyebrow')}</Text>
                <Text style={styles.title}>{t('happenings.title')}</Text>
                <Text style={styles.subtitle}>{t('happenings.subtitle')}</Text>
              </View>

              {activeCommunities.length > 0 && (
                <View style={styles.activeSection}>
                  <View style={styles.activeHeader}>
                    <View style={styles.activeDot} />
                    <Text style={styles.activeTitle}>{t('happenings.active_now')}</Text>
                    <Text style={styles.activeSub}>{t('happenings.active_sub')}</Text>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.activeScroller}>
                    {activeCommunities.map((community) => {
                      const name = locale === 'ar' && community.name_ar ? community.name_ar : community.name
                      return (
                        <TouchableOpacity
                          key={community.id}
                          style={styles.activeCard}
                          activeOpacity={0.85}
                          onPress={() => router.push(`/communities/${community.slug}` as any)}
                        >
                          <View style={[styles.activeAvatar, community.is_member && styles.activeAvatarMember]}>
                            <Text style={styles.activeAvatarText}>{name.slice(0, 1).toUpperCase()}</Text>
                          </View>
                          <Text style={styles.activeName} numberOfLines={1}>{name}</Text>
                          <Text style={styles.activeCount}>{community.happening_count} {t('happenings.live')}</Text>
                        </TouchableOpacity>
                      )
                    })}
                  </ScrollView>
                </View>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.cardWrap}>
              <HappeningDiscoveryCard
                happening={item}
                onToggleRsvp={toggleRsvp}
                onToggleReact={toggleReact}
                onOpenComments={setSelectedHappening}
                onShowParticipants={setSelectedParticipants}
              />
            </View>
          )}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.md }} />}
          ListEmptyComponent={
            <EmptyState
              icon="📍"
              title={t('happenings.empty_title')}
              description={t('happenings.empty_desc')}
            />
          }
        />
      )}

      <HappeningCommentsSheet
        visible={!!selectedHappening}
        happening={selectedHappening}
        currentUserId={user?.id ?? null}
        onClose={() => setSelectedHappening(null)}
      />

      <HappeningParticipantsSheet
        visible={!!selectedParticipants}
        happeningId={selectedParticipants?.id ?? null}
        onClose={() => setSelectedParticipants(null)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f5f9' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing.lg, paddingBottom: Spacing['5xl'] },
  hero: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    ...Shadow.card,
  },
  eyebrow: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.brand[600],
    textTransform: 'uppercase',
  },
  title: {
    marginTop: 4,
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.gray[900],
  },
  subtitle: {
    marginTop: Spacing.xs,
    fontSize: FontSize.sm,
    color: Colors.gray[500],
    lineHeight: 21,
  },
  activeSection: {
    marginBottom: Spacing.lg,
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    paddingVertical: Spacing.md,
    ...Shadow.card,
  },
  activeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  activeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22c55e' },
  activeTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.gray[900] },
  activeSub: { fontSize: FontSize.xs, color: Colors.gray[400], flex: 1 },
  activeScroller: { paddingHorizontal: Spacing.lg, gap: Spacing.md },
  activeCard: { alignItems: 'center', width: 74 },
  activeAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.brand[100],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.gray[200],
    marginBottom: Spacing.sm,
  },
  activeAvatarMember: { borderColor: '#22c55e', borderWidth: 2.5 },
  activeAvatarText: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.brand[700] },
  activeName: { fontSize: 11, fontWeight: FontWeight.semibold, color: Colors.gray[800], textAlign: 'center' },
  activeCount: { fontSize: 10, color: Colors.gray[400], textAlign: 'center', marginTop: 2 },
  cardWrap: { marginHorizontal: 0 },
})
