import { supabase } from '../../lib/supabase'

export type PublicLeaderboardKind = 'individuen' | 'bedrijven' | 'influencers'

export type PublicLeaderboardRow = {
  rank: number
  points: number
  total_donated: number
  is_anonymous: boolean
  is_me: boolean
  elite: boolean
  label: string
  initial: string
}

function readBool(v: unknown): boolean {
  if (v === true || v === 'true' || v === 1 || v === '1') return true
  return false
}

function parseRows(data: unknown): PublicLeaderboardRow[] {
  if (data == null) return []
  let raw: unknown = data
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw) as unknown
    } catch {
      return []
    }
  }
  if (!Array.isArray(raw)) return []
  const out: PublicLeaderboardRow[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const r = item as Record<string, unknown>
    out.push({
      rank: Number(r.rank) || out.length + 1,
      points: Number(r.points) || 0,
      total_donated: Number(r.total_donated) || 0,
      is_anonymous: readBool(r.is_anonymous),
      is_me: readBool(r.is_me),
      elite: readBool(r.elite),
      label: typeof r.label === 'string' ? r.label : 'Donateur',
      initial: typeof r.initial === 'string' ? r.initial : '?',
    })
  }
  return out
}

export async function fetchPublicLeaderboard(
  kind: PublicLeaderboardKind,
  limit = 200,
): Promise<PublicLeaderboardRow[]> {
  if (!supabase) return []
  const { data, error } = await supabase.rpc('get_public_leaderboard', {
    p_kind: kind,
    p_limit: limit,
  })
  if (error) {
    console.warn('[leaderboard]', error.message)
    return []
  }
  return parseRows(data)
}

/** Ruwe projectrijen voor /ranglijst (publieke community-projecten). */
export async function fetchPublicProjectsForRanklist(limit = 150): Promise<Record<string, unknown>[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.warn('[leaderboard] projects', error.message)
    return []
  }
  if (!Array.isArray(data)) return []
  return data as Record<string, unknown>[]
}
