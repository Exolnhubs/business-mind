import { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import EventsScreen from '@/components/screens/EventsScreen'
import FeedScreen from './feed'
import { useAuth } from '@/contexts/auth-context'
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/theme'

type Segment = 'explore' | 'foryou'

export default function HomeScreen() {
  const { profile } = useAuth()
  const [segment, setSegment] = useState<Segment>('explore')
  const [feedMounted, setFeedMounted] = useState(false)
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const showSmartPicksTrigger =
    typeof (profile?.preferences as Record<string, unknown> | undefined)?.show_smart_picks_trigger === 'boolean'
      ? Boolean((profile?.preferences as Record<string, unknown>).show_smart_picks_trigger)
      : true

  function handleSegmentChange(nextSegment: Segment) {
    if (nextSegment === 'foryou') {
      setFeedMounted(true)
    }
    setSegment(nextSegment)
  }

  return (
    <View style={styles.root}>
      {/* ── Header with segment pill ─────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <View style={styles.pillTrack}>
          <PillBtn
            label="🌍  Explore"
            active={segment === 'explore'}
            onPress={() => handleSegmentChange('explore')}
          />
          <PillBtn
            label="✨  For You"
            active={segment === 'foryou'}
            onPress={() => handleSegmentChange('foryou')}
          />
        </View>
      </View>

      {/* ── Smart Picks banner ───────────────────────────────── */}
      {showSmartPicksTrigger && (
      <TouchableOpacity
        style={[styles.smartFab, { bottom: Math.max(insets.bottom + Spacing.sm, Spacing.lg) }]}
        activeOpacity={0.88}
        onPress={() => router.push('/discover')}
      >
        <Text style={styles.smartBannerIcon}>✨</Text>
        <View style={styles.smartBannerBody}>
          <Text style={styles.smartBannerTitle}>Smart Picks for You</Text>
          <Text style={styles.smartBannerSub}>Let AI find events you'll love</Text>
        </View>
        <Text style={styles.smartBannerArrow}>›</Text>
      </TouchableOpacity>
      )}

      {/* ── Content ──────────────────────────────────────────── */}
      <View style={styles.content}>
        <View
          style={[styles.screenPane, segment !== 'explore' && styles.hiddenPane]}
          pointerEvents={segment === 'explore' ? 'auto' : 'none'}
        >
          <EventsScreen />
        </View>

        {feedMounted && (
          <View
            style={[styles.screenPane, segment !== 'foryou' && styles.hiddenPane]}
            pointerEvents={segment === 'foryou' ? 'auto' : 'none'}
          >
            <FeedScreen onExplore={() => handleSegmentChange('explore')} />
          </View>
        )}
      </View>
    </View>
  )
}

function PillBtn({
  label, active, onPress,
}: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[styles.pillBtn, active && styles.pillBtnActive]}
    >
      <Text style={[styles.pillText, active && styles.pillTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.gray[50] },
  content: { flex: 1 },
  screenPane: { flex: 1 },
  hiddenPane: { display: 'none' },

  header: {
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
    alignItems: 'center',
  },

  // Pill track — gray background, two options side by side
  pillTrack: {
    flexDirection: 'row',
    backgroundColor: Colors.gray[100],
    borderRadius: Radius.full,
    padding: 3,
  },

  pillBtn: {
    paddingHorizontal: Spacing['2xl'],
    paddingVertical: Spacing.sm - 1,
    borderRadius: Radius.full,
  },
  pillBtnActive: {
    backgroundColor: Colors.white,
    // Subtle lift shadow for the active pill
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },

  pillText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: Colors.gray[500],
  },
  pillTextActive: {
    color: Colors.gray[900],
    fontWeight: FontWeight.semibold,
  },

  smartFab: {
    position: 'absolute',
    right: Spacing.lg,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: Colors.brand[600],
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 8,
    zIndex: 20,
  },
  smartBannerIcon: { fontSize: 24, color: Colors.white },
  smartBannerBody: { display: 'none' },
  smartBannerTitle: { display: 'none' },
  smartBannerSub:   { display: 'none' },
  smartBannerArrow: { display: 'none' },
})
