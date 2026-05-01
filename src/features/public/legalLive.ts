import { useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'
import {
  getDefaultLegalBlock,
  type LegalBlock,
} from './legalContentDefaults'

type SiteSettingsRow = { key: string; value: unknown }

function isLegalBlock(x: unknown): x is LegalBlock {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return typeof o.intro === 'string' && Array.isArray(o.bullets) && o.bullets.every((b) => typeof b === 'string')
}

function parseLegalPages(value: unknown): Record<string, LegalBlock> {
  if (!value || typeof value !== 'object') return {}
  const out: Record<string, LegalBlock> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (isLegalBlock(v)) out[k] = v
  }
  return out
}

export function useLiveLegalBlock(title: string): LegalBlock {
  const defaultBlock = useMemo(() => getDefaultLegalBlock(title), [title])
  const [overrides, setOverrides] = useState<Record<string, LegalBlock>>({})

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!isSupabaseConfigured || !supabase) return
      const { data, error } = await supabase
        .from('site_settings')
        .select('key, value')
        .eq('key', 'legal_pages')
        .maybeSingle()
      if (cancelled || error) return
      setOverrides(parseLegalPages((data as SiteSettingsRow | null)?.value))
    }
    void load()
    if (!isSupabaseConfigured || !supabase) return
    const client = supabase
    const ch = client
      .channel(`public-legal-pages-${Math.random().toString(36).slice(2, 8)}`)
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

  return useMemo(() => {
    const o = overrides[title]
    if (o) return o
    return defaultBlock
  }, [overrides, title, defaultBlock])
}
