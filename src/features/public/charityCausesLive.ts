import { useEffect, useState } from 'react'
import { CBF_CAUSES, type LegacyCbfCause } from '../legacy/cbfCauses.generated'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'

type SiteCauseRow = {
  cause_key: string
  active: boolean
  sort_order: number
}

function parseCauseKey(key: string): number | null {
  const m = /^cbf-(\d+)$/i.exec(key)
  return m ? Number(m[1]) : null
}

async function fetchSiteCauseIds(): Promise<number[] | null> {
  if (!isSupabaseConfigured || !supabase) return null
  const { data, error } = await supabase
    .from('site_charity_causes')
    .select('cause_key, active, sort_order')
    .eq('active', true)
    .order('sort_order', { ascending: true })
  if (error || !data) return null
  return (data as SiteCauseRow[])
    .map((r) => parseCauseKey(r.cause_key))
    .filter((v): v is number => typeof v === 'number')
}

export function useLiveCharityCauses(): LegacyCbfCause[] {
  const [causes, setCauses] = useState<LegacyCbfCause[]>(CBF_CAUSES)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const ids = await fetchSiteCauseIds()
      if (cancelled) return
      if (!ids || ids.length === 0) {
        setCauses(CBF_CAUSES)
        return
      }
      const mapped = ids
        .map((id) => CBF_CAUSES.find((c) => c.id === id))
        .filter((c): c is LegacyCbfCause => Boolean(c))
      setCauses(mapped.length > 0 ? mapped : CBF_CAUSES)
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
      .channel(`public-charity-causes-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'site_charity_causes' }, () => {
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

  return causes
}
