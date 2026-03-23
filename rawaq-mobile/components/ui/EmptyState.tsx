import { View, Text, StyleSheet } from 'react-native'
import { Colors, Spacing, FontSize, FontWeight } from '@/theme'

interface EmptyStateProps {
  icon?: string
  title: string
  description?: string
}

export function EmptyState({ icon = '📭', title, description }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={styles.title}>{title}</Text>
      {description && <Text style={styles.description}>{description}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing['4xl'] },
  icon: { fontSize: 48, marginBottom: Spacing.lg },
  title: { fontSize: FontSize.lg, fontWeight: FontWeight.semibold, color: Colors.gray[800], textAlign: 'center' },
  description: { fontSize: FontSize.sm, color: Colors.gray[500], textAlign: 'center', marginTop: Spacing.sm },
})
