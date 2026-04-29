import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import EventsScreen from '@/components/screens/EventsScreen'
import FeedScreen from './feed'
import { HappeningComposerSheet } from '@/components/happenings/HappeningComposerSheet'
import { useAuth } from '@/contexts/auth-context'
import { useNotifications } from '@/contexts/notification-context'
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/theme'

type Segment = 'explore' | 'foryou'

export default function HomeScreen() {
  const { profile } = useAuth()
  const { unreadCount } = useNotifications()
  const params = useLocalSearchParams<{ community?: string }>()
  const [segment, setSegment] = useState<Segment>('explore')
  const [feedMounted, setFeedMounted] = useState(false)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [showHappeningComposer, setShowHappeningComposer] = useState(false)
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const showSmartPicksAction =
    typeof (profile?.preferences as Record<string, unknown> | undefined)?.show_smart_picks_trigger === 'boolean'
      ? Boolean((profile?.preferences as Record<string, unknown>).show_smart_picks_trigger)
      : true

  function handleSegmentChange(nextSegment: Segment) {
    setActionsOpen(false)
    if (nextSegment === 'foryou') {
      setFeedMounted(true)
    }
    setSegment(nextSegment)
  }

  function openHappeningComposer() {
    setActionsOpen(false)
    setShowHappeningComposer(true)
  }

  function openSmartPicks() {
    setActionsOpen(false)
    router.push('/discover')
  }

  useEffect(() => {
    if (typeof params.community === 'string' && params.community && segment !== 'explore') {
      setSegment('explore')
    }
  }, [params.community, segment])

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        {/* Spacer to balance the bell on the right */}
        <View style={styles.notifPlaceholder} />
        <View style={styles.pillTrack}>
          <PillBtn
            label="Explore"
            active={segment === 'explore'}
            onPress={() => handleSegmentChange('explore')}
          />
          <PillBtn
            label="For You"
            active={segment === 'foryou'}
            onPress={() => handleSegmentChange('foryou')}
          />
        </View>
        <TouchableOpacity
          style={styles.notifBtn}
          activeOpacity={0.75}
          onPress={() => router.push('/notifications' as any)}
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
        >
          <Ionicons name="notifications-outline" size={22} color={Colors.gray[700]} />
          {unreadCount > 0 && (
            <View style={styles.notifBadge}>
              <Text style={styles.notifBadgeText}>
                {unreadCount > 99 ? '99+' : String(unreadCount)}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <>
        {actionsOpen && (
          <TouchableOpacity
            style={styles.actionsBackdrop}
            activeOpacity={1}
            onPress={() => setActionsOpen(false)}
          />
        )}
        <View
          pointerEvents="box-none"
          style={[styles.actionsLayer, { bottom: Math.max(insets.bottom + Spacing.sm, Spacing.lg) }]}
        >
          {actionsOpen && (
            <>
              <QuickAction
                icon="add"
                label="New Happening"
                bottomOffset={showSmartPicksAction ? 132 : 70}
                onPress={openHappeningComposer}
              />
              {showSmartPicksAction && (
                <QuickAction
                  icon="sparkles"
                  label="Smart Picks"
                  bottomOffset={70}
                  onPress={openSmartPicks}
                />
              )}
            </>
          )}

          <TouchableOpacity
            style={styles.smartFab}
            activeOpacity={0.88}
            onPress={() => setActionsOpen((prev) => !prev)}
          >
            <Ionicons
              name={actionsOpen ? 'close' : 'ellipsis-vertical'}
              size={22}
              color={Colors.white}
            />
          </TouchableOpacity>
        </View>
      </>

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

      <HappeningComposerSheet
        visible={showHappeningComposer}
        onClose={() => setShowHappeningComposer(false)}
      />
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

function QuickAction({
  icon,
  label,
  bottomOffset,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap
  label: string
  bottomOffset: number
  onPress: () => void
}) {
  return (
    <View style={[styles.quickActionRow, { bottom: bottomOffset }]}>
      <View style={styles.quickActionLabel}>
        <Text style={styles.quickActionLabelText}>{label}</Text>
      </View>
      <TouchableOpacity style={styles.quickActionButton} activeOpacity={0.88} onPress={onPress}>
        <Ionicons name={icon} size={18} color={Colors.white} />
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.gray[50] },
  content: { flex: 1 },
  screenPane: { flex: 1 },
  hiddenPane: { display: 'none' },
  actionsBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    zIndex: 18,
  },
  actionsLayer: {
    position: 'absolute',
    right: Spacing.lg,
    width: 220,
    alignItems: 'flex-end',
    zIndex: 20,
  },
  header: {
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  notifPlaceholder: { width: 36 },
  notifBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.brand[500],
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  notifBadgeText: { fontSize: 9, fontWeight: '700' as const, color: '#fff' },
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
    zIndex: 22,
  },
  quickActionRow: {
    position: 'absolute',
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  quickActionLabel: {
    borderRadius: Radius.full,
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  quickActionLabelText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.gray[800],
  },
  quickActionButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.brand[600],
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 6,
  },
})
