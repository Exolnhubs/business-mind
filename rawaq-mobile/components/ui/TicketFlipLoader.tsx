import { useEffect, useRef, useState } from 'react'
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Colors, Radius, Spacing } from '@/theme'

export type TicketFlipLoaderSize = 'sm' | 'md' | 'lg'

interface TicketFlipLoaderProps {
  size?: TicketFlipLoaderSize
  label?: string
}

const DIMENSIONS = {
  sm: { w: 130, h: 174, pad: 10, headerGap: 8, barTitle: 10, barSub: 7, qr: 34 },
  md: { w: 180, h: 240, pad: 14, headerGap: 12, barTitle: 13, barSub: 9, qr: 46 },
  lg: { w: 240, h: 320, pad: 18, headerGap: 16, barTitle: 17, barSub: 12, qr: 60 },
} as const

const PAPER    = '#f4ead9'  // warm cream
const PAPER_2  = '#e7d7b8'  // warm cream, shade down
const BAR      = '#d9c9a9'
const BAR_DIM  = '#e6d7b8'
const INK      = '#1f1508'  // warm near-black (mobile palette is in hex; theme uses amber scale)
const INK_SOFT = '#0f0a04'

// Suggestive QR pattern — not a real QR. 5×5 with 3 finder corners.
const QR_PATTERN: ReadonlyArray<ReadonlyArray<0 | 1>> = [
  [1, 1, 0, 1, 1],
  [1, 0, 1, 0, 1],
  [0, 1, 1, 0, 0],
  [1, 0, 0, 1, 0],
  [1, 1, 0, 1, 1],
]

function TicketFace({ dims }: { dims: typeof DIMENSIONS[TicketFlipLoaderSize] }) {
  const qrInner = dims.qr - 6 // minus padding both sides
  const qrCell  = Math.floor((qrInner - 8) / 5) // minus 4 gaps of 2px

  return (
    <>
      {/* Header: gold ✱ mark + RAWAQ wordmark + decorative rule */}
      <View style={[styles.header, { marginBottom: dims.headerGap }]}>
        <Text style={styles.mark}>✱</Text>
        <Text style={styles.wordmark}>RAWAQ</Text>
        <View style={styles.headerRule} />
      </View>

      {/* Skeleton title bars */}
      <View style={{ gap: 6 }}>
        <View style={{
          height: dims.barTitle, width: '78%',
          backgroundColor: BAR, borderRadius: 3,
        }} />
        <View style={{
          height: dims.barSub, width: '56%',
          backgroundColor: BAR, borderRadius: 3,
        }} />
      </View>

      {/* Meta row */}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
        <View style={{ height: 7, width: '38%', backgroundColor: BAR_DIM, borderRadius: 2 }} />
        <View style={{ height: 7, width: '28%', backgroundColor: BAR_DIM, borderRadius: 2 }} />
      </View>

      {/* Perforation: dashed line + circular cutouts on the edges */}
      <View style={[styles.perfRow, { marginHorizontal: -dims.pad, marginTop: 14, marginBottom: 12 }]}>
        <View style={styles.perfCutout} />
        <View style={styles.perfDashed} />
        <View style={[styles.perfCutout, styles.perfCutoutRight]} />
      </View>

      {/* Stub: ticket # lines + QR placeholder */}
      <View style={styles.stub}>
        <View style={styles.stubLines}>
          <View style={{ height: 6, width: '72%', backgroundColor: BAR_DIM, borderRadius: 2 }} />
          <View style={{ height: 6, width: '48%', backgroundColor: BAR_DIM, borderRadius: 2, marginTop: 6 }} />
        </View>
        <View style={[styles.qr, { width: dims.qr, height: dims.qr }]}>
          {QR_PATTERN.map((row, r) => (
            <View key={r} style={styles.qrRow}>
              {row.map((on, c) => (
                <View
                  key={c}
                  style={{
                    width:  qrCell,
                    height: qrCell,
                    backgroundColor: INK,
                    opacity: on ? 0.72 : 0.14,
                    borderRadius: 1,
                  }}
                />
              ))}
            </View>
          ))}
        </View>
      </View>
    </>
  )
}

export function TicketFlipLoader({ size = 'md', label }: TicketFlipLoaderProps) {
  const dims = DIMENSIONS[size]

  const shimmer = useRef(new Animated.Value(0)).current
  const rotate  = useRef(new Animated.Value(0)).current
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    let mounted = true
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled)
    }).catch(() => {})
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      if (mounted) setReduceMotion(enabled)
    })
    return () => {
      mounted = false
      sub?.remove()
    }
  }, [])

  useEffect(() => {
    const shimmerAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    )
    shimmerAnim.start()

    let rotateAnim: Animated.CompositeAnimation | null = null
    if (!reduceMotion) {
      rotateAnim = Animated.loop(
        Animated.timing(rotate, {
          toValue: 1,
          duration: 2600,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        })
      )
      rotateAnim.start()
    } else {
      rotate.setValue(0)
    }

    return () => {
      shimmerAnim.stop()
      rotateAnim?.stop()
    }
  }, [shimmer, rotate, reduceMotion])

  // Flip keyframes: dwell at 0°, flip to -180°, dwell, flip to -360°. Identical
  // faces make the full spin read as "pages turning" rather than "card spinning."
  const rotateY = rotate.interpolate({
    inputRange:  [0,    0.10,  0.45,      0.55,      0.90,      1],
    outputRange: ['0deg', '0deg', '-180deg', '-180deg', '-360deg', '-360deg'],
  })
  const shimmerOpacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] })

  return (
    <View style={styles.stage} accessible accessibilityRole="progressbar" accessibilityLabel={label ?? 'Loading'}>
      {/* Binding dots */}
      <View style={styles.binding}>
        <View style={styles.bindingDot} />
        <View style={styles.bindingDot} />
        <View style={styles.bindingDot} />
      </View>

      {/* Ticket pad shadow behind the flipping page */}
      <View style={[styles.book, { width: dims.w, height: dims.h }]}>
        <View style={[styles.padShadow, { width: dims.w, height: dims.h }]} />

        <Animated.View
          style={[
            styles.flipper,
            {
              width:  dims.w,
              height: dims.h,
              transform: [{ perspective: 1400 }, { rotateY }],
            },
          ]}
        >
          <Animated.View style={[
            styles.face,
            { width: dims.w, height: dims.h, padding: dims.pad, opacity: shimmerOpacity },
          ]}>
            <TicketFace dims={dims} />
          </Animated.View>

          <Animated.View style={[
            styles.face,
            styles.back,
            { width: dims.w, height: dims.h, padding: dims.pad, opacity: shimmerOpacity },
          ]}>
            <TicketFace dims={dims} />
          </Animated.View>
        </Animated.View>
      </View>

      {label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  stage: {
    alignItems: 'center',
    gap: 20,
  },
  binding: {
    flexDirection: 'row',
    gap: 16,
    paddingBottom: 2,
  },
  bindingDot: {
    width: 4,
    height: 4,
    borderRadius: 999,
    backgroundColor: Colors.brand[400],
  },
  book: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  padShadow: {
    position: 'absolute',
    top: 6,
    left: 2,
    backgroundColor: INK_SOFT,
    borderRadius: 10,
    opacity: 0.82,
  },
  flipper: {
    position: 'absolute',
    // Rotation happens around the center of the element. Mobile doesn't
    // support transform-origin; accepting center-axis rotation as the
    // cross-platform trade-off.
  },
  face: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: PAPER,
    borderRadius: 10,
    // Subtle gradient emulation via a darker lower band
    borderBottomWidth: 0,
    overflow: 'hidden',
    // iOS needs backfaceVisibility in camelCase; Android supports it as of RN 0.71+
    backfaceVisibility: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 8,
  },
  back: {
    transform: [{ rotateY: '180deg' }],
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mark: {
    color: Colors.brand[500],
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 14,
    marginTop: -1,
  },
  wordmark: {
    fontSize: 9,
    letterSpacing: 1.4,
    color: Colors.brand[500],
    fontWeight: '800',
  },
  headerRule: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.brand[300],
    opacity: 0.6,
  },

  perfRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  perfDashed: {
    flex: 1,
    height: 1,
    backgroundColor: 'transparent',
    borderStyle: 'dashed',
    borderTopWidth: 1,
    borderColor: INK,
    opacity: 0.28,
  },
  perfCutout: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: PAPER_2,
    marginLeft: -3.5,
  },
  perfCutoutRight: {
    marginLeft: 0,
    marginRight: -3.5,
  },

  stub: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 'auto',
  },
  stubLines: {
    flex: 1,
  },
  qr: {
    padding: 3,
    backgroundColor: PAPER,
    borderWidth: 1,
    borderColor: 'rgba(31,21,8,0.08)',
    borderRadius: 4,
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  qrRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  label: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.2,
    color: Colors.gray[600],
    marginTop: Spacing.xs,
  },
})

// Exported but currently unused — kept for caller convenience if a placement
// wants to match the ticket's border-radius elsewhere.
export const TICKET_LOADER_RADIUS = Radius.md
