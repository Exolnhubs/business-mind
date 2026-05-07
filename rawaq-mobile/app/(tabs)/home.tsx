import { useEffect, useRef, useState } from 'react'
import { Animated, PanResponder, View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import EventsScreen from '@/components/screens/EventsScreen'
import FeedScreen from './feed'
import { HappeningComposerSheet } from '@/components/happenings/HappeningComposerSheet'
import { useAuth } from '@/contexts/auth-context'
import { useNotifications } from '@/contexts/notification-context'
import { useLocale } from '@/contexts/locale-context'
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/theme'

type Segment = 'explore' | 'foryou'

const FAB_SIZE = 64
const FAB_RADIUS = 22
const FAB_COLOR = '#E8720F'
const REST_RIGHT = -40   // peeking off-screen
const SNAP_RIGHT = 16    // fully on-screen
const SNAP_THRESHOLD = -16 // drag crosses this → snap to expanded

export default function HomeScreen() {
  const { profile } = useAuth()
  const { unreadCount } = useNotifications()
  const { t } = useLocale()
  const params = useLocalSearchParams<{ community?: string }>()
  const [segment, setSegment] = useState<Segment>('explore')
  const [feedMounted, setFeedMounted] = useState(false)
  const [showHappeningComposer, setShowHappeningComposer] = useState(false)
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const showSmartPicksAction =
    typeof (profile?.preferences as Record<string, unknown> | undefined)?.show_smart_picks_trigger === 'boolean'
      ? Boolean((profile?.preferences as Record<string, unknown>).show_smart_picks_trigger)
      : true

  // ── Peek FAB state ──────────────────────────────────────────────────────
  const fabPhaseRef = useRef<'peeking' | 'expanded' | 'menuOpen'>('peeking')
  const [fabMenuOpen, setFabMenuOpen] = useState(false)

  // Animated values — all non-native because `right` is a layout property
  const rightAnim    = useRef(new Animated.Value(REST_RIGHT)).current
  const rotateAnim   = useRef(new Animated.Value(-12)).current   // degrees
  const menuProgress = useRef(new Animated.Value(0)).current     // 0=dots 1=cross
  const item1Anim    = useRef(new Animated.Value(0)).current     // smart picks row
  const item2Anim    = useRef(new Animated.Value(0)).current     // new happening row
  const hintAnim     = useRef(new Animated.Value(0)).current     // wiggle translateX

  const currentRightRef  = useRef(REST_RIGHT)
  const dragStartRight   = useRef(REST_RIGHT)
  const fabInteracted    = useRef(false)

  const SPRING = { tension: 150, friction: 12, useNativeDriver: false } as const

  // Keep currentRightRef in sync with the animated value during spring animations
  useEffect(() => {
    const id = rightAnim.addListener(({ value }) => { currentRightRef.current = value })
    return () => rightAnim.removeListener(id)
  }, [])

  // Periodic hint wiggle when still peeking
  useEffect(() => {
    function triggerHint() {
      if (fabInteracted.current || fabPhaseRef.current !== 'peeking') return
      Animated.sequence([
        Animated.timing(hintAnim, { toValue: -6, duration: 150, useNativeDriver: false }),
        Animated.timing(hintAnim, { toValue:  0, duration: 200, useNativeDriver: false }),
        Animated.timing(hintAnim, { toValue: -3, duration: 150, useNativeDriver: false }),
        Animated.timing(hintAnim, { toValue:  0, duration: 200, useNativeDriver: false }),
      ]).start()
    }
    const t1 = setTimeout(triggerHint, 1200)
    const interval = setInterval(triggerHint, 8000)
    return () => { clearTimeout(t1); clearInterval(interval) }
  }, [])

  // ── Animation helpers ───────────────────────────────────────────────────
  function snapToPeeking() {
    fabPhaseRef.current = 'peeking'
    Animated.parallel([
      Animated.spring(rightAnim,  { toValue: REST_RIGHT, ...SPRING }),
      Animated.spring(rotateAnim, { toValue: -12,        ...SPRING }),
    ]).start()
  }

  function snapToExpanded() {
    fabPhaseRef.current = 'expanded'
    Animated.parallel([
      Animated.spring(rightAnim,  { toValue: SNAP_RIGHT, ...SPRING }),
      Animated.spring(rotateAnim, { toValue: 0,          ...SPRING }),
    ]).start()
  }

  function openFabMenu() {
    fabPhaseRef.current = 'menuOpen'
    setFabMenuOpen(true)
    Animated.parallel([
      Animated.spring(rightAnim,  { toValue: SNAP_RIGHT, ...SPRING }),
      Animated.spring(rotateAnim, { toValue: 0,          ...SPRING }),
      Animated.timing(menuProgress, { toValue: 1, duration: 250, useNativeDriver: false }),
    ]).start()
    // Staggered item entry — native driver OK since these views only use transform/opacity
    Animated.stagger(70, [
      Animated.spring(item1Anim, { toValue: 1, tension: 200, friction: 14, useNativeDriver: true }),
      Animated.spring(item2Anim, { toValue: 1, tension: 200, friction: 14, useNativeDriver: true }),
    ]).start()
  }

  function closeFabMenu() {
    fabPhaseRef.current = 'peeking'
    Animated.parallel([
      Animated.timing(menuProgress, { toValue: 0, duration: 180, useNativeDriver: false }),
      Animated.timing(item1Anim,    { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(item2Anim,    { toValue: 0, duration: 150, useNativeDriver: true }),
    ]).start(() => {
      setFabMenuOpen(false)
      snapToPeeking()
    })
  }

  function handleFabPress() {
    fabInteracted.current = true
    if (fabPhaseRef.current === 'menuOpen') {
      closeFabMenu()
    } else if (fabPhaseRef.current === 'expanded') {
      openFabMenu()
    } else {
      // Peeking → snap in → brief pause → open menu
      snapToExpanded()
      setTimeout(() => openFabMenu(), 200)
    }
  }

  // ── PanResponder ────────────────────────────────────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: () => {
        if (fabPhaseRef.current !== 'menuOpen') {
          rightAnim.stopAnimation()
          dragStartRight.current = currentRightRef.current
        }
        fabInteracted.current = true
      },
      onPanResponderMove: (_, g) => {
        if (fabPhaseRef.current === 'menuOpen') return
        // Drag left (negative dx) pulls button onto screen (right increases)
        const newRight = Math.max(REST_RIGHT, Math.min(SNAP_RIGHT, dragStartRight.current - g.dx))
        rightAnim.setValue(newRight)
        currentRightRef.current = newRight
        // Live-rotate: -12deg at rest → 0deg when fully in
        const progress = (newRight - REST_RIGHT) / (SNAP_RIGHT - REST_RIGHT)
        rotateAnim.setValue(-12 * (1 - progress))
      },
      onPanResponderRelease: (_, g) => {
        // Short movement = tap
        if (Math.abs(g.dx) < 8 && Math.abs(g.dy) < 8) {
          handleFabPress()
          return
        }
        if (fabPhaseRef.current === 'menuOpen') return
        if (currentRightRef.current >= SNAP_THRESHOLD) {
          snapToExpanded()
        } else {
          snapToPeeking()
        }
      },
    })
  ).current

  // ── Screen-level handlers ───────────────────────────────────────────────
  function handleSegmentChange(nextSegment: Segment) {
    if (nextSegment === 'foryou') setFeedMounted(true)
    setSegment(nextSegment)
  }

  function openHappeningComposer() {
    closeFabMenu()
    setShowHappeningComposer(true)
  }

  function openSmartPicks() {
    closeFabMenu()
    router.push('/discover')
  }

  useEffect(() => {
    if (typeof params.community === 'string' && params.community && segment !== 'explore') {
      setSegment('explore')
    }
  }, [params.community, segment])

  // ── Derived layout ──────────────────────────────────────────────────────
  const fabBottom = Math.max(insets.bottom + Spacing.sm, Spacing.lg)
  const menuBottom = fabBottom + FAB_SIZE + 16

  // Dot centering: as width animates 5→22, left must go 17.5→9 to stay centred in 40px glyph
  const dot13Width  = menuProgress.interpolate({ inputRange: [0, 1], outputRange: [5, 22] })
  const dot13Height = menuProgress.interpolate({ inputRange: [0, 1], outputRange: [5, 3] })
  const dot13Radius = menuProgress.interpolate({ inputRange: [0, 1], outputRange: [2.5, 1.5] })
  const dot13Left   = menuProgress.interpolate({ inputRange: [0, 1], outputRange: [17.5, 9] })
  const dot13Top    = menuProgress.interpolate({ inputRange: [0, 1], outputRange: [17.5, 18.5] })

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <View style={styles.notifPlaceholder} />
        <View style={styles.pillTrack}>
          <PillBtn
            label={t('home.explore')}
            active={segment === 'explore'}
            onPress={() => handleSegmentChange('explore')}
          />
          <PillBtn
            label={t('home.for_you')}
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

      {/* Backdrop — behind action items and FAB, closes menu on tap */}
      {fabMenuOpen && (
        <TouchableOpacity
          style={[StyleSheet.absoluteFillObject, styles.peekBackdrop]}
          activeOpacity={1}
          onPress={closeFabMenu}
        />
      )}

      {/* Action items — mounted while menu is open (including close animation) */}
      {fabMenuOpen && (
        <View style={[styles.peekActionMenu, { bottom: menuBottom }]} pointerEvents="box-none">
          {showSmartPicksAction && (
            <Animated.View style={[styles.actionRow, {
              opacity: item1Anim,
              transform: [
                { translateX: item1Anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) },
                { scale:      item1Anim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) },
              ],
            }]}>
              <TouchableOpacity style={styles.actionBtn} onPress={openSmartPicks} activeOpacity={0.82}>
                <Ionicons name="sparkles" size={20} color={FAB_COLOR} />
              </TouchableOpacity>
              <View style={styles.actionLabel}>
                <Text style={styles.actionLabelText}>{t('home.smart_picks')}</Text>
              </View>
            </Animated.View>
          )}
          <Animated.View style={[styles.actionRow, {
            opacity: item2Anim,
            transform: [
              { translateX: item2Anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) },
              { scale:      item2Anim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) },
            ],
          }]}>
            <TouchableOpacity style={styles.actionBtn} onPress={openHappeningComposer} activeOpacity={0.82}>
              <Ionicons name="add" size={22} color={FAB_COLOR} />
            </TouchableOpacity>
            <View style={styles.actionLabel}>
              <Text style={styles.actionLabelText}>{t('home.new_happening')}</Text>
            </View>
          </Animated.View>
        </View>
      )}

      {/* Peek FAB */}
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.peekFab,
          {
            bottom: fabBottom,
            right: rightAnim,
            transform: [
              { rotate: rotateAnim.interpolate({ inputRange: [-12, 0], outputRange: ['-12deg', '0deg'] }) },
              { translateX: hintAnim },
            ],
          },
        ]}
      >
        {/* Inner glyph counter-rotates so dots stay upright while button tilts */}
        <Animated.View style={[styles.glyphContainer, {
          transform: [
            { rotate: rotateAnim.interpolate({ inputRange: [-12, 0], outputRange: ['12deg', '0deg'] }) },
          ],
        }]}>
          {/* Dot 1 — morphs to top arm of cross */}
          <Animated.View style={{
            position: 'absolute',
            backgroundColor: Colors.white,
            width: dot13Width,
            height: dot13Height,
            borderRadius: dot13Radius,
            left: dot13Left,
            top: dot13Top,
            transform: [
              { translateY: menuProgress.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) },
              { rotate:     menuProgress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] }) },
            ],
          }} />
          {/* Dot 2 — fades out */}
          <Animated.View style={{
            position: 'absolute',
            backgroundColor: Colors.white,
            width: 5,
            height: 5,
            borderRadius: 2.5,
            left: 17.5,
            top: 17.5,
            opacity: menuProgress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
          }} />
          {/* Dot 3 — morphs to bottom arm of cross */}
          <Animated.View style={{
            position: 'absolute',
            backgroundColor: Colors.white,
            width: dot13Width,
            height: dot13Height,
            borderRadius: dot13Radius,
            left: dot13Left,
            top: dot13Top,
            transform: [
              { translateY: menuProgress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
              { rotate:     menuProgress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-45deg'] }) },
            ],
          }} />
        </Animated.View>
      </Animated.View>

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

const styles = StyleSheet.create({
  root:             { flex: 1, backgroundColor: Colors.gray[50] },
  content:          { flex: 1 },
  screenPane:       { flex: 1 },
  hiddenPane:       { display: 'none' },
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

  // ── Peek FAB ─────────────────────────────────────────────────────────────
  peekBackdrop: {
    zIndex: 10,
    elevation: 10,
    backgroundColor: 'rgba(15,13,9,0.22)',
  },
  peekActionMenu: {
    position: 'absolute',
    right: SNAP_RIGHT,
    zIndex: 15,
    elevation: 14,
    flexDirection: 'column',
    gap: 10,
    alignItems: 'flex-end',
  },
  actionRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  actionBtn: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#EFEBE2',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 12,
    elevation: 4,
  },
  actionLabel: {
    backgroundColor: '#1A1710',
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: 10,
  },
  actionLabelText: {
    color: Colors.white,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
  peekFab: {
    position: 'absolute',
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_RADIUS,
    backgroundColor: FAB_COLOR,
    zIndex: 20,
    elevation: 16,
    shadowColor: FAB_COLOR,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyphContainer: {
    width: 40,
    height: 40,
  },
})
