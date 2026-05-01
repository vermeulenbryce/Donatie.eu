import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import {
  duckduckgoIconUrl,
  extractCauseDomain,
  googleS2FaviconUrl,
} from '../../features/legacy/legacyCauseLogo'

/** Google/DuckDuckGo-favicons falen vaak (403/rate-limit). Zet VITE_SKIP_EXTERNAL_CAUSE_LOGOS=1 om alleen sector-emoji te tonen (geen rode Network-regels). */
const SKIP_EXTERNAL_CAUSE_LOGOS =
  import.meta.env.VITE_SKIP_EXTERNAL_CAUSE_LOGOS === '1' ||
  import.meta.env.VITE_SKIP_EXTERNAL_CAUSE_LOGOS === 'true'

type CauseBrandLogoProps = {
  website: string | undefined
  alt: string
  width: number
  height: number
  fallback: ReactNode
  className?: string
  style?: CSSProperties
  /** Standaard lazy: minder gelijktijdige requests bij grote grids. */
  loading?: 'eager' | 'lazy'
}

/**
 * Logo met fallback-keten: Google s2 favicons → DuckDuckGo → emoji/placeholder.
 * Geen Clearbit meer (traag + vaak witte plaatjes op gradient).
 */
export function CauseBrandLogo({
  website,
  alt,
  width,
  height,
  fallback,
  className,
  style,
  loading = 'lazy',
}: CauseBrandLogoProps) {
  const domain = useMemo(() => extractCauseDomain(website), [website])
  const [tier, setTier] = useState(0)

  useEffect(() => {
    setTier(0)
  }, [domain])

  const sz = Math.min(128, Math.max(32, Math.round(Math.max(width, height) * 2)))

  if (SKIP_EXTERNAL_CAUSE_LOGOS || !domain || tier >= 2) {
    return <>{fallback}</>
  }

  const src = tier === 0 ? googleS2FaviconUrl(domain, sz) : duckduckgoIconUrl(domain)

  return (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={className}
      style={style}
      loading={loading}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setTier((t) => t + 1)}
    />
  )
}
