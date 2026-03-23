import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { Colors } from '@/theme'

interface SpinnerProps {
  size?: 'small' | 'large'
  color?: string
  fullScreen?: boolean
}

export function Spinner({ size = 'small', color = Colors.brand[500], fullScreen }: SpinnerProps) {
  if (fullScreen) {
    return (
      <View style={styles.fullScreen}>
        <ActivityIndicator size="large" color={color} />
      </View>
    )
  }
  return <ActivityIndicator size={size} color={color} />
}

const styles = StyleSheet.create({
  fullScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.gray[50],
  },
})
