import { useEffect, useState } from 'react'

import { isSupabaseConfigured, supabase } from '../../lib/supabase'

import {

  mergePublicFaqFromDb,

  type FaqDbShape,

  type FaqPublicItem,

} from './faqBasisMerge'



export type { FaqPublicItem }



async function fetchActiveFaqRows(): Promise<FaqDbShape[] | null> {

  if (!isSupabaseConfigured || !supabase) return null

  const { data, error } = await supabase

    .from('site_faq_items')

    .select('id, category, question, answer, sort_order, active')

    .eq('active', true)

    .order('sort_order', { ascending: true })

    .order('question', { ascending: true })

  if (error || !data) return null

  return (data as FaqDbShape[]).map((r) => ({

    ...r,

    category: r.category ?? 'algemeen',

    question: String(r.question ?? ''),

    answer: String(r.answer ?? ''),

  }))

}



/**

 * Publieke FAQ: vaste slots (template in code), inhoud uit DB waar aanwezig;

 * extra DB-items daaronder. Realtime bij wijzigingen in `site_faq_items`.

 */

export function useLiveFaqItems(): FaqPublicItem[] {

  const [snapshot, setSnapshot] = useState<FaqPublicItem[]>(() => mergePublicFaqFromDb([]))



  useEffect(() => {

    let cancelled = false

    async function load() {

      const rows = await fetchActiveFaqRows()

      if (cancelled) return

      if (!rows) {

        setSnapshot(mergePublicFaqFromDb([]))

      } else {

        setSnapshot(mergePublicFaqFromDb(rows))

      }

    }

    void load()

    const pollInterval = window.setInterval(load, 10_000)



    if (!isSupabaseConfigured || !supabase) {

      return () => {

        cancelled = true

        window.clearInterval(pollInterval)

      }

    }

    const client = supabase

    const channel = client

      .channel(`public-faq-${Math.random().toString(36).slice(2, 8)}`)

      .on('postgres_changes', { event: '*', schema: 'public', table: 'site_faq_items' }, () => {

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



  return snapshot

}

