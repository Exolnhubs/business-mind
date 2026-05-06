import { useEffect, useMemo, useRef } from 'react'
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native'
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg'

const BG = '#080604'
const PHONE_EDGE = '#111111'
const STATUS = '#F5EDD8'
const AMBER = '#FFB038'
const ORANGE = '#E8720F'
const DEEP_ORANGE = '#BF5800'
const MUTED = '#5A5044'
const DOT_REST = '#2C2820'

const HERO_DELAY_MS = 120
const HERO_IN_MS = 980
const HERO_HOVER_MS = 820
const SHATTER_MS = 780
const LOGO_DELAY_MS = HERO_DELAY_MS + HERO_IN_MS + HERO_HOVER_MS + 420
const DOTS_DELAY_MS = LOGO_DELAY_MS + 560
const EXIT_DELAY_MS = DOTS_DELAY_MS + 1500

type AnimatedSplashProps = {
  onFinish: () => void
}

type MiniTicket = {
  angle: string
  distanceX: number
  distanceY: number
  rotation: string
  size: number
}

type Floater = {
  angle: string
  delay: number
  duration: number
  left: number
  size: number
  top: number
  travel: number
}

type TicketSvgProps = {
  darkBack?: boolean
  height: number
  id: string
  width: number
}

const MINI_TICKETS: MiniTicket[] = [
  { angle: '-18deg', distanceX: -122, distanceY: -96, rotation: '-128deg', size: 52 },
  { angle: '22deg', distanceX: -74, distanceY: -148, rotation: '116deg', size: 42 },
  { angle: '44deg', distanceX: 22, distanceY: -168, rotation: '182deg', size: 48 },
  { angle: '-32deg', distanceX: 118, distanceY: -116, rotation: '-164deg', size: 54 },
  { angle: '12deg', distanceX: 146, distanceY: -24, rotation: '138deg', size: 38 },
  { angle: '-48deg', distanceX: 108, distanceY: 74, rotation: '-104deg', size: 45 },
  { angle: '32deg', distanceX: 30, distanceY: 126, rotation: '156deg', size: 56 },
  { angle: '-12deg', distanceX: -68, distanceY: 122, rotation: '-146deg', size: 40 },
  { angle: '52deg', distanceX: -142, distanceY: 42, rotation: '112deg', size: 47 },
  { angle: '-36deg', distanceX: -164, distanceY: -32, rotation: '-172deg', size: 35 },
  { angle: '18deg', distanceX: 76, distanceY: -72, rotation: '96deg', size: 31 },
  { angle: '-22deg', distanceX: -34, distanceY: -88, rotation: '-118deg', size: 34 },
  { angle: '38deg', distanceX: 46, distanceY: 88, rotation: '132deg', size: 37 },
  { angle: '-8deg', distanceX: -96, distanceY: 86, rotation: '-88deg', size: 32 },
]

const FLOATERS: Floater[] = [
  { angle: '-12deg', delay: 0, duration: 3600, left: 0.12, size: 34, top: 0.15, travel: 16 },
  { angle: '16deg', delay: 220, duration: 4200, left: 0.74, size: 28, top: 0.18, travel: 18 },
  { angle: '28deg', delay: 440, duration: 3900, left: 0.18, size: 26, top: 0.58, travel: 14 },
  { angle: '-24deg', delay: 660, duration: 4500, left: 0.78, size: 38, top: 0.6, travel: 20 },
  { angle: '10deg', delay: 880, duration: 4100, left: 0.52, size: 24, top: 0.22, travel: 12 },
  { angle: '-18deg', delay: 1100, duration: 4700, left: 0.42, size: 30, top: 0.72, travel: 16 },
]

function TicketSvg({ darkBack = false, height, id, width }: TicketSvgProps) {
  const fillStart = darkBack ? '#5A2D0A' : '#FFD264'
  const fillMid = darkBack ? '#3D1F07' : ORANGE
  const fillEnd = darkBack ? '#261305' : '#A03C08'
  const border = darkBack ? 'rgba(120,60,10,0.35)' : 'rgba(255,220,120,0.58)'
  const contentOpacity = darkBack ? 0 : 1

  return (
    <Svg width={width} height={height} viewBox="0 0 160 68">
      <Defs>
        <LinearGradient id={`${id}-fill`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={fillStart} stopOpacity="0.96" />
          <Stop offset="0.45" stopColor={fillMid} stopOpacity="0.92" />
          <Stop offset="1" stopColor={fillEnd} stopOpacity="0.86" />
        </LinearGradient>
        <LinearGradient id={`${id}-shine`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.25" />
          <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.06" />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </LinearGradient>
      </Defs>

      <Path
        d="M16 2H144C151.7 2 158 8.3 158 16V18C148.8 18 141.5 25.3 141.5 34C141.5 42.7 148.8 50 158 50V52C158 59.7 151.7 66 144 66H16C8.3 66 2 59.7 2 52V50C11.2 50 18.5 42.7 18.5 34C18.5 25.3 11.2 18 2 18V16C2 8.3 8.3 2 16 2Z"
        fill={`url(#${id}-fill)`}
        stroke={border}
        strokeWidth="1.5"
      />
      <Path
        d="M16 2H144C151.7 2 158 8.3 158 16V18C148.8 18 141.5 25.3 141.5 34C141.5 42.7 148.8 50 158 50V52C158 59.7 151.7 66 144 66H16C8.3 66 2 59.7 2 52V50C11.2 50 18.5 42.7 18.5 34C18.5 25.3 11.2 18 2 18V16C2 8.3 8.3 2 16 2Z"
        fill={`url(#${id}-shine)`}
        opacity={contentOpacity}
      />
      <Path
        d="M28 34H132"
        stroke="#FFFFFF"
        strokeDasharray="3 4"
        strokeOpacity={0.2 * contentOpacity}
        strokeWidth="1"
      />
      <SvgText
        x="80"
        y="23"
        fill="#FFFFFF"
        fillOpacity={0.6 * contentOpacity}
        fontSize="17"
        fontWeight="800"
        textAnchor="middle"
      >
        RAWAQ
      </SvgText>
      <Circle cx="70" cy="47" r="2.3" fill="#FFFFFF" fillOpacity={0.25 * contentOpacity} />
      <Circle cx="80" cy="47" r="2.3" fill="#FFFFFF" fillOpacity={0.25 * contentOpacity} />
      <Circle cx="90" cy="47" r="2.3" fill="#FFFFFF" fillOpacity={0.25 * contentOpacity} />
      <Circle cx="2" cy="34" r="19" fill={BG} fillOpacity="0.92" />
      <Circle cx="158" cy="34" r="19" fill={BG} fillOpacity="0.92" />
    </Svg>
  )
}

function StatusGlyphs() {
  return (
    <View style={styles.statusGlyphs}>
      <Svg width={17} height={12} viewBox="0 0 21 15">
        <Path d="M1 5.5C4 2.5 7.5 1 10.5 1S17 2.5 20 5.5" stroke={STATUS} strokeWidth="1.5" opacity="0.4" fill="none" />
        <Path d="M3.5 8C6 5.5 8.5 4 10.5 4s4.5 1.5 7 4" stroke={STATUS} strokeWidth="1.5" opacity="0.7" fill="none" />
        <Path d="M6 10.5c1.5-1.5 3-2.5 4.5-2.5s3 1 4.5 2.5" stroke={STATUS} strokeWidth="1.5" fill="none" />
        <Circle cx="10.5" cy="13.5" r="1.5" fill={STATUS} />
      </Svg>
      <Svg width={17} height={12} viewBox="0 0 25 12">
        <Rect x="0" y="3" width="3" height="6" rx="1" fill={STATUS} opacity="0.4" />
        <Rect x="4.5" y="2" width="3" height="8" rx="1" fill={STATUS} opacity="0.6" />
        <Rect x="9" y="0" width="3" height="12" rx="1" fill={STATUS} opacity="0.8" />
        <Rect x="13.5" y="0" width="3" height="12" rx="1" fill={STATUS} />
        <Rect x="18" y="0" width="4.5" height="12" rx="2" fill={STATUS} opacity="0.15" stroke={STATUS} strokeWidth="1" />
        <Rect x="23" y="4" width="2" height="4" rx="1" fill={STATUS} opacity="0.4" />
      </Svg>
    </View>
  )
}

export function AnimatedSplash({ onFinish }: AnimatedSplashProps) {
  const { width, height } = useWindowDimensions()
  const screenOpacity = useRef(new Animated.Value(1)).current
  const bgPulse = useRef(new Animated.Value(0)).current
  const hero = useRef(new Animated.Value(0)).current
  const shatter = useRef(new Animated.Value(0)).current
  const flash = useRef(new Animated.Value(0)).current
  const logo = useRef(new Animated.Value(0)).current
  const dotsReveal = useRef(new Animated.Value(0)).current
  const dotPulses = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current
  const floaterPulses = useRef(FLOATERS.map(() => new Animated.Value(0))).current

  const stage = useMemo(() => {
    const designWidth = 390
    const designHeight = 844
    const scale = Math.min(width / designWidth, height / designHeight)
    const stageWidth = designWidth * scale
    const stageHeight = designHeight * scale

    return {
      centerX: stageWidth / 2,
      centerY: stageHeight * 0.46,
      height: stageHeight,
      scale,
      width: stageWidth,
    }
  }, [height, width])

  useEffect(() => {
    const loops: Animated.CompositeAnimation[] = []

    const bgLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bgPulse, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(bgPulse, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    )
    loops.push(bgLoop)
    bgLoop.start()

    dotPulses.forEach((dot, index) => {
      const dotLoop = Animated.loop(
        Animated.sequence([
          Animated.delay(index * 180),
          Animated.timing(dot, {
            toValue: 1,
            duration: 490,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: 910,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      )
      loops.push(dotLoop)
      dotLoop.start()
    })

    floaterPulses.forEach((pulse, index) => {
      const floater = FLOATERS[index]
      const floaterLoop = Animated.loop(
        Animated.sequence([
          Animated.delay(floater.delay),
          Animated.timing(pulse, {
            toValue: 1,
            duration: floater.duration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 0,
            duration: floater.duration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      )
      loops.push(floaterLoop)
      floaterLoop.start()
    })

    Animated.sequence([
      Animated.delay(HERO_DELAY_MS),
      Animated.timing(hero, {
        toValue: 1,
        duration: HERO_IN_MS + HERO_HOVER_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start()

    Animated.sequence([
      Animated.delay(HERO_DELAY_MS + HERO_IN_MS + HERO_HOVER_MS),
      Animated.parallel([
        Animated.timing(shatter, {
          toValue: 1,
          duration: SHATTER_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(flash, {
            toValue: 1,
            duration: 90,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(flash, {
            toValue: 0,
            duration: 260,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start()

    Animated.sequence([
      Animated.delay(LOGO_DELAY_MS),
      Animated.timing(logo, {
        toValue: 1,
        duration: 800,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
        useNativeDriver: true,
      }),
    ]).start()

    Animated.sequence([
      Animated.delay(DOTS_DELAY_MS),
      Animated.timing(dotsReveal, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start()

    let fadeFallback: ReturnType<typeof setTimeout> | null = null
    let didFinish = false

    function finishOnce() {
      if (didFinish) return
      didFinish = true
      onFinish()
    }

    const timer = setTimeout(() => {
      Animated.timing(screenOpacity, {
        toValue: 0,
        duration: 420,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start(finishOnce)
      fadeFallback = setTimeout(finishOnce, 700)
    }, EXIT_DELAY_MS)

    return () => {
      clearTimeout(timer)
      if (fadeFallback) clearTimeout(fadeFallback)
      loops.forEach((loop) => loop.stop())
    }
  }, [bgPulse, dotPulses, dotsReveal, flash, floaterPulses, hero, logo, onFinish, screenOpacity, shatter])

  const heroTranslateY = hero.interpolate({
    inputRange: [0, 0.56, 1],
    outputRange: [stage.height * 0.72, 0, 8 * stage.scale],
  })
  const heroTranslateX = hero.interpolate({
    inputRange: [0, 0.35, 0.56, 1],
    outputRange: [-44 * stage.scale, 26 * stage.scale, 0, 0],
  })
  const heroRotate = hero.interpolate({
    inputRange: [0, 0.56, 1],
    outputRange: ['630deg', '0deg', '4deg'],
  })
  const heroScale = hero.interpolate({
    inputRange: [0, 0.56, 0.8, 1],
    outputRange: [0.38, 1, 1.05, 1],
  })
  const heroFlip = hero.interpolate({
    inputRange: [0, 0.16, 0.3, 0.44, 0.56, 0.76, 1],
    outputRange: [1, -0.2, 0.94, -0.34, 1, 0.82, 1],
  })
  const heroOpacity = Animated.multiply(
    hero.interpolate({ inputRange: [0, 0.18, 0.92, 1], outputRange: [0, 1, 1, 1] }),
    shatter.interpolate({ inputRange: [0, 0.03, 1], outputRange: [1, 0, 0] })
  )
  const ringOpacity = bgPulse.interpolate({ inputRange: [0, 1], outputRange: [0.1, 0.34] })
  const logoTranslateY = logo.interpolate({ inputRange: [0, 1], outputRange: [20, 0] })
  const logoScale = logo.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] })

  return (
    <Animated.View style={[styles.root, { opacity: screenOpacity }]} pointerEvents="none">
      <View style={[styles.phone, { width: stage.width, height: stage.height, borderRadius: 54 * stage.scale, padding: 3 * stage.scale }]}>
        <View style={[styles.phoneInner, { borderRadius: 52 * stage.scale }]}>
          <View style={styles.radialCore} />
          {[0, 1, 2, 3, 4].map((index) => {
            const diameter = (120 + index * 128) * stage.scale
            const ringScale = bgPulse.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 1 + (index + 1) * 0.025],
            })

            return (
              <Animated.View
                key={index}
                style={[
                  styles.ring,
                  {
                    borderRadius: diameter / 2,
                    height: diameter,
                    left: stage.centerX - diameter / 2,
                    opacity: ringOpacity,
                    top: stage.centerY - diameter / 2,
                    transform: [{ scale: ringScale }],
                    width: diameter,
                  },
                ]}
              />
            )
          })}

          {FLOATERS.map((floater, index) => {
            const pulse = floaterPulses[index]
            const floaterSize = floater.size * stage.scale
            const translateY = pulse.interpolate({
              inputRange: [0, 1],
              outputRange: [floater.travel * stage.scale, -floater.travel * stage.scale],
            })
            const opacity = logo.interpolate({ inputRange: [0, 1], outputRange: [0, 0.18] })
            const rotate = pulse.interpolate({ inputRange: [0, 1], outputRange: [floater.angle, `${parseInt(floater.angle, 10) + 10}deg`] })

            return (
              <Animated.View
                key={index}
                style={[
                  styles.floater,
                  {
                    left: stage.width * floater.left - floaterSize / 2,
                    opacity,
                    top: stage.height * floater.top,
                    transform: [{ translateY }, { rotate }],
                  },
                ]}
              >
                <TicketSvg id={`floater-${index}`} width={floaterSize} height={floaterSize * 0.425} darkBack={index % 2 === 0} />
              </Animated.View>
            )
          })}

          <Animated.View
            style={[
              styles.heroGlow,
              {
                height: 300 * stage.scale,
                left: stage.centerX - 150 * stage.scale,
                opacity: heroOpacity,
                top: stage.centerY - 150 * stage.scale,
                transform: [{ scale: bgPulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.12] }) }],
                width: 300 * stage.scale,
              },
            ]}
          />
          <Animated.View
            style={[
              styles.heroTicket,
              {
                left: stage.centerX - 80 * stage.scale,
                opacity: heroOpacity,
                top: stage.centerY - 34 * stage.scale,
                transform: [
                  { translateX: heroTranslateX },
                  { translateY: heroTranslateY },
                  { rotate: heroRotate },
                  { scale: heroScale },
                  { scaleX: heroFlip },
                ],
              },
            ]}
          >
            <TicketSvg id="hero" width={160 * stage.scale} height={68 * stage.scale} />
          </Animated.View>

          {MINI_TICKETS.map((mini, index) => {
            const ticketWidth = mini.size * stage.scale
            const translateX = shatter.interpolate({
              inputRange: [0, 0.15, 1],
              outputRange: [0, mini.distanceX * 0.35 * stage.scale, mini.distanceX * stage.scale],
            })
            const translateY = shatter.interpolate({
              inputRange: [0, 0.28, 1],
              outputRange: [0, mini.distanceY * stage.scale, (mini.distanceY + 122) * stage.scale],
            })
            const opacity = shatter.interpolate({
              inputRange: [0, 0.08, 0.75, 1],
              outputRange: [0, 0.95, 0.65, 0],
            })
            const rotate = shatter.interpolate({
              inputRange: [0, 1],
              outputRange: [mini.angle, mini.rotation],
            })
            const scale = shatter.interpolate({
              inputRange: [0, 0.15, 1],
              outputRange: [0.55, 1, 0.72],
            })

            return (
              <Animated.View
                key={index}
                style={[
                  styles.miniTicket,
                  {
                    left: stage.centerX - ticketWidth / 2,
                    opacity,
                    top: stage.centerY - ticketWidth * 0.22,
                    transform: [{ translateX }, { translateY }, { rotate }, { scale }],
                  },
                ]}
              >
                <TicketSvg id={`mini-${index}`} width={ticketWidth} height={ticketWidth * 0.425} darkBack={index % 3 === 0} />
              </Animated.View>
            )
          })}

          <Animated.View
            style={[
              styles.flash,
              {
                height: 360 * stage.scale,
                left: stage.centerX - 180 * stage.scale,
                opacity: flash,
                top: stage.centerY - 180 * stage.scale,
                width: 360 * stage.scale,
              },
            ]}
          />

          <Animated.View
            style={[
              styles.logoWrap,
              {
                opacity: logo,
                transform: [{ translateY: logoTranslateY }, { scale: logoScale }],
              },
            ]}
          >
            <Svg width={240 * stage.scale} height={96 * stage.scale} viewBox="0 0 240 96">
              <Defs>
                <LinearGradient id="logo-gradient" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0" stopColor="#FFE8A0" />
                  <Stop offset="0.28" stopColor={AMBER} />
                  <Stop offset="0.6" stopColor={ORANGE} />
                  <Stop offset="1" stopColor={DEEP_ORANGE} />
                </LinearGradient>
                <LinearGradient id="rule-gradient" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0" stopColor={AMBER} stopOpacity="0" />
                  <Stop offset="0.32" stopColor={AMBER} stopOpacity="0.33" />
                  <Stop offset="0.5" stopColor="#FFE090" stopOpacity="0.54" />
                  <Stop offset="0.68" stopColor={AMBER} stopOpacity="0.33" />
                  <Stop offset="1" stopColor={AMBER} stopOpacity="0" />
                </LinearGradient>
              </Defs>
              <SvgText x="120" y="50" fill="url(#logo-gradient)" fontSize="58" fontWeight="900" letterSpacing="-3.5" textAnchor="middle">
                RAWAQ
              </SvgText>
              <Rect x="40" y="61" width="160" height="1.5" rx="1" fill="url(#rule-gradient)" />
              <SvgText x="120" y="84" fill={MUTED} fontSize="12" fontWeight="600" letterSpacing="3" textAnchor="middle">
                Find your people
              </SvgText>
            </Svg>
          </Animated.View>

          <Animated.View style={[styles.dotsWrap, { bottom: 70 * stage.scale, opacity: dotsReveal }]}>
            {[0, 1, 2].map((index) => {
              const pulse = dotPulses[index]
              const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] })
              const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] })

              return (
                <Animated.View
                  key={index}
                  style={[
                    styles.dot,
                    {
                      backgroundColor: index === 0 ? ORANGE : DOT_REST,
                      opacity,
                      transform: [{ scale }],
                    },
                  ]}
                />
              )
            })}
          </Animated.View>

          <View style={[styles.homeBar, { bottom: 8 * stage.scale, width: 134 * stage.scale, height: 5 * stage.scale, borderRadius: 3 * stage.scale }]} />
        </View>
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: '#070604',
    justifyContent: 'center',
    zIndex: 999,
  },
  phone: {
    backgroundColor: PHONE_EDGE,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 40 },
    shadowOpacity: 0.9,
    shadowRadius: 60,
  },
  phoneInner: {
    backgroundColor: BG,
    flex: 1,
    overflow: 'hidden',
  },
  radialCore: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(28,18,8,0.28)',
  },
  ring: {
    borderColor: ORANGE,
    borderWidth: 1,
    position: 'absolute',
  },
  island: {
    alignSelf: 'center',
    backgroundColor: '#000000',
    position: 'absolute',
    zIndex: 20,
  },
  statusBar: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 19,
  },
  statusGlyphs: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  heroGlow: {
    backgroundColor: 'rgba(255,176,56,0.16)',
    borderRadius: 999,
    position: 'absolute',
  },
  heroTicket: {
    position: 'absolute',
    zIndex: 5,
  },
  miniTicket: {
    position: 'absolute',
    zIndex: 6,
  },
  floater: {
    position: 'absolute',
    zIndex: 3,
  },
  flash: {
    backgroundColor: 'rgba(255,200,80,0.55)',
    borderRadius: 999,
    position: 'absolute',
    zIndex: 7,
  },
  logoWrap: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 10,
  },
  dotsWrap: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 7,
    position: 'absolute',
    zIndex: 11,
  },
  dot: {
    borderRadius: 3,
    height: 6,
    shadowColor: ORANGE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    width: 6,
  },
  homeBar: {
    alignSelf: 'center',
    backgroundColor: STATUS,
    opacity: 0.25,
    position: 'absolute',
    zIndex: 20,
  },
})
