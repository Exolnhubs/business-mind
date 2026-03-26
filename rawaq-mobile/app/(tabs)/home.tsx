import { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import EventsScreen from './events/index'
import FeedScreen from './feed'
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/theme'

type Segment = 'explore' | 'foryou'

export default function HomeScreen() {
  const [segment, setSegment] = useState<Segment>('explore')
  const insets = useSafeAreaInsets()

  return (
    <View style={styles.root}>
      {/* ── Header with segment pill ─────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <View style={styles.pillTrack}>
          <PillBtn
            label="🌍  Explore"
            active={segment === 'explore'}
            onPress={() => setSegment('explore')}
          />
          <PillBtn
            label="✨  For You"
            active={segment === 'foryou'}
            onPress={() => setSegment('foryou')}
          />
        </View>
      </View>

      {/* ── Content ──────────────────────────────────────────── */}
      {segment === 'explore' ? <EventsScreen /> : <FeedScreen />}
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
})
