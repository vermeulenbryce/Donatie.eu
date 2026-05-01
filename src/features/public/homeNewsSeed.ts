export type HomeNewsType = 'nieuws' | 'update' | 'evenement' | 'actie' | 'succes'
export const dnlNewsUpdatedEvent = 'dnl:news-updated'

export type HomeNewsItem = {
  id: string
  type: HomeNewsType
  featured?: boolean
  org: string
  emoji: string
  img: string
  title: string
  excerpt: string
  body: string
  donateTo: string
  date: string
}

export const HOME_NEWS_TYPE_META: Record<
  HomeNewsType,
  { label: string; cls: string; emoji: string }
> = {
  nieuws: { label: 'Nieuws', cls: 'news-type-nieuws', emoji: '📰' },
  update: { label: 'Updates', cls: 'news-type-update', emoji: '📱' },
  evenement: { label: 'Evenementen', cls: 'news-type-evenement', emoji: '📅' },
  actie: { label: 'Acties', cls: 'news-type-actie', emoji: '🚀' },
  succes: { label: 'Successen', cls: 'news-type-succes', emoji: '🏆' },
}

/** Valeurs voor formulier/filter; DB-kolom `site_news_posts.category`. */
export const NEWS_CATEGORY_KEYS: readonly HomeNewsType[] = ['nieuws', 'update', 'evenement', 'actie', 'succes']

/** Leest DB-waarde naar `HomeNewsType`; onbekend of leeg → `nieuws`. */
export function parseHomeNewsCategory(raw: string | null | undefined): HomeNewsType {
  if (raw && (NEWS_CATEGORY_KEYS as readonly string[]).includes(raw)) return raw as HomeNewsType
  return 'nieuws'
}

/** Legacy: leeg; live bron is `site_news_posts`. */
export const HOME_NEWS_SEED: HomeNewsItem[] = []

function sortKey(date: string) {
  const p = date.split('-')
  if (p.length !== 3) return date
  return `${p[2]}${p[1]}${p[0]}`
}

/** Legacy localStorage-hulp (geen seed meer). */
export function getMergedHomeNewsItems(): HomeNewsItem[] {
  try {
    const raw = localStorage.getItem('dnl_news')
    const stored: HomeNewsItem[] = raw ? JSON.parse(raw) : []
    if (!Array.isArray(stored)) return []
    return [...stored].sort((a, b) => (sortKey(b.date) > sortKey(a.date) ? 1 : -1))
  } catch {
    return []
  }
}

export function writeHomeNewsItems(items: HomeNewsItem[]) {
  localStorage.setItem('dnl_news', JSON.stringify(items))
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(dnlNewsUpdatedEvent))
  }
}

export function getTypeColor(type: HomeNewsType): string {
  return (
    {
      nieuws: '#fef3c7',
      update: '#dbeafe',
      evenement: '#e0f2fe',
      actie: '#dcfce7',
      succes: '#e0e7ff',
    }[type] || '#f3f4f6'
  )
}

export function getTypeTextColor(type: HomeNewsType): string {
  return (
    {
      nieuws: '#b45309',
      update: '#1d4ed8',
      evenement: '#0369a1',
      actie: '#15803d',
      succes: '#4338ca',
    }[type] || '#374151'
  )
}
