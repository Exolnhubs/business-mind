import { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, Text, View, Dimensions } from 'react-native'
import { FontWeight } from '@/theme'

const { height } = Dimensions.get('window')

const BG     = '#0A0806'
const AMBER  = '#FFB038'
const MUTED  = '#7A6E5A'
const MUTED2 = '#4A4338'

interface Props { onFinish: () => void }

export function AnimatedSplash({ onFinish }: Props) {
  const screenOpacity  = useRef(new Animated.Value(0)).current
  const logoOpacity    = useRef(new Animated.Value(0)).current
  const taglineOpacity = useRef(new Animated.Value(0)).current
  const dotsOpacity    = useRef(new Animated.Value(0)).current
  const dotOpacities   = useRef([
    new Animated.Value(1),
    new Animated.Value(1),
    new Animated.Value(1),
  ]).current

  useEffect(() => {
    // Dots pulse continuously from mount (hidden under dotsOpacity wrapper until revealed)
    dotOpacities.forEach((dot, i) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 200),
          Animated.timing(dot, { toValue: 0.45, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(dot, { toValue: 1,    duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ])
      ).start()
    })

    // Screen fades in immediately
    Animated.timing(screenOpacity, {
      toValue: 1, duration: 600, easing: Easing.out(Easing.quad), useNativeDriver: true,
    }).start()

    // Logo: delay 300ms
    Animated.sequence([
      Animated.delay(300),
      Animated.timing(logoOpacity, { toValue: 1, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start()

    // Tagline: delay 800ms
    Animated.sequence([
      Animated.delay(800),
      Animated.timing(taglineOpacity, { toValue: 1, duration: 600, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start()

    // Dots group: delay 1200ms
    Animated.sequence([
      Animated.delay(1200),
      Animated.timing(dotsOpacity, { toValue: 1, duration: 500, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start()

    // Exit at 2400ms
    const timer = setTimeout(() => {
      Animated.timing(screenOpacity, {
        toValue: 0, duration: 450, easing: Easing.in(Easing.quad), useNativeDriver: true,
      }).start(() => onFinish())
    }, 2400)

    return () => clearTimeout(timer)
  }, [])

  return (
    <Animated.View style={[styles.root, { opacity: screenOpacity }]} pointerEvents="none">
      {/* Centered logo + tagline */}
      <View style={styles.center}>
        <Animated.View style={[styles.logoWrap, { opacity: logoOpacity }]}>
          <Text style={styles.wordmark}>RAWAQ.</Text>
          <View style={styles.shimmerLine} />
        </Animated.View>

        <Animated.Text style={[styles.tagline, { opacity: taglineOpacity }]}>
          Find your people.
        </Animated.Text>
      </View>

      {/* Bottom pulsing dots */}
      <Animated.View style={[styles.dotsRow, { opacity: dotsOpacity }]}>
        {[0, 1, 2].map((i) => (
          <Animated.View
            key={i}
            style={[
              styles.dot,
              i === 0 ? styles.dotLead : styles.dotRest,
              { opacity: dotOpacities[i] },
            ]}
          />
        ))}
      </Animated.View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BG,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  center: {
    alignItems: 'center',
    gap: 16,
  },
  logoWrap: {
    alignItems: 'center',
    position: 'relative',
  },
  wordmark: {
    fontSize: 40,
    fontWeight: FontWeight.bold as '700',
    color: AMBER,
    letterSpacing: -1,
    includeFontPadding: false,
  },
  shimmerLine: {
    position: 'absolute',
    bottom: 4,
    width: '80%',
    height: 1.5,
    backgroundColor: 'rgba(255,208,128,0.35)',
    borderRadius: 1,
  },
  tagline: {
    fontSize: 14,
    fontWeight: '500',
    color: MUTED,
    letterSpacing: 0.5,
  },
  dotsRow: {
    position: 'absolute',
    bottom: height * 0.12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  dotLead: {
    width: 20,
    backgroundColor: AMBER,
  },
  dotRest: {
    width: 6,
    backgroundColor: MUTED2,
  },
})
