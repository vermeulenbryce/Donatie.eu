import { isSupabaseConfigured, supabase } from '../../lib/supabase'

export type ThinkIdeaTag = 'idee' | 'poll' | 'winnaar'

export type ThinkPost = {
  id: string
  title: string
  excerpt: string
  votes: number
  tag: ThinkIdeaTag
  category: string
  author_display_name?: string | null
  author_id?: string | null
  created_at?: string | null
}

const CATEGORIES = ['natuur', 'gezondheid', 'kinderen', 'dieren', 'sociaal', 'innovatie'] as const
export type ThinkCategory = (typeof CATEGORIES)[number]

export function parseThinkCategory(raw: unknown): ThinkCategory {
  const s = String(raw ?? '').toLowerCase().trim()
  return (CATEGORIES as readonly string[]).includes(s) ? (s as ThinkCategory) : 'sociaal'
}

function mapRow(raw: Record<string, unknown>): ThinkPost {
  return {
    id: String(raw.id),
    title: String(raw.title ?? ''),
    excerpt: String(raw.excerpt ?? ''),
    votes: Math.max(0, Number(raw.vote_count ?? raw.votes ?? 0) || 0),
    tag: (['idee', 'poll', 'winnaar'].includes(String(raw.tag)) ? raw.tag : 'idee') as ThinkIdeaTag,
    category: parseThinkCategory(raw.category),
    author_display_name: raw.author_display_name != null ? String(raw.author_display_name) : null,
    author_id: raw.author_id != null ? String(raw.author_id) : null,
    created_at: raw.created_at != null ? String(raw.created_at) : null,
  }
}

export async function fetchCommunityIdeasLive(): Promise<ThinkPost[]> {
  if (!isSupabaseConfigured || !supabase) return []
  const { data, error } = await supabase
    .from('community_ideas')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>))
}

/** Top-N ideeën op aantal stemmen (zelfde dataset als Denk mee). */
export async function fetchTopCommunityIdeasByVotesLive(limit = 3): Promise<ThinkPost[]> {
  const rows = await fetchCommunityIdeasLive()
  return [...rows]
    .sort((a, b) => {
      const dv = b.votes - a.votes
      if (dv !== 0) return dv
      const ta = new Date(a.created_at ?? 0).getTime()
      const tb = new Date(b.created_at ?? 0).getTime()
      return tb - ta
    })
    .slice(0, Math.max(0, limit))
}

export async function fetchMyThinkVoteIdsLive(): Promise<Set<string>> {
  if (!isSupabaseConfigured || !supabase) return new Set()
  const { data, error } = await supabase.from('community_idea_votes').select('idea_id')
  if (error) throw new Error(error.message)
  return new Set((data ?? []).map((r: { idea_id: string }) => String(r.idea_id)))
}

/** Supabase realtime: subscribe to inserts/updates/deletes op community_ideas. */
export function subscribeCommunityIdeasLive(onChange: () => void): () => void {
  if (!isSupabaseConfigured || !supabase) return () => {}

  const client = supabase
  const ch = client
    .channel('denk-mee-ideas')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'community_ideas' },
      () => onChange(),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'community_idea_votes' },
      () => onChange(),
    )
    .subscribe()

  return () => {
    void client.removeChannel(ch)
  }
}

export type SubmitIdeaRpcResult =
  | { ok: true; points_awarded_submit?: number }
  | {
      ok: false
      reason:
        | 'not_authenticated'
        | 'title_excerpt_required'
        | 'text_too_long'
        | 'invalid_category'
        | 'weekly_submit_limit'
        | 'unknown'
    }

export async function submitCommunityIdeaRpc(
  title: string,
  excerpt: string,
  category: ThinkCategory,
): Promise<SubmitIdeaRpcResult> {
  if (!isSupabaseConfigured || !supabase) return { ok: false, reason: 'unknown' }
  const { data, error } = await supabase.rpc('submit_community_idea', {
    p_title: title,
    p_excerpt: excerpt,
    p_category: category,
  })
  if (error) throw new Error(error.message)
  const o = (data ?? {}) as Record<string, unknown>
  if (o.ok === true) return { ok: true, points_awarded_submit: Number(o.points_awarded_submit ?? 50) || 50 }
  const reason = String(o.reason ?? 'unknown')
  if (
    reason === 'not_authenticated' ||
    reason === 'title_excerpt_required' ||
    reason === 'text_too_long' ||
    reason === 'invalid_category' ||
    reason === 'weekly_submit_limit'
  ) {
    return { ok: false, reason }
  }
  return { ok: false, reason: 'unknown' }
}

export type ToggleVoteRpcResult =
  | { ok: true; voted: boolean; vote_count?: number }
  | { ok: false; reason: 'not_authenticated' | 'idea_not_found' | 'own_idea' | 'unknown' }

export async function toggleCommunityIdeaVoteRpc(ideaId: string): Promise<ToggleVoteRpcResult> {
  if (!isSupabaseConfigured || !supabase) return { ok: false, reason: 'unknown' }
  const { data, error } = await supabase.rpc('toggle_community_idea_vote', {
    p_idea_id: ideaId,
  })
  if (error) throw new Error(error.message)
  const o = (data ?? {}) as Record<string, unknown>
  if (o.ok === true) {
    return {
      ok: true,
      voted: Boolean(o.voted),
      vote_count: o.vote_count != null ? Math.max(0, Number(o.vote_count) || 0) : undefined,
    }
  }
  const reason = String(o.reason ?? 'unknown')
  if (reason === 'not_authenticated' || reason === 'idea_not_found' || reason === 'own_idea')
    return { ok: false, reason }
  return { ok: false, reason: 'unknown' }
}
