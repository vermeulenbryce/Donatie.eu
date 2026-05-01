import { useEffect, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'
import { FEATURED_CAUSE_IDS_DEFAULT } from '../legacy/featuredCauseIds'

function parseCauseKey(key: string): number | null {
  const m = /^cbf-(\d+)$/i.exec(key)
  return m ? Number(m[1]) : null
}

async function fetchFeaturedCauseIdsFromSupabase(): Promise<number[] | null> {
  if (!isSupabaseConfigured || !supabase) return null
  const { data, error } = await supabase
    .from('site_featured_causes')
    .select('cause_key, sort_order, active')
    .eq('active', true)
    .order('sort_order', { ascending: true })
  if (error || !data) return null
  const ids = data
    .map((r) => parseCauseKey(String((r as { cause_key: string }).cause_key)))
    .filter((id): id is number => typeof id === 'number')
  return ids
}

/**
 * Live featured cause IDs. Wijzigt realtime wanneer admin ze aanpast.
 * Fallback op `FEATURED_CAUSE_IDS_DEFAULT` tot eerste Supabase-respons binnen is
 * of als Supabase/tabel onbereikbaar is.
 */
export function useLiveFeaturedCauseIds(): number[] {
  const [ids, setIds] = useState<number[]>([...FEATURED_CAUSE_IDS_DEFAULT])

  useEffect(() => {
    let cancelled = false
    async function load() {
      const next = await fetchFeaturedCauseIdsFromSupabase()
      if (cancelled) return
      if (next && next.length > 0) {
        setIds((prev) => {
          if (prev.length === next.length && prev.every((v, i) => v === next[i])) return prev
          return next
        })
      }
    }
    void load()

    // Polling-fallback: als realtime niet binnenkomt, zie je wijzigingen binnen 10s.
    const pollInterval = window.setInterval(load, 10_000)

    if (!isSupabaseConfigured || !supabase) {
      return () => {
        cancelled = true
        window.clearInterval(pollInterval)
      }
    }
    const client = supabase
    const channel = client
      .channel(`public-featured-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'site_featured_causes' }, () => {
        void load()
      })
      .subscribe()

    return () => {
      cancelled = true
      window.clearInterval(pollInterval)
      try {
        void client.removeChannel(channel)
      } catch {
        /* ignore */
      }
    }
  }, [])

  return ids
}
