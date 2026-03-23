import { View, Text, StyleSheet } from 'react-native'
import { Colors, Radius, FontSize, FontWeight } from '@/theme'

type Variant = 'brand' | 'green' | 'red' | 'yellow' | 'gray' | 'blue'

const variantStyles: Record<Variant, { bg: string; text: string }> = {
  brand:  { bg: Colors.brand[100],       text: Colors.brand[700] },
  green:  { bg: Colors.green.light,      text: Colors.green.text },
  red:    { bg: Colors.red.light,        text: Colors.red.text },
  yellow: { bg: Colors.yellow.light,     text: Colors.yellow.text },
  gray:   { bg: Colors.gray[100],        text: Colors.gray[600] },
  blue:   { bg: Colors.blue.light,       text: Colors.blue.text },
}

interface BadgeProps {
  label: string
  variant?: Variant
}

export function Badge({ label, variant = 'gray' }: BadgeProps) {
  const { bg, text } = variantStyles[variant]
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.text, { color: text }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
})
