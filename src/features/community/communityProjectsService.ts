import { supabase } from '../../lib/supabase'
import { CBF_CAUSES } from '../legacy/cbfCauses.generated'
import type { Project } from '../../types/domain'
import { normalizeProjectRow } from '../projects/projectsService'

export type CommunityRow = {
  id: string
  owner_user_id: string
  kind: 'bedrijf' | 'influencer'
  join_code: string
  name: string
  slug: string | null
}

export type CommunityMemberRole = 'owner' | 'member' | 'sponsor'

export type CommunityMembershipRow = CommunityRow & {
  role: CommunityMemberRole
}

export type CommunityMemberRow = {
  user_id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  role: CommunityMemberRole
  joined_at: string
}

export type CommunityShopItem = {
  id: string
  community_id: string
  title: string
  description: string | null
  cost: number
  stock: number
  emoji: string | null
  active: boolean
  created_at: string
  updated_at: string
}

/** cause_key zoals in DB / site_charity_causes, bv. "cbf-1" */
export function causeKeyFromCbfId(cbfId: number): string {
  return `cbf-${cbfId}`
}

export function charityLabelFromCauseKey(causeKey: string | null | undefined): string {
  if (!causeKey || !causeKey.startsWith('cbf-')) return 'Goed doel'
  const id = Number(causeKey.replace(/^cbf-/i, ''))
  if (!Number.isFinite(id)) return 'Goed doel'
  const c = CBF_CAUSES.find((x) => x.id === id)
  return c?.naam ?? 'Goed doel'
}

export async function fetchOwnedCommunity(
  ownerUserId: string,
  kind?: 'bedrijf' | 'influencer',
): Promise<CommunityRow | null> {
  if (!supabase) return null
  let query = supabase
    .from('communities')
    .select('id, owner_user_id, kind, join_code, name, slug')
    .eq('owner_user_id', ownerUserId)
    .order('created_at', { ascending: false })
    .limit(1)

  if (kind) query = query.eq('kind', kind)

  const { data, error } = await query
  if (error || !data || data.length === 0) return null
  return data[0] as CommunityRow
}

/**
 * Zorgt dat bedrijf/influencer altijd een community heeft.
 * Vereist SQL-functie: public.ensure_my_community(raw_name text default null).
 */
async function requireSupabaseAuthSession(): Promise<void> {
  if (!supabase) throw new Error('Supabase is niet geconfigureerd.')
  let {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) {
    const { data: refreshed, error: refErr } = await supabase.auth.refreshSession()
    if (refErr || !refreshed.session) {
      throw new Error(
        'Je sessie is verlopen of je bent niet ingelogd. Log uit en log opnieuw in, en probeer het daarna opnieuw.',
      )
    }
  }
}

function accountTypeFromUserMetadata(meta: Record<string, unknown>): 'individu' | 'bedrijf' | 'influencer' {
  const v = meta.account_type
  return v === 'bedrijf' || v === 'influencer' ? v : 'individu'
}

/** Zorgt dat er een rij in public.profiles is (oude accounts / ontbrekende trigger). */
async function upsertProfileFromAuthSession(): Promise<void> {
  if (!supabase) return
  const { data: userData, error: uerr } = await supabase.auth.getUser()
  if (uerr || !userData.user?.id) return
  const u = userData.user
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>
  await supabase.from('profiles').upsert(
    {
      id: u.id,
      email: u.email ?? null,
      first_name: typeof meta.first_name === 'string' ? meta.first_name : null,
      last_name: typeof meta.last_name === 'string' ? meta.last_name : null,
      account_type: accountTypeFromUserMetadata(meta),
      anonymous: meta.anonymous === true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  )
}

/** Als JWT-metadata bedrijf/influencer zegt maar profiles achterloopt, eenmalig bijwerken vóór ensure_my_community. */
async function syncOwnerAccountTypeFromAuthMetadata(): Promise<void> {
  if (!supabase) return
  const { data: userData, error: uerr } = await supabase.auth.getUser()
  if (uerr || !userData.user?.id) return
  const raw = userData.user.user_metadata?.account_type
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (s !== 'bedrijf' && s !== 'influencer') return
  await supabase
    .from('profiles')
    .update({ account_type: s, updated_at: new Date().toISOString() })
    .eq('id', userData.user.id)
}

export async function ensureOwnedCommunity(displayName?: string | null): Promise<CommunityRow | null> {
  if (!supabase) throw new Error('Supabase is niet geconfigureerd.')
  await requireSupabaseAuthSession()
  await upsertProfileFromAuthSession()
  await syncOwnerAccountTypeFromAuthMetadata()
  const { data, error } = await supabase.rpc('ensure_my_community', {
    raw_name: displayName?.trim() || null,
  })
  if (error) {
    const msg = error.message || ''
    if (/not_authenticated|^not_authenticated$/i.test(msg) || /JWT expired|Invalid JWT|session/i.test(msg)) {
      throw new Error(
        'Je bent niet ingelogd bij de server. Log uit en opnieuw in, of ververs de pagina na inloggen.',
      )
    }
    if (/profile_not_found/i.test(msg)) {
      throw new Error(
        'Je profiel ontbreekt in de database voor dit account. Log uit en opnieuw in, of vraag een beheerder om je profiel te controleren.',
      )
    }
    if (/only_bedrijf_or_influencer/i.test(msg)) {
      throw new Error(
        'In je profiel staat geen «bedrijf» of «influencer» als accounttype. Controleer in Supabase bij public.profiles of dit account goed staat, of registreer opnieuw als bedrijf/influencer.',
      )
    }
    throw new Error(`Community aanmaken mislukt: ${msg}`)
  }
  if (!data) return null
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown>
  if (!row) return null
  return {
    id: String(row.id ?? ''),
    owner_user_id: String(row.owner_user_id ?? ''),
    kind: (String(row.kind ?? 'influencer') as CommunityRow['kind']) ?? 'influencer',
    join_code: String(row.join_code ?? ''),
    name: String(row.name ?? 'Community'),
    slug: (row.slug as string | null | undefined) ?? null,
  }
}

export type JoinCommunityResult = {
  ok: boolean
  error?: string
  communityId?: string
  kind?: CommunityRow['kind']
  alreadyMember?: boolean
  /** Legacy RPC; nieuwe flow gebruikt already_member + membership_role */
  alreadyOwner?: boolean
  membershipRole?: string
  ownerRowRepaired?: boolean
}

/** Nederlandse uitleg bij RPC-foutcodes uit join_community_with_code */
export function formatJoinCommunityError(errorKey: string | undefined): string {
  if (!errorKey) return 'Aansluiten is mislukt.'
  const m: Record<string, string> = {
    not_authenticated: 'Je bent niet ingelogd. Log opnieuw in en probeer het nog eens.',
    profile_not_found: 'Je profiel ontbreekt in de database. Log uit en in, of neem contact op.',
    only_individuals_can_join:
      'Alleen particuliere accounts kunnen zich met een code bij een community voegen. Staat je account als bedrijf of influencer in je profiel, gebruik dan een particulier account.',
    invalid_code: 'Deze communitycode bestaat niet of is ongeldig.',
    already_in_a_company_community: 'Je zit al in een bedrijfscommunity; je kunt er maar één hebben.',
    influencer_community_limit_5: 'Je zit al in het maximum van vijf influencercommunities.',
  }
  return m[errorKey] ?? errorKey
}

/**
 * Alleen bijwerken als Auth-metadata én profiel geen bedrijf/influencer zijn — voorkomt per ongeluk overschrijven.
 */
export async function syncProfileAccountTypeIndividu(): Promise<void> {
  if (!supabase) return
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user?.id) return
  const meta = data.user.user_metadata?.account_type
  const metaStr = typeof meta === 'string' ? meta.trim().toLowerCase() : ''
  if (metaStr === 'bedrijf' || metaStr === 'influencer') return
  const { data: pr } = await supabase.from('profiles').select('account_type').eq('id', data.user.id).maybeSingle()
  const cur = typeof pr?.account_type === 'string' ? pr.account_type.trim().toLowerCase() : ''
  if (cur === 'bedrijf' || cur === 'influencer') return
  await supabase
    .from('profiles')
    .update({ account_type: 'individu', updated_at: new Date().toISOString() })
    .eq('id', data.user.id)
}

function parseRpcJsonRecord(data: unknown): Record<string, unknown> {
  if (data == null) return {}
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as Record<string, unknown>
    } catch {
      return {}
    }
  }
  if (typeof data === 'object' && !Array.isArray(data)) return data as Record<string, unknown>
  return {}
}

export async function joinCommunityWithCode(code: string): Promise<JoinCommunityResult> {
  if (!supabase) throw new Error('Supabase is niet geconfigureerd.')
  const trimmed = code.trim().toUpperCase()
  if (!trimmed) throw new Error('Vul een communitycode in.')
  const { data, error } = await supabase.rpc('join_community_with_code', { raw_code: trimmed })
  if (error) throw new Error(error.message)
  const payload = parseRpcJsonRecord(data)
  const ok = payload.ok === true
  const rawCid = payload.community_id
  const communityId =
    typeof rawCid === 'string' ? rawCid : rawCid != null && String(rawCid) !== '' ? String(rawCid) : undefined
  const k = payload.kind
  const mr = payload.membership_role
  return {
    ok,
    error: typeof payload.error === 'string' ? payload.error : undefined,
    communityId,
    kind: k === 'bedrijf' || k === 'influencer' ? k : undefined,
    alreadyMember: payload.already_member === true,
    alreadyOwner: payload.already_owner === true,
    membershipRole: typeof mr === 'string' ? mr : undefined,
    ownerRowRepaired: payload.owner_row_repaired === true,
  }
}

type MembershipRpcRow = {
  id: string
  owner_user_id: string
  kind: string
  join_code: string
  name: string
  slug: string | null
  role: string
}

function normalizeRole(role: unknown): CommunityMemberRole {
  const r = String(role ?? 'member').toLowerCase()
  if (r === 'owner') return 'owner'
  if (r === 'sponsor') return 'sponsor'
  return 'member'
}

function mapRpcMembershipRows(rows: MembershipRpcRow[]): CommunityMembershipRow[] {
  return rows.map((row) => ({
    id: String(row.id),
    owner_user_id: String(row.owner_user_id ?? ''),
    kind: (row.kind === 'bedrijf' ? 'bedrijf' : 'influencer') as CommunityMembershipRow['kind'],
    join_code: String(row.join_code ?? ''),
    name: String(row.name ?? 'Community'),
    slug: row.slug ?? null,
    role: normalizeRole(row.role),
  }))
}

/** Leden: altijd auth-sessie gebruiken; bij voorkeur RPC list_my_community_memberships (SQL-patch). */
export async function fetchMyMembershipCommunities(): Promise<CommunityMembershipRow[]> {
  if (!supabase) return []

  const { data: rpcRows, error: rpcError } = await supabase.rpc('list_my_community_memberships')
  if (!rpcError) {
    const rows = Array.isArray(rpcRows) ? (rpcRows as MembershipRpcRow[]) : []
    return mapRpcMembershipRows(rows)
  }

  const { data: userData, error: userErr } = await supabase.auth.getUser()
  const uid = userData.user?.id
  if (userErr || !uid) return []

  const { data: memberRows, error: memberError } = await supabase
    .from('community_members')
    .select('community_id, role')
    .eq('user_id', uid)
  if (memberError) throw new Error(memberError.message)

  const members = (memberRows ?? []) as Array<{ community_id?: unknown; role?: unknown }>
  const ids = members.map((m) => String(m.community_id ?? '')).filter(Boolean)
  if (ids.length === 0) return []

  const { data: communities, error: commError } = await supabase
    .from('communities')
    .select('id, owner_user_id, kind, join_code, name, slug')
    .in('id', ids)
  if (commError) throw new Error(commError.message)

  const byId = new Map((communities ?? []).map((c) => [String((c as Record<string, unknown>).id ?? ''), c as Record<string, unknown>]))
  return members
    .map((m) => {
      const id = String(m.community_id ?? '')
      const c = byId.get(id)
      if (!c) return null
      return {
        id,
        owner_user_id: String(c.owner_user_id ?? ''),
        kind: (String(c.kind ?? 'influencer') as CommunityMembershipRow['kind']) ?? 'influencer',
        join_code: String(c.join_code ?? ''),
        name: String(c.name ?? 'Community'),
        slug: (c.slug as string | null | undefined) ?? null,
        role: normalizeRole(m.role),
      }
    })
    .filter((x): x is CommunityMembershipRow => Boolean(x))
}

// ============================================================
// Leden beheren (eigenaar)
// ============================================================

export async function fetchCommunityMembers(communityId: string): Promise<CommunityMemberRow[]> {
  if (!supabase) return []
  const { data, error } = await supabase.rpc('list_community_members_for_owner', {
    p_community_id: communityId,
  })
  if (error) throw new Error(error.message)
  const rows = (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>
  return rows.map((r) => ({
    user_id: String(r.user_id ?? ''),
    email: typeof r.email === 'string' ? r.email : null,
    first_name: typeof r.first_name === 'string' ? r.first_name : null,
    last_name: typeof r.last_name === 'string' ? r.last_name : null,
    role: normalizeRole(r.role),
    joined_at: String(r.joined_at ?? new Date().toISOString()),
  }))
}

export async function removeCommunityMember(communityId: string, userId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is niet geconfigureerd.')
  const { data, error } = await supabase.rpc('remove_community_member', {
    p_community_id: communityId,
    p_user_id: userId,
  })
  if (error) throw new Error(error.message)
  const payload = parseRpcJsonRecord(data)
  if (payload.ok !== true) {
    throw new Error(typeof payload.error === 'string' ? payload.error : 'Verwijderen mislukt.')
  }
}

// ============================================================
// Sponsor join
// ============================================================

export async function joinCommunityAsSponsor(code: string): Promise<JoinCommunityResult> {
  if (!supabase) throw new Error('Supabase is niet geconfigureerd.')
  const trimmed = code.trim().toUpperCase()
  if (!trimmed) throw new Error('Vul een communitycode in.')
  const { data, error } = await supabase.rpc('join_community_as_sponsor', { raw_code: trimmed })
  if (error) throw new Error(error.message)
  const payload = parseRpcJsonRecord(data)
  const ok = payload.ok === true
  const rawCid = payload.community_id
  const communityId =
    typeof rawCid === 'string' ? rawCid : rawCid != null && String(rawCid) !== '' ? String(rawCid) : undefined
  return {
    ok,
    error: typeof payload.error === 'string' ? payload.error : undefined,
    communityId,
    kind: undefined,
    alreadyMember: undefined,
    alreadyOwner: payload.already_owner === true,
    membershipRole: 'sponsor',
    ownerRowRepaired: false,
  }
}

// ============================================================
// Community Puntenwinkel
// ============================================================

function mapShopItemRow(row: Record<string, unknown>): CommunityShopItem {
  return {
    id: String(row.id ?? ''),
    community_id: String(row.community_id ?? ''),
    title: String(row.title ?? ''),
    description: typeof row.description === 'string' ? row.description : null,
    cost: Number(row.cost ?? 0),
    stock: Number(row.stock ?? 0),
    emoji: typeof row.emoji === 'string' ? row.emoji : null,
    active: row.active !== false,
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  }
}

export async function fetchCommunityShopItems(
  communityId: string,
  opts: { activeOnly?: boolean } = {},
): Promise<CommunityShopItem[]> {
  if (!supabase) return []
  let q = supabase
    .from('community_shop_items')
    .select('*')
    .eq('community_id', communityId)
    .order('created_at', { ascending: false })
  if (opts.activeOnly) q = q.eq('active', true)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (Array.isArray(data) ? data : []).map((r) => mapShopItemRow(r as Record<string, unknown>))
}

function translateShopRpcError(message: string): string {
  const known: Record<string, string> = {
    not_authenticated: 'Je bent niet ingelogd.',
    not_owner_of_community: 'Alleen de eigenaar van deze community kan dit.',
    item_not_found: 'Dit item bestaat niet meer.',
    title_required: 'Titel is verplicht.',
  }
  const key = message.replace(/^.*?:\s*/, '').trim()
  return known[key] ?? message
}

export async function createCommunityShopItem(input: {
  communityId: string
  title: string
  description?: string | null
  cost: number
  stock?: number
  emoji?: string | null
  active?: boolean
}): Promise<CommunityShopItem> {
  if (!supabase) throw new Error('Supabase is niet geconfigureerd.')
  const { data, error } = await supabase.rpc('create_community_shop_item', {
    p_community_id: input.communityId,
    p_title: input.title,
    p_description: input.description ?? null,
    p_cost: Math.max(0, Math.round(input.cost)),
    p_stock: Math.max(0, Math.round(input.stock ?? 0)),
    p_emoji: input.emoji ?? null,
    p_active: input.active !== false,
  })
  if (error) throw new Error(translateShopRpcError(error.message))
  if (!data) throw new Error('Aanmaken mislukt.')
  const row = Array.isArray(data) ? data[0] : data
  return mapShopItemRow(row as Record<string, unknown>)
}

export async function updateCommunityShopItem(
  id: string,
  patch: Partial<Pick<CommunityShopItem, 'title' | 'description' | 'cost' | 'stock' | 'emoji' | 'active'>>,
): Promise<CommunityShopItem> {
  if (!supabase) throw new Error('Supabase is niet geconfigureerd.')
  const { data, error } = await supabase.rpc('update_community_shop_item', {
    p_item_id: id,
    p_title: patch.title ?? null,
    p_description: patch.description ?? null,
    p_cost: patch.cost !== undefined ? Math.max(0, Math.round(patch.cost)) : null,
    p_stock: patch.stock !== undefined ? Math.max(0, Math.round(patch.stock)) : null,
    p_emoji: patch.emoji ?? null,
    p_active: patch.active ?? null,
  })
  if (error) throw new Error(translateShopRpcError(error.message))
  if (!data) throw new Error('Bijwerken mislukt.')
  const row = Array.isArray(data) ? data[0] : data
  return mapShopItemRow(row as Record<string, unknown>)
}

export async function deleteCommunityShopItem(id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is niet geconfigureerd.')
  const { data, error } = await supabase.rpc('delete_community_shop_item', { p_item_id: id })
  if (error) throw new Error(translateShopRpcError(error.message))
  const payload = parseRpcJsonRecord(data)
  if (payload.ok !== true) {
    throw new Error(translateShopRpcError(typeof payload.error === 'string' ? payload.error : 'Verwijderen mislukt.'))
  }
}

// ============================================================
// Community-punten & inwisselingen
// ============================================================

export type CommunityRedemption = {
  redemption_id: string
  user_id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  address: string | null
  postal_code: string | null
  city: string | null
  country: string | null
  shop_item_id: string
  item_title: string
  item_emoji: string | null
  cost_points: number
  status: 'pending' | 'confirmed' | 'cancelled'
  created_at: string
  confirmed_at: string | null
}

export async function fetchMyCommunityPoints(): Promise<number> {
  if (!supabase) return 0
  const { data, error } = await supabase.rpc('get_my_community_points')
  if (error) return 0
  if (typeof data === 'number') return data
  if (typeof data === 'string') return Number(data) || 0
  return 0
}

export async function fetchMyPendingCommunityPoints(): Promise<number> {
  if (!supabase) return 0
  const { data, error } = await supabase.rpc('get_my_pending_community_points')
  if (error) return 0
  if (typeof data === 'number') return data
  if (typeof data === 'string') return Number(data) || 0
  return 0
}

/**
 * Activeert pending community-punten die >= 72u oud zijn.
 * Safe om bij login op te roepen; geeft {activated, points_added}.
 */
export async function activateMyPendingCommunityPoints(): Promise<{
  activated: number
  pointsAdded: number
}> {
  if (!supabase) return { activated: 0, pointsAdded: 0 }
  const { data, error } = await supabase.rpc('activate_my_pending_community_points')
  if (error) return { activated: 0, pointsAdded: 0 }
  const payload = parseRpcJsonRecord(data)
  if (payload.ok !== true) return { activated: 0, pointsAdded: 0 }
  return {
    activated: typeof payload.activated === 'number' ? payload.activated : 0,
    pointsAdded: typeof payload.points_added === 'number' ? payload.points_added : 0,
  }
}

export async function redeemCommunityShopItem(itemId: string): Promise<{
  ok: boolean
  error?: string
  remainingPoints?: number
  redemptionId?: string
}> {
  if (!supabase) throw new Error('Supabase is niet geconfigureerd.')
  const { data, error } = await supabase.rpc('redeem_community_shop_item', { p_item_id: itemId })
  if (error) throw new Error(error.message)
  const payload = parseRpcJsonRecord(data)
  return {
    ok: payload.ok === true,
    error: typeof payload.error === 'string' ? payload.error : undefined,
    remainingPoints: typeof payload.remaining_points === 'number' ? payload.remaining_points : undefined,
    redemptionId: typeof payload.redemption_id === 'string' ? payload.redemption_id : undefined,
  }
}

export async function listCommunityRedemptionsForOwner(
  communityId: string,
  opts: { includeCancelled?: boolean } = {},
): Promise<CommunityRedemption[]> {
  if (!supabase) return []
  const { data, error } = await supabase.rpc('list_community_redemptions_for_owner', {
    p_community_id: communityId,
    p_include_cancelled: opts.includeCancelled === true,
  })
  if (error) throw new Error(error.message)
  const rows = (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>
  return rows.map((r) => ({
    redemption_id: String(r.redemption_id ?? ''),
    user_id: String(r.user_id ?? ''),
    email: typeof r.email === 'string' ? r.email : null,
    first_name: typeof r.first_name === 'string' ? r.first_name : null,
    last_name: typeof r.last_name === 'string' ? r.last_name : null,
    address: typeof r.address === 'string' ? r.address : null,
    postal_code: typeof r.postal_code === 'string' ? r.postal_code : null,
    city: typeof r.city === 'string' ? r.city : null,
    country: typeof r.country === 'string' ? r.country : null,
    shop_item_id: String(r.shop_item_id ?? ''),
    item_title: String(r.item_title ?? ''),
    item_emoji: typeof r.item_emoji === 'string' ? r.item_emoji : null,
    cost_points: Number(r.cost_points ?? 0),
    status: (r.status === 'confirmed' || r.status === 'cancelled' ? r.status : 'pending') as CommunityRedemption['status'],
    created_at: String(r.created_at ?? new Date().toISOString()),
    confirmed_at: typeof r.confirmed_at === 'string' ? r.confirmed_at : null,
  }))
}

export async function confirmCommunityRedemption(
  redemptionId: string,
  confirmed: boolean,
): Promise<void> {
  if (!supabase) throw new Error('Supabase is niet geconfigureerd.')
  const { data, error } = await supabase.rpc('confirm_community_redemption', {
    p_redemption_id: redemptionId,
    p_confirmed: confirmed,
  })
  if (error) throw new Error(error.message)
  const payload = parseRpcJsonRecord(data)
  if (payload.ok !== true) {
    throw new Error(typeof payload.error === 'string' ? payload.error : 'Bijwerken mislukt.')
  }
}

// ============================================================
// Community posts (feed / activiteiten)
// ============================================================

export type CommunityPost = {
  id: string
  community_id: string
  project_id: string | null
  author_id: string
  author_first_name: string | null
  author_last_name: string | null
  author_email: string | null
  is_owner: boolean
  body: string
  created_at: string
}

function mapPostRow(row: Record<string, unknown>): CommunityPost {
  return {
    id: String(row.id ?? ''),
    community_id: String(row.community_id ?? ''),
    project_id: typeof row.project_id === 'string' ? row.project_id : null,
    author_id: String(row.author_id ?? ''),
    author_first_name: typeof row.author_first_name === 'string' ? row.author_first_name : null,
    author_last_name: typeof row.author_last_name === 'string' ? row.author_last_name : null,
    author_email: typeof row.author_email === 'string' ? row.author_email : null,
    is_owner: row.is_owner === true,
    body: String(row.body ?? ''),
    created_at: String(row.created_at ?? new Date().toISOString()),
  }
}

function translateCommunityPostError(message: string): string {
  const map: Record<string, string> = {
    not_authenticated: 'Je bent niet ingelogd.',
    body_required: 'Schrijf eerst een bericht.',
    body_too_long: 'Je bericht is te lang (max. 8000 tekens).',
    not_a_member: 'Je hebt geen toegang tot deze community.',
    post_not_found: 'Dit bericht bestaat niet meer.',
    not_allowed: 'Alleen de auteur of de community-eigenaar kan dit bericht verwijderen.',
  }
  const key = message.replace(/^.*?:\s*/, '').trim()
  return map[key] ?? message
}

export async function fetchCommunityPosts(
  communityId: string,
  limit = 50,
): Promise<CommunityPost[]> {
  if (!supabase) return []
  const { data, error } = await supabase.rpc('list_community_posts', {
    p_community_id: communityId,
    p_limit: limit,
  })
  if (error) throw new Error(translateCommunityPostError(error.message))
  const rows = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : []
  return rows.map(mapPostRow)
}

export async function createCommunityPost(input: {
  communityId: string
  body: string
  projectId?: string | null
}): Promise<CommunityPost> {
  if (!supabase) throw new Error('Supabase is niet geconfigureerd.')
  const { data, error } = await supabase.rpc('create_community_post', {
    p_community_id: input.communityId,
    p_body: input.body,
    p_project_id: input.projectId ?? null,
  })
  if (error) throw new Error(translateCommunityPostError(error.message))
  if (!data) throw new Error('Plaatsen mislukt.')
  const row = Array.isArray(data) ? data[0] : data
  return mapPostRow(row as Record<string, unknown>)
}

export async function deleteCommunityPost(postId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is niet geconfigureerd.')
  const { data, error } = await supabase.rpc('delete_community_post', { p_post_id: postId })
  if (error) throw new Error(translateCommunityPostError(error.message))
  const payload = parseRpcJsonRecord(data)
  if (payload.ok !== true) {
    throw new Error(
      translateCommunityPostError(typeof payload.error === 'string' ? payload.error : 'Verwijderen mislukt.'),
    )
  }
}

export async function updateMyProfileAddress(input: {
  address?: string | null
  postalCode?: string | null
  city?: string | null
  country?: string | null
}): Promise<void> {
  if (!supabase) throw new Error('Supabase is niet geconfigureerd.')
  const { data, error } = await supabase.rpc('update_my_profile_address', {
    p_address: input.address ?? null,
    p_postal_code: input.postalCode ?? null,
    p_city: input.city ?? null,
    p_country: input.country ?? null,
  })
  if (error) throw new Error(error.message)
  const payload = parseRpcJsonRecord(data)
  if (payload.ok !== true) {
    throw new Error(typeof payload.error === 'string' ? payload.error : 'Opslaan mislukt.')
  }
}

/** Naam + anonimiteit op ranglijst → `profiles` (RPC moet in Supabase bestaan). */
export async function updateMyProfileDisplay(input: {
  firstName: string
  lastName: string
  anonymous: boolean
}): Promise<void> {
  if (!supabase) throw new Error('Supabase is niet geconfigureerd.')
  const { data, error } = await supabase.rpc('update_my_profile_display', {
    p_first_name: input.firstName.trim(),
    p_last_name: input.lastName.trim() || null,
    p_anonymous: input.anonymous,
  })
  if (error) throw new Error(error.message)
  const payload = parseRpcJsonRecord(data)
  if (payload.ok !== true) {
    const err = typeof payload.error === 'string' ? payload.error : 'Opslaan mislukt.'
    if (err === 'first_name_required') throw new Error('Voornaam is verplicht.')
    throw new Error(err)
  }
}

export async function fetchProjectsForCommunity(communityId: string): Promise<Project[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('community_id', communityId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []).map(normalizeProjectRow)
}

export async function fetchProjectsForCommunities(communityIds: string[]): Promise<Project[]> {
  if (!supabase || communityIds.length === 0) return []
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .in('community_id', communityIds)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map(normalizeProjectRow)
}

async function viewerMayAccessMembersOnlyProject(communityId: string, userId: string): Promise<boolean> {
  if (!supabase) return false
  const { data: comm, error: commErr } = await supabase
    .from('communities')
    .select('owner_user_id')
    .eq('id', communityId)
    .maybeSingle()
  if (commErr || !comm) return false
  const ownerId = String((comm as { owner_user_id?: string }).owner_user_id ?? '')
  if (ownerId && ownerId === userId) return true

  const { data: mem } = await supabase
    .from('community_members')
    .select('user_id')
    .eq('community_id', communityId)
    .eq('user_id', userId)
    .maybeSingle()
  return Boolean(mem)
}

export type FetchCommunityProjectDonationResult =
  | { status: 'ok'; project: Project }
  | { status: 'not_found' }
  /** Project is alleen-zichtbaar voor communityleden; gebruiker is niet ingelogd. */
  | { status: 'members_only_need_login' }
  /** Ingelogd maar geen lid/sponsor/eigenaar van deze community. */
  | { status: 'members_only_forbidden' }

/**
 * Project voor de donatiepagina: publiek voor iedereen, of `members_only` voor leden/sponsors/eigenaar.
 */
export async function fetchCommunityProjectForDonation(
  projectId: string,
  viewerUserId: string | null,
): Promise<FetchCommunityProjectDonationResult> {
  if (!supabase) return { status: 'not_found' }
  const { data, error } = await supabase.from('projects').select('*').eq('id', projectId).maybeSingle()
  if (error || !data) return { status: 'not_found' }
  const p = normalizeProjectRow(data as Record<string, unknown>)
  const st = String(p.status || '').toLowerCase()
  if (!p.community_id || (st !== 'actief' && st !== 'active')) return { status: 'not_found' }

  if (p.visibility !== 'members_only') return { status: 'ok', project: p }

  if (!viewerUserId) return { status: 'members_only_need_login' }
  const allowed = await viewerMayAccessMembersOnlyProject(p.community_id, viewerUserId)
  if (!allowed) return { status: 'members_only_forbidden' }
  return { status: 'ok', project: p }
}

/** Alleen nog nuttig als je géén viewer hebt: uitsluitend `visibility === 'public'`. */
export async function fetchPublicCommunityProject(projectId: string): Promise<Project | null> {
  const r = await fetchCommunityProjectForDonation(projectId, null)
  return r.status === 'ok' ? r.project : null
}

export async function createCommunityProject(input: {
  ownerId: string
  communityId: string
  title: string
  description?: string
  targetAmount: number
  charityCauseKey: string
  visibility?: 'public' | 'members_only'
  imageUrl?: string | null
}): Promise<Project> {
  if (!supabase) throw new Error('Supabase is niet geconfigureerd.')

  const { data, error } = await supabase
    .from('projects')
    .insert({
      owner_id: input.ownerId,
      community_id: input.communityId,
      name: input.title,
      description: input.description ?? null,
      goal: input.targetAmount,
      charity_cause_key: input.charityCauseKey,
      visibility: input.visibility ?? 'public',
      image_url: input.imageUrl ?? null,
      status: 'actief',
      created_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Project aanmaken mislukt.')
  return normalizeProjectRow(data as Record<string, unknown>)
}

export async function updateProjectImage(projectId: string, imageUrl: string | null): Promise<void> {
  if (!supabase) throw new Error('Supabase is niet geconfigureerd.')
  const { data, error } = await supabase.rpc('update_project_image', {
    p_project_id: projectId,
    p_image_url: imageUrl,
  })
  if (error) throw new Error(error.message)
  const payload = parseRpcJsonRecord(data)
  if (payload.ok !== true) {
    throw new Error(typeof payload.error === 'string' ? payload.error : 'Bijwerken mislukt.')
  }
}

export type MyCommunityProject = {
  id: string
  community_id: string
  community_name: string
  community_kind: 'bedrijf' | 'influencer'
  title: string
  description: string | null
  target_amount: number
  image_url: string | null
  charity_cause_key: string | null
  status: string
  visibility: string
  created_at: string
}

export async function fetchMyCommunityProjects(): Promise<MyCommunityProject[]> {
  if (!supabase) return []
  const { data, error } = await supabase.rpc('list_my_community_projects')
  if (error) return []
  const rows = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : []
  return rows.map((r) => ({
    id: String(r.id ?? ''),
    community_id: String(r.community_id ?? ''),
    community_name: String(r.community_name ?? 'Community'),
    community_kind: (r.community_kind === 'bedrijf' ? 'bedrijf' : 'influencer') as 'bedrijf' | 'influencer',
    title: String(r.title ?? ''),
    description: typeof r.description === 'string' ? r.description : null,
    target_amount: Number(r.target_amount ?? 0),
    image_url: typeof r.image_url === 'string' ? r.image_url : null,
    charity_cause_key: typeof r.charity_cause_key === 'string' ? r.charity_cause_key : null,
    status: String(r.status ?? 'actief'),
    visibility: String(r.visibility ?? 'public'),
    created_at: String(r.created_at ?? new Date().toISOString()),
  }))
}

export async function updateProjectStatusForOwner(
  projectId: string,
  ownerId: string,
  status: 'actief' | 'verlopen',
): Promise<void> {
  if (!supabase) throw new Error('Supabase is niet geconfigureerd.')
  const { error } = await supabase
    .from('projects')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', projectId)
    .eq('owner_id', ownerId)

  if (error) throw new Error(error.message)
}

export function communityProjectShareUrl(projectId: string): string {
  const base = typeof window !== 'undefined' ? `${window.location.origin}` : ''
  return `${base}/community-project/${projectId}`
}
