import { useEffect, useRef } from 'react'
import { Animated, StyleSheet, Text, View, Dimensions } from 'react-native'
import { Colors, FontSize, FontWeight } from '@/theme'

const { width, height } = Dimensions.get('window')

interface Props {
  onFinish: () => void
}

export function AnimatedSplash({ onFinish }: Props) {
  const logoScale   = useRef(new Animated.Value(0.6)).current
  const logoOpacity = useRef(new Animated.Value(0)).current
  const textOpacity = useRef(new Animated.Value(0)).current
  const ringScale   = useRef(new Animated.Value(0.4)).current
  const ringOpacity = useRef(new Animated.Value(0.6)).current
  const fadeOut     = useRef(new Animated.Value(1)).current

  useEffect(() => {
    Animated.sequence([
      // 1. Logo pops in with a spring
      Animated.parallel([
        Animated.spring(logoScale, {
          toValue: 1,
          friction: 5,
          tension: 80,
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]),
      // 2. Ring ripple expands outward
      Animated.parallel([
        Animated.timing(ringScale, {
          toValue: 2.2,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(ringOpacity, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
      // 3. Tagline fades in
      Animated.timing(textOpacity, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      }),
      // 4. Hold
      Animated.delay(600),
      // 5. Whole screen fades out
      Animated.timing(fadeOut, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start(() => onFinish())
  }, [])

  return (
    <Animated.View style={[styles.root, { opacity: fadeOut }]} pointerEvents="none">
      {/* Ripple ring */}
      <Animated.View
        style={[
          styles.ring,
          { transform: [{ scale: ringScale }], opacity: ringOpacity },
        ]}
      />

      {/* Logo mark */}
      <Animated.View style={{ transform: [{ scale: logoScale }], opacity: logoOpacity, alignItems: 'center' }}>
        <View style={styles.logoCircle}>
          <Text style={styles.logoEmoji}>✦</Text>
        </View>
        <Text style={styles.wordmark}>rawaq</Text>
      </Animated.View>

      {/* Tagline */}
      <Animated.Text style={[styles.tagline, { opacity: textOpacity }]}>
        Discover events around you
      </Animated.Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.brand[500],
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  ring: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  logoEmoji: {
    fontSize: 34,
    color: Colors.white,
  },
  wordmark: {
    fontSize: 36,
    fontWeight: FontWeight.bold,
    color: Colors.white,
    letterSpacing: 3,
  },
  tagline: {
    position: 'absolute',
    bottom: height * 0.14,
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 0.5,
  },
})
