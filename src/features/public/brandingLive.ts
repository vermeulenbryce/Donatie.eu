import { useEffect, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'

export type BrandingSettings = {
  logoNavUrl?: string
  logoFooterUrl?: string
  logoAdminUrl?: string
  faviconUrl?: string
}

export const DEFAULT_BRANDING: BrandingSettings = {}

type SiteSettingsRow = {
  key: string
  value: unknown
}

function parseBranding(value: unknown): BrandingSettings {
  const v = (value ?? {}) as Record<string, unknown>
  return {
    logoNavUrl: typeof v.logoNavUrl === 'string' ? v.logoNavUrl : undefined,
    logoFooterUrl: typeof v.logoFooterUrl === 'string' ? v.logoFooterUrl : undefined,
    logoAdminUrl: typeof v.logoAdminUrl === 'string' ? v.logoAdminUrl : undefined,
    faviconUrl: typeof v.faviconUrl === 'string' ? v.faviconUrl : undefined,
  }
}

async function fetchBrandingFromSupabase(): Promise<BrandingSettings | null> {
  if (!isSupabaseConfigured || !supabase) return null
  const { data, error } = await supabase
    .from('site_settings')
    .select('key, value')
    .eq('key', 'branding')
    .maybeSingle()
  if (error || !data) return null
  return parseBranding((data as SiteSettingsRow).value)
}

export function useLiveBrandingSettings(): BrandingSettings {
  const [branding, setBranding] = useState<BrandingSettings>(DEFAULT_BRANDING)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const next = await fetchBrandingFromSupabase()
      if (cancelled || !next) return
      setBranding(next)
    }
    void load()
    const poll = window.setInterval(load, 10_000)
    if (!isSupabaseConfigured || !supabase) {
      return () => {
        cancelled = true
        window.clearInterval(poll)
      }
    }
    const client = supabase
    const channel = client
      .channel(`public-branding-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'site_settings' }, () => {
        void load()
      })
      .subscribe()
    return () => {
      cancelled = true
      window.clearInterval(poll)
      try {
        void client.removeChannel(channel)
      } catch {
        /* ignore */
      }
    }
  }, [])

  useEffect(() => {
    const href = branding.faviconUrl?.trim()
    if (!href) return
    try {
      const abs = new URL(href, window.location.href)
      if (abs.hostname === 'localhost' || abs.hostname.endsWith('.localhost')) return
      if (window.location.protocol === 'https:' && abs.protocol === 'http:') return
    } catch {
      return
    }
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    link.href = href
  }, [branding.faviconUrl])

  return branding
}
