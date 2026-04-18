import React, { useEffect, useRef, useState } from 'react'
import { Animated, StyleSheet, View } from 'react-native'
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg'

// ── Timing constants (all co-prime so layers never sync up) ───────────────────
const GLOW_PERIOD  = 2350  // outer base glow — very slow breathe
const BODY_FLOAT   = 1130  // main orange body float
const BODY_SWAY    = 2290  // main body sway (different from float → always async)
const CORE_FLOAT   = 910   // inner amber core — faster than body
const CORE_SWAY    = 1870  // core sway (opposite direction from body)
const TIP_FLICKER  = 510   // yellow-white tip — fastest

// ── Individual animated layers ────────────────────────────────────────────────

// Layer 1 — wide dark-red base glow, breathes slowly, barely moves
// Anchors the flame visually; fills the lower portion of the cover
function OuterGlow({ w, h }: { w: number; h: number }) {
  const scaleX = useRef(new Animated.Value(1)).current

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(scaleX, { toValue: 1.14, duration: GLOW_PERIOD,     useNativeDriver: true }),
        Animated.timing(scaleX, { toValue: 0.90, duration: GLOW_PERIOD * 1.1, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [scaleX])

  // cx/cy in the viewBox (w × h). Base glow sits at the bottom ~80%, wide.
  const cx = w / 2
  const cy = h * 0.82
  const rx = w * 0.50
  const ry = h * 0.32

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { transform: [{ scaleX }] }]}
    >
      <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <Defs>
          <RadialGradient id="rOuter" cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0"    stopColor="#AA1800" stopOpacity="0.92" />
            <Stop offset="0.45" stopColor="#CC2200" stopOpacity="0.52" />
            <Stop offset="1"    stopColor="#AA1800" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="url(#rOuter)" />
      </Svg>
    </Animated.View>
  )
}

// Layer 2 — main orange flame body, gentle float + organic 3-step sway
function FlameBody({ w, h }: { w: number; h: number }) {
  const floatY = useRef(new Animated.Value(0)).current
  const swayX  = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const floatAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(floatY, { toValue: -(h * 0.11), duration: BODY_FLOAT,              useNativeDriver: true }),
        Animated.timing(floatY, { toValue: 0,           duration: Math.round(BODY_FLOAT * 0.88), useNativeDriver: true }),
      ])
    )
    // 3-step sway so the flame doesn't just oscillate mechanically
    const swayAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(swayX, { toValue: w * 0.038,  duration: BODY_SWAY,              useNativeDriver: true }),
        Animated.timing(swayX, { toValue: -(w * 0.030), duration: Math.round(BODY_SWAY * 1.1), useNativeDriver: true }),
        Animated.timing(swayX, { toValue: w * 0.018,  duration: Math.round(BODY_SWAY * 0.7), useNativeDriver: true }),
      ])
    )
    floatAnim.start()
    swayAnim.start()
    return () => { floatAnim.stop(); swayAnim.stop() }
  }, [floatY, swayX, h, w])

  const cx = w / 2
  const cy = h * 0.65          // center of body ellipse, ~65% down
  const rx = w * 0.32
  const ry = h * 0.58

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { transform: [{ translateY: floatY }, { translateX: swayX }] }]}
    >
      <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <Defs>
          <RadialGradient id="rBody" cx="50%" cy="48%" rx="50%" ry="50%">
            <Stop offset="0"    stopColor="#FF5200" stopOpacity="0.96" />
            <Stop offset="0.42" stopColor="#FF6600" stopOpacity="0.58" />
            <Stop offset="1"    stopColor="#FF4400" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="url(#rBody)" />
      </Svg>
    </Animated.View>
  )
}

// Layer 3 — inner amber core, slightly faster + swaying OPPOSITE to body
// The body-vs-core opposition creates the organic "two tongues" shimmer of real fire
function FlameCore({ w, h }: { w: number; h: number }) {
  const floatY = useRef(new Animated.Value(0)).current
  const swayX  = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const floatAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(floatY, { toValue: -(h * 0.15), duration: CORE_FLOAT,              useNativeDriver: true }),
        Animated.timing(floatY, { toValue: 0,           duration: Math.round(CORE_FLOAT * 0.84), useNativeDriver: true }),
      ])
    )
    const swayAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(swayX, { toValue: -(w * 0.030), duration: CORE_SWAY,              useNativeDriver: true }),
        Animated.timing(swayX, { toValue: w * 0.022,   duration: Math.round(CORE_SWAY * 1.15), useNativeDriver: true }),
        Animated.timing(swayX, { toValue: -(w * 0.012), duration: Math.round(CORE_SWAY * 0.75), useNativeDriver: true }),
      ])
    )
    floatAnim.start()
    swayAnim.start()
    return () => { floatAnim.stop(); swayAnim.stop() }
  }, [floatY, swayX, h, w])

  const cx = w / 2
  const cy = h * 0.57
  const rx = w * 0.19
  const ry = h * 0.46

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { transform: [{ translateY: floatY }, { translateX: swayX }] }]}
    >
      <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <Defs>
          <RadialGradient id="rCore" cx="50%" cy="45%" rx="50%" ry="50%">
            <Stop offset="0"    stopColor="#FFAA00" stopOpacity="1" />
            <Stop offset="0.45" stopColor="#FF8800" stopOpacity="0.62" />
            <Stop offset="1"    stopColor="#FF6600" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="url(#rCore)" />
      </Svg>
    </Animated.View>
  )
}

// Layer 4 — bright yellow-white tip, fastest flicker + scale pulse
// The high-frequency flicker gives the "dancing tip" of a real candle/fire
function FlameTip({ w, h }: { w: number; h: number }) {
  const floatY  = useRef(new Animated.Value(0)).current
  const flicker = useRef(new Animated.Value(0.82)).current
  const scale   = useRef(new Animated.Value(1)).current

  useEffect(() => {
    const floatAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(floatY, { toValue: -(h * 0.20), duration: Math.round(TIP_FLICKER * 1.5), useNativeDriver: true }),
        Animated.timing(floatY, { toValue: 0,           duration: TIP_FLICKER,                    useNativeDriver: true }),
      ])
    )
    // Irregular 4-step flicker — mimics real flame opacity noise
    const flickerAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(flicker, { toValue: 1.00, duration: Math.round(TIP_FLICKER * 0.38), useNativeDriver: true }),
        Animated.timing(flicker, { toValue: 0.52, duration: Math.round(TIP_FLICKER * 0.30), useNativeDriver: true }),
        Animated.timing(flicker, { toValue: 0.88, duration: Math.round(TIP_FLICKER * 0.20), useNativeDriver: true }),
        Animated.timing(flicker, { toValue: 0.68, duration: Math.round(TIP_FLICKER * 0.12), useNativeDriver: true }),
      ])
    )
    const scaleAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.18, duration: Math.round(TIP_FLICKER * 0.6), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.85, duration: Math.round(TIP_FLICKER * 0.6), useNativeDriver: true }),
      ])
    )
    floatAnim.start()
    flickerAnim.start()
    scaleAnim.start()
    return () => { floatAnim.stop(); flickerAnim.stop(); scaleAnim.stop() }
  }, [floatY, flicker, scale, h])

  const cx = w / 2
  const cy = h * 0.38
  const rx = w * 0.10
  const ry = h * 0.26

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { opacity: flicker, transform: [{ translateY: floatY }, { scale }] }]}
    >
      <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <Defs>
          <RadialGradient id="rTip" cx="50%" cy="42%" rx="50%" ry="50%">
            <Stop offset="0"    stopColor="#FFF8C0" stopOpacity="1" />
            <Stop offset="0.38" stopColor="#FFD700" stopOpacity="0.75" />
            <Stop offset="1"    stopColor="#FFAA00" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="url(#rTip)" />
      </Svg>
    </Animated.View>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export function FlameBackground() {
  const [size, setSize] = useState({ w: 360, h: 160 })

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout
        setSize({ w: Math.round(width), h: Math.round(height) })
      }}
    >
      <OuterGlow w={size.w} h={size.h} />
      <FlameBody w={size.w} h={size.h} />
      <FlameCore w={size.w} h={size.h} />
      <FlameTip  w={size.w} h={size.h} />
    </View>
  )
}
