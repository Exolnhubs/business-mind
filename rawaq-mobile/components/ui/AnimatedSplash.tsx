import { useEffect, useRef } from 'react'
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  Dimensions,
} from 'react-native'
import { FontWeight } from '@/theme'

const { width, height } = Dimensions.get('window')

// ── Palette ───────────────────────────────────────────────────
// Matches the web design system: dark warm ink + amber gold
const INK    = '#1a0d04'              // warm near-black
const GOLD   = '#f59e0b'              // brand amber
const GOLD_B = 'rgba(245,158,11,0.5)' // amber border tint
const GOLD_G = 'rgba(245,158,11,0.08)'// ambient glow fill

// ── Sparkle burst config ──────────────────────────────────────
// 6 sparks evenly at 60° intervals; alternating size + distance
const SPARKS = [0, 60, 120, 180, 240, 300].map((deg, i) => {
  const rad  = (deg * Math.PI) / 180
  const dist = i % 2 === 0 ? 78 : 108
  return {
    tx: Math.sin(rad) * dist,
    ty: -Math.cos(rad) * dist,
    size: i % 3 === 0 ? 7 : i % 3 === 1 ? 5 : 3.5,
    color: i % 2 === 0 ? GOLD : 'rgba(255,255,255,0.75)',
  }
})

const WORD = ['r', 'a', 'w', 'a', 'q']

// ── Types ─────────────────────────────────────────────────────
interface SparkAnim {
  opacity: Animated.Value
  tx: Animated.Value
  ty: Animated.Value
  scale: Animated.Value
}
interface LetterAnim {
  opacity: Animated.Value
  ty: Animated.Value
}

interface Props { onFinish: () => void }

// ─────────────────────────────────────────────────────────────
export function AnimatedSplash({ onFinish }: Props) {

  // Logo block
  const logoScale   = useRef(new Animated.Value(0.45)).current
  const logoOpacity = useRef(new Animated.Value(0)).current
  const logoY       = useRef(new Animated.Value(24)).current

  // ✦ icon slow rotation
  const iconSpin = useRef(new Animated.Value(0)).current

  // 3 concentric rings
  const rings = useRef<{ scale: Animated.Value; opacity: Animated.Value }[]>(
    [0, 1, 2].map(() => ({
      scale:   new Animated.Value(0.25),
      opacity: new Animated.Value(0.8),
    }))
  ).current

  // 6 sparkle dots
  const sparks = useRef<SparkAnim[]>(
    SPARKS.map(() => ({
      opacity: new Animated.Value(0),
      tx:      new Animated.Value(0),
      ty:      new Animated.Value(0),
      scale:   new Animated.Value(0),
    }))
  ).current

  // Letter-by-letter wordmark
  const letters = useRef<LetterAnim[]>(
    WORD.map(() => ({
      opacity: new Animated.Value(0),
      ty:      new Animated.Value(20),
    }))
  ).current

  // Tagline
  const taglineOpacity = useRef(new Animated.Value(0)).current
  const taglineY       = useRef(new Animated.Value(12)).current

  // Whole-screen exit
  const screenOpacity = useRef(new Animated.Value(1)).current
  const screenScale   = useRef(new Animated.Value(1)).current

  useEffect(() => {

    // ── 1. Logo in (spring pop + float up) ───────────────────
    const logoIn = Animated.parallel([
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 4.5,
        tension: 85,
        useNativeDriver: true,
      }),
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 300,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(logoY, {
        toValue: 0,
        duration: 420,
        easing: Easing.out(Easing.back(1.4)),
        useNativeDriver: true,
      }),
    ])

    // ── 2. Icon slow spin (starts with logo, runs independently) ──
    Animated.timing(iconSpin, {
      toValue: 1,
      duration: 2600,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start()

    // ── 3. Rings: staggered ripple outward ────────────────────
    const ringsAnim = Animated.stagger(
      130,
      rings.map((r) =>
        Animated.parallel([
          Animated.timing(r.scale, {
            toValue: 2.6,
            duration: 750,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(r.opacity, {
            toValue: 0,
            duration: 750,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      )
    )

    // ── 4. Sparks: burst outward then fade ────────────────────
    const sparksAnim = Animated.parallel(
      sparks.map((s, i) =>
        Animated.sequence([
          Animated.delay(i * 25),
          Animated.parallel([
            Animated.timing(s.opacity, { toValue: 1, duration: 60, useNativeDriver: true }),
            Animated.timing(s.scale,   { toValue: 1, duration: 220, easing: Easing.out(Easing.back(2.2)), useNativeDriver: true }),
            Animated.timing(s.tx,      { toValue: SPARKS[i].tx, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            Animated.timing(s.ty,      { toValue: SPARKS[i].ty, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          ]),
          Animated.timing(s.opacity, { toValue: 0, duration: 260, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        ])
      )
    )

    // ── 5. Letters: staggered drop-in ────────────────────────
    const lettersAnim = Animated.stagger(
      62,
      letters.map((l) =>
        Animated.parallel([
          Animated.timing(l.opacity, {
            toValue: 1,
            duration: 280,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.spring(l.ty, {
            toValue: 0,
            friction: 7,
            tension: 110,
            useNativeDriver: true,
          }),
        ])
      )
    )

    // ── 6. Tagline slides up and fades in ────────────────────
    const taglineIn = Animated.parallel([
      Animated.timing(taglineOpacity, {
        toValue: 1,
        duration: 380,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(taglineY, {
        toValue: 0,
        duration: 380,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ])

    // ── 7. Exit: fade + slight zoom-in ───────────────────────
    const exitAnim = Animated.parallel([
      Animated.timing(screenOpacity, {
        toValue: 0,
        duration: 400,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(screenScale, {
        toValue: 1.06,
        duration: 400,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ])

    // ── Full sequence ─────────────────────────────────────────
    Animated.sequence([
      logoIn,
      Animated.parallel([
        ringsAnim,
        sparksAnim,
        lettersAnim,
      ]),
      taglineIn,
      Animated.delay(720),
      exitAnim,
    ]).start(() => onFinish())
  }, [])

  const iconRotate = iconSpin.interpolate({
    inputRange:  [0, 1],
    outputRange: ['0deg', '180deg'],
  })

  return (
    <Animated.View
      style={[
        styles.root,
        {
          opacity:   screenOpacity,
          transform: [{ scale: screenScale }],
        },
      ]}
      pointerEvents="none"
    >
      {/* Ambient glow behind logo */}
      <View style={styles.ambientGlow} />

      {/* Ripple rings */}
      {rings.map((r, i) => (
        <Animated.View
          key={`ring-${i}`}
          style={[
            styles.ring,
            {
              opacity:   r.opacity,
              transform: [{ scale: r.scale }],
            },
          ]}
        />
      ))}

      {/* Sparkle dots */}
      {sparks.map((s, i) => (
        <Animated.View
          key={`spark-${i}`}
          style={[
            styles.spark,
            {
              width:     SPARKS[i].size,
              height:    SPARKS[i].size,
              borderRadius: SPARKS[i].size / 2,
              backgroundColor: SPARKS[i].color,
              opacity:   s.opacity,
              transform: [
                { translateX: s.tx },
                { translateY: s.ty },
                { scale:      s.scale },
              ],
            },
          ]}
        />
      ))}

      {/* Logo block */}
      <Animated.View
        style={{
          alignItems: 'center',
          opacity:   logoOpacity,
          transform: [
            { scale:      logoScale },
            { translateY: logoY },
          ],
        }}
      >
        {/* Icon circle */}
        <View style={styles.logoCircle}>
          <Animated.Text
            style={[styles.logoSymbol, { transform: [{ rotate: iconRotate }] }]}
          >
            ✦
          </Animated.Text>
        </View>

        {/* Letter-by-letter wordmark */}
        <View style={styles.wordmarkRow}>
          {WORD.map((ch, i) => (
            <Animated.Text
              key={`l-${i}`}
              style={[
                styles.wordmarkLetter,
                {
                  opacity:   letters[i].opacity,
                  transform: [{ translateY: letters[i].ty }],
                },
              ]}
            >
              {ch}
            </Animated.Text>
          ))}
        </View>
      </Animated.View>

      {/* Tagline */}
      <Animated.Text
        style={[
          styles.tagline,
          {
            opacity:   taglineOpacity,
            transform: [{ translateY: taglineY }],
          },
        ]}
      >
        discover events around you
      </Animated.Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: INK,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },

  // Soft glow orb behind the logo — matches web hero ambient glow
  ambientGlow: {
    position:     'absolute',
    width:        width * 0.72,
    height:       width * 0.72,
    borderRadius: width * 0.36,
    backgroundColor: GOLD_G,
  },

  // Ripple ring — amber stroke
  ring: {
    position:     'absolute',
    width:        152,
    height:       152,
    borderRadius: 76,
    borderWidth:  1.5,
    borderColor:  GOLD_B,
  },

  // Sparkle dot — positioned at center; JS transforms move it
  spark: {
    position: 'absolute',
  },

  // Logo circle with amber tint border
  logoCircle: {
    width:           90,
    height:          90,
    borderRadius:    45,
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderWidth:     1,
    borderColor:     'rgba(245,158,11,0.28)',
    justifyContent:  'center',
    alignItems:      'center',
    marginBottom:    20,
  },

  logoSymbol: {
    fontSize: 38,
    color:    GOLD,
  },

  wordmarkRow: {
    flexDirection: 'row',
    alignItems:    'baseline',
    overflow:      'hidden',
  },

  wordmarkLetter: {
    fontSize:     44,
    fontWeight:   FontWeight.bold,
    color:        '#fff',
    letterSpacing: 2,
    lineHeight:   52,
    includeFontPadding: false,
  },

  tagline: {
    position:     'absolute',
    bottom:       height * 0.13,
    fontSize:     12,
    fontWeight:   FontWeight.medium,
    color:        'rgba(255,255,255,0.42)',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
})
