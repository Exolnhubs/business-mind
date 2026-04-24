import { TicketFlipLoader } from '@/components/ui/TicketFlipLoader'
import { ScreenLoader } from '@/components/ui/ScreenLoader'

interface SpinnerProps {
  size?: 'small' | 'large'
  color?: string
  fullScreen?: boolean
}

export function Spinner({ size = 'small', fullScreen }: SpinnerProps) {
  if (fullScreen) {
    return <ScreenLoader size="md" fullScreen />
  }
  return <TicketFlipLoader size={size === 'large' ? 'sm' : 'xs'} />
}
