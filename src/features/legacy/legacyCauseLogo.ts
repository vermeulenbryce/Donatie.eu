import type { LegacyCbfCause } from './cbfCauses.generated'

const LOGO_OVERRIDES: Record<number, string> = {}

/** Robuuste hostname uit CBF-website (incl. subdomeinen). */
export function extractCauseDomain(website: string | undefined | null): string | null {
  if (!website || typeof website !== 'string') return null
  const trimmed = website.trim()
  if (!trimmed) return null
  try {
    const withProto = trimmed.includes('://') ? trimmed : `https://${trimmed}`
    const u = new URL(withProto)
    return u.hostname.toLowerCase() || null
  } catch {
    return null
  }
}

/** Google favicon-service: snel; beter bruikbaar dan Clearbit voor veel NL goede doelen. */
export function googleS2FaviconUrl(domain: string, sz: number): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${sz}`
}

/** Fallback als Google geen bruikbaar icoon teruggeeft. */
export function duckduckgoIconUrl(domain: string): string {
  return `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`
}

/** Alleen voor handmatige overrides / legacy; niet als eerste keuze (traag / vaak wit). */
export function clearbitLogoUrl(domain: string): string {
  return `https://logo.clearbit.com/${encodeURIComponent(domain)}`
}

/**
 * Eerste logo-URL voor een goed doel (kaart, simpele img src).
 * Gebruikt geen Clearbit meer — te traag en vaak lege/witte plaatjes.
 */
export function getLogoUrl(c: LegacyCbfCause): string | null {
  if (LOGO_OVERRIDES[c.id]) return LOGO_OVERRIDES[c.id]
  const domain = extractCauseDomain(c.website)
  if (!domain) return null
  return googleS2FaviconUrl(domain, 128)
}

/** @deprecated Gebruik googleS2FaviconUrl; zelfde gedrag. */
export function faviconFallbackUrl(domain: string): string {
  return googleS2FaviconUrl(domain, 128)
}
