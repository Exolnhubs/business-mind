import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { TicketFlipLoader, type TicketFlipLoaderSize } from '@/components/ui/TicketFlipLoader'
import { Colors, Spacing } from '@/theme'

interface ScreenLoaderProps {
  size?: TicketFlipLoaderSize
  label?: string
  fullScreen?: boolean
  style?: StyleProp<ViewStyle>
}

export function ScreenLoader({
  size = 'md',
  label,
  fullScreen = false,
  style,
}: ScreenLoaderProps) {
  return (
    <View style={[fullScreen ? styles.fullScreen : styles.centered, style]}>
      <TicketFlipLoader size={size} label={label} />
    </View>
  )
}

const styles = StyleSheet.create({
  fullScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.gray[50],
    padding: Spacing.lg,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Spacing.lg,
  },
})
