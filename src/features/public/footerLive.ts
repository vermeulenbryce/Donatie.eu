import { useCallback, useEffect, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'
import {
  DEFAULT_FOOTER_DATA,
  FOOTER_STORAGE_KEY,
  type FooterData,
  getFooterData,
} from './footerLegacyData'

type SiteSettingsRow = { key: string; value: unknown }

function isFooterLink(x: unknown): x is { label: string; type: string; target: string } {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return (
    typeof o.label === 'string' &&
    typeof o.type === 'string' &&
    (o.type === 'page' || o.type === 'url' || o.type === 'pdf') &&
    typeof o.target === 'string'
  )
}

export function isFooterData(x: unknown): x is FooterData {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  if (typeof o.desc !== 'string' || typeof o.copyright !== 'string') return false
  if (!Array.isArray(o.badges) || !o.badges.every((b) => typeof b === 'string')) return false
  if (!Array.isArray(o.cols)) return false
  for (const c of o.cols) {
    if (!c || typeof c !== 'object') return false
    const col = c as Record<string, unknown>
    if (typeof col.title !== 'string' || !Array.isArray(col.links)) return false
    if (!col.links.every((l) => isFooterLink(l))) return false
  }
  return true
}

function parseFooterFromSupabase(value: unknown): FooterData | null {
  if (value == null) return null
  return isFooterData(value) ? value : null
}

export function useLiveFooterData(): FooterData {
  const [data, setData] = useState<FooterData>(() => getFooterData())

  const applyLocal = useCallback(() => {
    setData(getFooterData())
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!isSupabaseConfigured || !supabase) return
      const { data: row, error } = await supabase
        .from('site_settings')
        .select('key, value')
        .eq('key', 'footer_content')
        .maybeSingle()
      if (cancelled || error) return
      const next = parseFooterFromSupabase((row as SiteSettingsRow | null)?.value)
      if (next) setData(next)
    }
    void load()
    if (!isSupabaseConfigured || !supabase) {
      return () => {
        cancelled = true
      }
    }
    const client = supabase
    const ch = client
      .channel(`public-footer-content-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'site_settings' }, () => {
        void load()
      })
      .subscribe()
    const poll = window.setInterval(load, 10_000)
    return () => {
      cancelled = true
      window.clearInterval(poll)
      try {
        void client.removeChannel(ch)
      } catch {
        /* ignore */
      }
    }
  }, [])

  useEffect(() => {
    if (isSupabaseConfigured) return
    const onStorage = (e: StorageEvent) => {
      if (e.key === FOOTER_STORAGE_KEY) applyLocal()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [applyLocal])

  return data
}

export { DEFAULT_FOOTER_DATA, type FooterData }
