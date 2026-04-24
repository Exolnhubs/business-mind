import styles from './TicketFlipLoader.module.css'

export type TicketFlipLoaderSize = 'sm' | 'md' | 'lg'

interface TicketFlipLoaderProps {
  size?: TicketFlipLoaderSize
  label?: string
  className?: string
}

// 5×5 dotted grid for the QR-code placeholder — suggestive, not decodable.
// Pattern picks 11 cells "on" in a vaguely-QR distribution with 3 finder
// corners so it reads as a QR at a glance.
const QR_PATTERN: ReadonlyArray<ReadonlyArray<0 | 1>> = [
  [1, 1, 0, 1, 1],
  [1, 0, 1, 0, 1],
  [0, 1, 1, 0, 0],
  [1, 0, 0, 1, 0],
  [1, 1, 0, 1, 1],
]

function TicketFace() {
  return (
    <>
      <div className={styles.header}>
        <span className={styles.mark} aria-hidden>✱</span>
        <span className={styles.wordmark}>Rawaq</span>
        <span className={styles.headerRule} />
      </div>
      <div className={styles.bars}>
        <div className={`${styles.bar} ${styles.barTitle}`} />
        <div className={`${styles.bar} ${styles.barSubtitle}`} />
      </div>
      <div className={styles.meta}>
        <div className={styles.metaBar} style={{ width: '38%' }} />
        <div className={styles.metaBar} style={{ width: '28%' }} />
      </div>
      <div className={styles.perforation} />
      <div className={styles.stub}>
        <div className={styles.stubLines}>
          <div className={`${styles.stubBar} ${styles.stubBar1}`} />
          <div className={`${styles.stubBar} ${styles.stubBar2}`} />
        </div>
        <div className={styles.qr} aria-hidden>
          {QR_PATTERN.flat().map((on, i) => (
            <span key={i} className={`${styles.qrDot} ${on ? '' : styles.off}`} />
          ))}
        </div>
      </div>
    </>
  )
}

export function TicketFlipLoader({
  size = 'md',
  label,
  className,
}: TicketFlipLoaderProps) {
  const sizeClass = size === 'sm' ? styles.sm : size === 'lg' ? styles.lg : ''
  return (
    <div
      className={`${styles.stage} ${sizeClass} ${className ?? ''}`}
      role="status"
      aria-live="polite"
      aria-label={label ?? 'Loading'}
    >
      <div className={styles.binding} aria-hidden>
        <span className={styles.bindingDot} />
        <span className={styles.bindingDot} />
        <span className={styles.bindingDot} />
      </div>
      <div className={styles.book}>
        <div className={styles.flipper}>
          <div className={styles.face}>
            <TicketFace />
          </div>
          <div className={`${styles.face} ${styles.back}`}>
            <TicketFace />
          </div>
        </div>
      </div>
      {label && <span className={styles.label}>{label}</span>}
    </div>
  )
}
