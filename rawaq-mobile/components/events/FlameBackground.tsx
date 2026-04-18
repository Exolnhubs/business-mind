import React, { useEffect, useRef } from 'react'
import { Animated, StyleSheet, View } from 'react-native'
import Svg, { Path, Defs, LinearGradient as SvgGrad, Stop } from 'react-native-svg'

// Flame silhouette — 60×120 viewBox, tip near top (y≈2), base at bottom (y≈118)
const OUTER =
  'M30,118 C10,100 0,75 5,52 C8,35 15,22 18,10 C22,2 27,0 30,2 C33,0 38,2 42,10 C45,22 52,35 55,52 C60,75 50,100 30,118 Z'

const INNER =
  'M30,118 C15,102 7,80 11,58 C14,42 20,30 22,18 C24,8 27,4 30,6 C33,4 36,8 38,18 C40,30 46,42 49,58 C53,80 45,102 30,118 Z'

interface ColDef {
  left: `${number}%`
  h: number
  delay: number
  floatD: number
  swayD: number
  swayA: number
}

const COLS: ColDef[] = [
  { left: '6%',  h: 100, delay: 0,   floatD: 1050, swayD: 1800, swayA: 5 },
  { left: '19%', h: 128, delay: 240, floatD: 1200, swayD: 2100, swayA: 7 },
  { left: '33%', h: 148, delay: 80,  floatD: 980,  swayD: 1950, swayA: 6 },
  { left: '50%', h: 160, delay: 350, floatD: 1150, swayD: 2250, swayA: 8 },
  { left: '64%', h: 138, delay: 140, floatD: 1080, swayD: 1900, swayA: 7 },
  { left: '78%', h: 118, delay: 480, floatD: 1180, swayD: 2050, swayA: 5 },
  { left: '92%', h: 95,  delay: 320, floatD: 1020, swayD: 1850, swayA: 4 },
]

interface FlameColumnProps extends ColDef { idx: number }

function FlameColumn({ left, h, delay, floatD, swayD, swayA, idx }: FlameColumnProps) {
  const floatY  = useRef(new Animated.Value(0)).current
  const swayX   = useRef(new Animated.Value(0)).current
  const flicker = useRef(new Animated.Value(0.82)).current

  useEffect(() => {
    const floatAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(floatY, { toValue: -(h * 0.14), duration: floatD,                    useNativeDriver: true, delay }),
        Animated.timing(floatY, { toValue: 0,           duration: Math.round(floatD * 0.85), useNativeDriver: true }),
      ])
    )
    const swayAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(swayX, { toValue: swayA,           duration: swayD,                    useNativeDriver: true, delay: delay + 180 }),
        Animated.timing(swayX, { toValue: -(swayA * 0.7), duration: Math.round(swayD * 1.2), useNativeDriver: true }),
        Animated.timing(swayX, { toValue: swayA * 0.4,    duration: Math.round(swayD * 0.8), useNativeDriver: true }),
      ])
    )
    // Irregular flicker via a 4-step sequence that never fully resolves to the same value
    const flickerAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(flicker, { toValue: 0.96, duration: Math.round(floatD * 0.38), useNativeDriver: true, delay }),
        Animated.timing(flicker, { toValue: 0.58, duration: Math.round(floatD * 0.28), useNativeDriver: true }),
        Animated.timing(flicker, { toValue: 0.86, duration: Math.round(floatD * 0.20), useNativeDriver: true }),
        Animated.timing(flicker, { toValue: 0.68, duration: Math.round(floatD * 0.14), useNativeDriver: true }),
      ])
    )

    floatAnim.start()
    swayAnim.start()
    flickerAnim.start()

    return () => { floatAnim.stop(); swayAnim.stop(); flickerAnim.stop() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const w = Math.round(h * 0.5)
  const go = `fgo${idx}`
  const gi = `fgi${idx}`

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        bottom: 0,
        left,
        marginLeft: -w / 2,
        width: w,
        height: h,
        opacity: flicker,
        transform: [{ translateY: floatY }, { translateX: swayX }],
      }}
    >
      <Svg width={w} height={h} viewBox="0 0 60 120">
        <Defs>
          {/* Outer flame: dark red base → orange → amber tip */}
          <SvgGrad id={go} x1="0" y1="1" x2="0" y2="0">
            <Stop offset="0"    stopColor="#7C1D1D" stopOpacity="1" />
            <Stop offset="0.28" stopColor="#C2410C" stopOpacity="1" />
            <Stop offset="0.62" stopColor="#F97316" stopOpacity="0.95" />
            <Stop offset="1"    stopColor="#FDE68A" stopOpacity="0.72" />
          </SvgGrad>
          {/* Inner bright highlight: transparent base → amber → pale yellow tip */}
          <SvgGrad id={gi} x1="0" y1="1" x2="0" y2="0">
            <Stop offset="0"    stopColor="#EA580C" stopOpacity="0" />
            <Stop offset="0.45" stopColor="#FBBF24" stopOpacity="0.48" />
            <Stop offset="1"    stopColor="#FEF9C3" stopOpacity="0.78" />
          </SvgGrad>
        </Defs>
        <Path d={OUTER} fill={`url(#${go})`} />
        <Path d={INNER} fill={`url(#${gi})`} />
      </Svg>
    </Animated.View>
  )
}

export function FlameBackground() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {COLS.map((col, i) => (
        <FlameColumn key={i} {...col} idx={i} />
      ))}
    </View>
  )
}
