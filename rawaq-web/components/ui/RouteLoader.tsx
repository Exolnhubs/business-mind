import { TicketFlipLoader } from './TicketFlipLoader'

interface RouteLoaderProps {
  label?: string
  fillViewport?: boolean
  className?: string
}

export function RouteLoader({
  label = 'Loading',
  fillViewport = false,
  className,
}: RouteLoaderProps) {
  return (
    <div
      className={[
        'flex items-center justify-center px-6 py-12',
        fillViewport ? 'min-h-screen' : 'min-h-[60vh]',
        className ?? '',
      ].join(' ')}
      aria-live="polite"
    >
      <TicketFlipLoader size="md" label={label} />
    </div>
  )
}
