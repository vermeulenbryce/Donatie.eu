import { supabase } from '../../lib/supabase'

export type SiteShopItem = {
  id: string
  title: string
  description: string | null
  cost: number
  stock: number
  emoji: string | null
  active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export type SiteShopRedemption = {
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

function toBool(v: unknown, fallback = true): boolean {
  return typeof v === 'boolean' ? v : fallback
}

function mapItem(row: Record<string, unknown>): SiteShopItem {
  return {
    id: String(row.id ?? ''),
    title: String(row.title ?? ''),
    description: typeof row.description === 'string' ? row.description : null,
    cost: Number(row.cost ?? 0),
    stock: Number(row.stock ?? 0),
    emoji: typeof row.emoji === 'string' ? row.emoji : null,
    active: toBool(row.active, true),
    sort_order: Number(row.sort_order ?? 0),
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  }
}

function parseRpc(data: unknown): Record<string, unknown> {
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

export async function fetchSiteShopItems(opts: { activeOnly?: boolean } = {}): Promise<SiteShopItem[]> {
  if (!supabase) return []
  let q = supabase
    .from('site_shop_items')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (opts.activeOnly) q = q.eq('active', true)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (Array.isArray(data) ? data : []).map((r) => mapItem(r as Record<string, unknown>))
}

export async function isPlatformAdmin(): Promise<boolean> {
  if (!supabase) return false
  const { data: userData } = await supabase.auth.getUser()
  const uid = userData.user?.id
  if (!uid) return false
  const { data, error } = await supabase.rpc('is_platform_admin', { p_uid: uid })
  if (error) return false
  return data === true
}

export async function redeemSiteShopItem(
  itemId: string,
): Promise<{ ok: boolean; error?: string; remainingPoints?: number; redemptionId?: string }> {
  if (!supabase) throw new Error('Supabase is niet geconfigureerd.')
  const { data, error } = await supabase.rpc('redeem_site_shop_item', { p_item_id: itemId })
  if (error) throw new Error(error.message)
  const payload = parseRpc(data)
  return {
    ok: payload.ok === true,
    error: typeof payload.error === 'string' ? payload.error : undefined,
    remainingPoints: typeof payload.remaining_points === 'number' ? payload.remaining_points : undefined,
    redemptionId: typeof payload.redemption_id === 'string' ? payload.redemption_id : undefined,
  }
}

export async function createSiteShopItem(input: {
  title: string
  description?: string | null
  cost: number
  stock?: number
  emoji?: string | null
  active?: boolean
  sortOrder?: number
}): Promise<SiteShopItem> {
  if (!supabase) throw new Error('Supabase is niet geconfigureerd.')
  const { data, error } = await supabase
    .from('site_shop_items')
    .insert({
      title: input.title.trim(),
      description: input.description?.trim() || null,
      cost: Math.max(0, Math.round(input.cost)),
      stock: Math.max(0, Math.round(input.stock ?? 0)),
      emoji: input.emoji?.trim() || null,
      active: input.active !== false,
      sort_order: input.sortOrder ?? 0,
    })
    .select()
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Aanmaken mislukt.')
  return mapItem(data as Record<string, unknown>)
}

export async function updateSiteShopItem(
  id: string,
  patch: Partial<Pick<SiteShopItem, 'title' | 'description' | 'cost' | 'stock' | 'emoji' | 'active' | 'sort_order'>>,
): Promise<SiteShopItem> {
  if (!supabase) throw new Error('Supabase is niet geconfigureerd.')
  const update: Record<string, unknown> = {}
  if (patch.title !== undefined) update.title = patch.title.trim()
  if (patch.description !== undefined) update.description = patch.description?.trim() || null
  if (patch.cost !== undefined) update.cost = Math.max(0, Math.round(patch.cost))
  if (patch.stock !== undefined) update.stock = Math.max(0, Math.round(patch.stock))
  if (patch.emoji !== undefined) update.emoji = patch.emoji?.trim() || null
  if (patch.active !== undefined) update.active = patch.active
  if (patch.sort_order !== undefined) update.sort_order = patch.sort_order
  const { data, error } = await supabase.from('site_shop_items').update(update).eq('id', id).select().single()
  if (error || !data) throw new Error(error?.message ?? 'Bijwerken mislukt.')
  return mapItem(data as Record<string, unknown>)
}

export async function deleteSiteShopItem(id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is niet geconfigureerd.')
  const { error } = await supabase.from('site_shop_items').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function listSiteShopRedemptionsForAdmin(
  opts: { includeCancelled?: boolean } = {},
): Promise<SiteShopRedemption[]> {
  if (!supabase) return []
  const { data, error } = await supabase.rpc('list_site_shop_redemptions_for_admin', {
    p_include_cancelled: opts.includeCancelled === true,
  })
  if (error) throw new Error(error.message)
  const rows = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : []
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
    status: (r.status === 'confirmed' || r.status === 'cancelled'
      ? r.status
      : 'pending') as SiteShopRedemption['status'],
    created_at: String(r.created_at ?? new Date().toISOString()),
    confirmed_at: typeof r.confirmed_at === 'string' ? r.confirmed_at : null,
  }))
}

export async function confirmSiteShopRedemption(id: string, confirmed: boolean): Promise<void> {
  if (!supabase) throw new Error('Supabase is niet geconfigureerd.')
  const { data, error } = await supabase.rpc('confirm_site_shop_redemption', {
    p_redemption_id: id,
    p_confirmed: confirmed,
  })
  if (error) throw new Error(error.message)
  const payload = parseRpc(data)
  if (payload.ok !== true) {
    throw new Error(typeof payload.error === 'string' ? payload.error : 'Bijwerken mislukt.')
  }
}

// Normale puntenlevenscyclus (dezelfde flow als community-punten)
export async function fetchMyPendingPoints(): Promise<number> {
  if (!supabase) return 0
  const { data, error } = await supabase.rpc('get_my_pending_points')
  if (error) return 0
  if (typeof data === 'number') return data
  if (typeof data === 'string') return Number(data) || 0
  return 0
}

export async function activateMyPendingPoints(): Promise<{ activated: number; pointsAdded: number }> {
  if (!supabase) return { activated: 0, pointsAdded: 0 }
  const { data, error } = await supabase.rpc('activate_my_pending_points')
  if (error) return { activated: 0, pointsAdded: 0 }
  const payload = parseRpc(data)
  if (payload.ok !== true) return { activated: 0, pointsAdded: 0 }
  return {
    activated: typeof payload.activated === 'number' ? payload.activated : 0,
    pointsAdded: typeof payload.points_added === 'number' ? payload.points_added : 0,
  }
}
