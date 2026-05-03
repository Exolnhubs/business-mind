/* eslint-disable @next/next/no-img-element */
import Image from 'next/image'
import type { CSSProperties } from 'react'

type SafeImageProps = {
  src: string
  alt: string
  className?: string
  sizes?: string
  width?: number
  height?: number
  fill?: boolean
  priority?: boolean
  loading?: 'eager' | 'lazy'
  unoptimized?: boolean
  style?: CSSProperties
}

function isNextImageAllowed(src: string) {
  if (src.startsWith('/')) return true

  try {
    const { protocol, hostname } = new URL(src)
    if (protocol !== 'https:') return false

    return hostname.endsWith('.supabase.co') || hostname.endsWith('.supabase.in')
  } catch {
    return false
  }
}

function resolvedSrc(src: string) {
  if (isNextImageAllowed(src)) return src
  if (src.startsWith('/')) return src
  return `/api/image-proxy?url=${encodeURIComponent(src)}`
}

function nativeClassName(className: string | undefined, fill: boolean | undefined) {
  return fill
    ? ['absolute inset-0 h-full w-full', className].filter(Boolean).join(' ')
    : className
}

export function SafeImage({
  src,
  alt,
  className,
  sizes,
  width,
  height,
  fill,
  priority,
  loading,
  unoptimized,
  style,
}: SafeImageProps) {
  const proxied = resolvedSrc(src)

  if (isNextImageAllowed(proxied)) {
    return (
      <Image
        src={proxied}
        alt={alt}
        className={className}
        sizes={sizes}
        width={width}
        height={height}
        fill={fill}
        priority={priority}
        unoptimized={unoptimized}
        loading={priority ? undefined : loading}
        style={style}
      />
    )
  }

  // proxied is always /api/image-proxy?... at this point — safe to use with <img>
  return (
    <img
      src={proxied}
      alt={alt}
      className={nativeClassName(className, fill)}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      loading={priority ? 'eager' : loading ?? 'lazy'}
      style={style}
    />
  )
}
