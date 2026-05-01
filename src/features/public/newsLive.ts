import { useEffect, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'
import { type HomeNewsItem, type HomeNewsType, parseHomeNewsCategory } from './homeNewsSeed'

type NewsRow = {
  id: string
  title: string
  slug: string | null
  excerpt: string | null
  body: string | null
  image_url: string | null
  category: string | null
  published_at: string | null
  created_at: string
}

function formatDdMmYyyy(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = d.getFullYear()
  return `${dd}-${mm}-${yy}`
}

function inferType(title: string, excerpt: string | null): HomeNewsType {
  const t = `${title} ${excerpt ?? ''}`.toLowerCase()
  if (/evenement|event|meetup|bijeenkomst/.test(t)) return 'evenement'
  if (/update|launch|lancering|nieuw in/.test(t)) return 'update'
  if (/actie|campagne|win|kans/.test(t)) return 'actie'
  if (/record|mijlpaal|bereikt|succes/.test(t)) return 'succes'
  return 'nieuws'
}

function mapRowToItem(row: NewsRow): HomeNewsItem {
  const type =
    row.category != null && String(row.category).trim() !== ''
      ? parseHomeNewsCategory(row.category)
      : inferType(row.title, row.excerpt)
  return {
    id: row.id,
    type,
    org: 'Donatie.eu',
    emoji: type === 'evenement' ? '📅' : type === 'actie' ? '🚀' : type === 'succes' ? '🏆' : type === 'update' ? '📱' : '📰',
    img: row.image_url ?? '',
    title: row.title,
    excerpt: row.excerpt ?? '',
    body: row.body ?? '',
    donateTo: '',
    date: formatDdMmYyyy(row.published_at ?? row.created_at),
  }
}

async function fetchPublishedNews(): Promise<HomeNewsItem[] | null> {
  if (!isSupabaseConfigured || !supabase) return null
  const { data, error } = await supabase
    .from('site_news_posts')
    .select('id, title, slug, excerpt, body, image_url, category, published_at, created_at')
    .eq('published', true)
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(50)
  if (error || !data) return null
  return (data as NewsRow[]).map(mapRowToItem)
}

/**
 * Live nieuwsberichten uitsluitend uit Supabase (`site_news_posts`, published).
 * Geen demo-data; realtime + 10s polling.
 */
export function useLiveNewsItems(): HomeNewsItem[] {
  const [items, setItems] = useState<HomeNewsItem[]>([])

  useEffect(() => {
    let cancelled = false
    async function load() {
      const next = await fetchPublishedNews()
      if (cancelled) return
      setItems(next ?? [])
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
      .channel(`public-news-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'site_news_posts' }, () => {
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

  return items
}
