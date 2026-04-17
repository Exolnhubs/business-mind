import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

type Variant = 'brand' | 'green' | 'red' | 'yellow' | 'gray' | 'blue' | 'orange'

const styles: Record<Variant, string> = {
  brand:  'bg-brand-100 text-brand-700',
  green:  'bg-green-100 text-green-700',
  red:    'bg-red-100 text-red-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  gray:   'bg-gray-100 text-gray-600',
  blue:   'bg-blue-100 text-blue-700',
  orange: 'bg-orange-100 text-orange-700',
}

interface BadgeProps { variant?: Variant; className?: string; children: ReactNode }

export function Badge({ variant = 'gray', className, children }: BadgeProps) {
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', styles[variant], className)}>
      {children}
    </span>
  )
}
