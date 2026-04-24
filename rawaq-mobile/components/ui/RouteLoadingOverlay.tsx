import { StyleSheet, View } from 'react-native'
import { TicketFlipLoader } from '@/components/ui/TicketFlipLoader'
import { Colors, Spacing } from '@/theme'

export function RouteLoadingOverlay() {
  return (
    <View pointerEvents="auto" style={styles.overlay}>
      <TicketFlipLoader size="sm" label="Loading" />
    </View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(249, 250, 251, 0.92)',
    padding: Spacing.lg,
  },
})
