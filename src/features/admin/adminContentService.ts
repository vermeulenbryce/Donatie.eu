import { supabase } from '../../lib/supabase'
import { FAQ_ITEMS } from '../public/demoPublicData'
import { pickBasisSlotRow, type FaqDbShape } from '../public/faqBasisMerge'
import { sendEdgeEmail } from '../../services/edgeFunctions'
import type { FooterData } from '../public/footerLegacyData'
import { isFooterData } from '../public/footerLive'
import type { LegalBlock } from '../public/legalContentDefaults'
import {
  invalidateDonationSiteSettingsCache,
  normalizeDonationAmountsConfig,
  normalizePointsConfig,
  type DonationAmountsConfig,
  type PointsConfig,
} from '../donations/donationSiteSettings'
import { parseHomeNewsCategory, type HomeNewsType } from '../public/homeNewsSeed'

export type { DonationAmountsConfig, PointsConfig } from '../donations/donationSiteSettings'

function requireSupabase() {
  if (!supabase) throw new Error('Supabase is niet geconfigureerd.')
  return supabase
}

// ────────────────────────────────────────────────────────────
// Dashboard
// ────────────────────────────────────────────────────────────
export type AdminDashboardStats = {
  users_total: number
  users_individu: number
  users_bedrijf: number
  users_influencer: number
  communities_total: number
  total_donated_paid: number
  total_points_distributed: number
  active_sessions_5min: number
  volunteer_requests_open: number
  /** Ontbreekt totdat `SQL_COLLECTANT_REQUESTS.sql` is gedraaid. */
  collectant_requests_open?: number
  generated_at: string
}

export async function fetchAdminDashboardStats(): Promise<AdminDashboardStats> {
  const client = requireSupabase()
  const { data, error } = await client.rpc('admin_dashboard_stats')
  if (error) throw new Error(error.message)
  return (data ?? {}) as AdminDashboardStats
}

export type AdminFinanceOverview = {
  period_days: number
  paid_total: number
  paid_count: number
  refunded_total: number
  refunded_count: number
  pending_count: number
  cancelled_count: number
}

function parseAdminFinanceOverview(data: unknown): AdminFinanceOverview {
  const o = (data ?? {}) as Record<string, unknown>
  const n = (x: unknown) => (typeof x === 'number' && !Number.isNaN(x) ? x : Number(x ?? 0))
  return {
    period_days: Math.max(1, Math.floor(n(o.period_days))),
    paid_total: n(o.paid_total),
    paid_count: Math.floor(n(o.paid_count)),
    refunded_total: n(o.refunded_total),
    refunded_count: Math.floor(n(o.refunded_count)),
    pending_count: Math.floor(n(o.pending_count)),
    cancelled_count: Math.floor(n(o.cancelled_count)),
  }
}

/** Periode in dagen (minimaal 1). Alleen admin. */
export async function fetchAdminFinanceOverview(pDays: number): Promise<AdminFinanceOverview> {
  const client = requireSupabase()
  const { data, error } = await client.rpc('admin_finance_overview', {
    p_days: Math.max(1, Math.floor(pDays)),
  })
  if (error) throw new Error(error.message)
  return parseAdminFinanceOverview(data)
}

// ────────────────────────────────────────────────────────────
// Featured causes (uitgelichte doelen op homepage)
// ────────────────────────────────────────────────────────────
export type FeaturedCauseRow = {
  id: string
  cause_key: string
  sort_order: number
  active: boolean
  created_at: string
  updated_at: string
}

// ────────────────────────────────────────────────────────────
// Site settings (branding / homepage, etc.) — publieke nav is vaste `BASE_NAV` in PublicLayout
// ────────────────────────────────────────────────────────────
export type BrandingSettings = {
  logoNavUrl?: string
  logoFooterUrl?: string
  logoAdminUrl?: string
  faviconUrl?: string
}

type SiteSettingRow = {
  key: string
  value: unknown
  updated_by: string | null
  updated_at: string
}

export async function fetchBrandingSettings(): Promise<BrandingSettings> {
  const client = requireSupabase()
  const { data, error } = await client
    .from('site_settings')
    .select('*')
    .eq('key', 'branding')
    .maybeSingle()
  if (error) throw new Error(error.message)
  const row = data as SiteSettingRow | null
  const value = (row?.value ?? {}) as Record<string, unknown>
  return {
    logoNavUrl: typeof value.logoNavUrl === 'string' ? value.logoNavUrl : undefined,
    logoFooterUrl: typeof value.logoFooterUrl === 'string' ? value.logoFooterUrl : undefined,
    logoAdminUrl: typeof value.logoAdminUrl === 'string' ? value.logoAdminUrl : undefined,
    faviconUrl: typeof value.faviconUrl === 'string' ? value.faviconUrl : undefined,
  }
}

export async function saveBrandingSettings(input: BrandingSettings): Promise<void> {
  const client = requireSupabase()
  const value: BrandingSettings = {
    logoNavUrl: input.logoNavUrl?.trim() || undefined,
    logoFooterUrl: input.logoFooterUrl?.trim() || undefined,
    logoAdminUrl: input.logoAdminUrl?.trim() || undefined,
    faviconUrl: input.faviconUrl?.trim() || undefined,
  }
  const { error } = await client
    .from('site_settings')
    .upsert({ key: 'branding', value }, { onConflict: 'key' })
  if (error) throw new Error(error.message)
}

export async function fetchFooterContentSetting(): Promise<FooterData | null> {
  const client = requireSupabase()
  const { data, error } = await client.from('site_settings').select('*').eq('key', 'footer_content').maybeSingle()
  if (error) throw new Error(error.message)
  const row = data as SiteSettingRow | null
  const v = row?.value
  if (v == null) return null
  return isFooterData(v) ? v : null
}

export async function saveFooterContentSetting(data: FooterData): Promise<void> {
  const client = requireSupabase()
  const { error } = await client
    .from('site_settings')
    .upsert({ key: 'footer_content', value: data }, { onConflict: 'key' })
  if (error) throw new Error(error.message)
}

function isLegalBlock(x: unknown): x is LegalBlock {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return typeof o.intro === 'string' && Array.isArray(o.bullets) && o.bullets.every((b) => typeof b === 'string')
}

export async function fetchLegalPagesSetting(): Promise<Record<string, LegalBlock>> {
  const client = requireSupabase()
  const { data, error } = await client.from('site_settings').select('*').eq('key', 'legal_pages').maybeSingle()
  if (error) throw new Error(error.message)
  const row = data as SiteSettingRow | null
  const raw = row?.value
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, LegalBlock> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (isLegalBlock(v)) out[k] = v
  }
  return out
}

export async function saveLegalPagesSetting(data: Record<string, LegalBlock>): Promise<void> {
  const client = requireSupabase()
  const { error } = await client
    .from('site_settings')
    .upsert({ key: 'legal_pages', value: data }, { onConflict: 'key' })
  if (error) throw new Error(error.message)
}

export async function fetchDonationAmountsSetting(): Promise<DonationAmountsConfig> {
  const client = requireSupabase()
  const { data, error } = await client.from('site_settings').select('*').eq('key', 'donation_amounts').maybeSingle()
  if (error) throw new Error(error.message)
  const row = data as SiteSettingRow | null
  return normalizeDonationAmountsConfig(row?.value)
}

export async function saveDonationAmountsSetting(value: DonationAmountsConfig): Promise<void> {
  const client = requireSupabase()
  const { error } = await client
    .from('site_settings')
    .upsert(
      {
        key: 'donation_amounts',
        value: {
          eenmalig_min: value.eenmalig_min,
          maandelijks_min: value.maandelijks_min,
          default_buckets: value.default_buckets,
        },
      },
      { onConflict: 'key' },
    )
  if (error) throw new Error(error.message)
  invalidateDonationSiteSettingsCache()
}

export async function fetchPointsConfigSetting(): Promise<PointsConfig> {
  const client = requireSupabase()
  const { data, error } = await client.from('site_settings').select('*').eq('key', 'points_config').maybeSingle()
  if (error) throw new Error(error.message)
  const row = data as SiteSettingRow | null
  return normalizePointsConfig(row?.value)
}

export async function savePointsConfigSetting(value: PointsConfig): Promise<void> {
  const client = requireSupabase()
  const { error } = await client
    .from('site_settings')
    .upsert(
      {
        key: 'points_config',
        value: {
          divisor: value.divisor,
          pointsPerTenEuro: value.pointsPerTenEuro,
        },
      },
      { onConflict: 'key' },
    )
  if (error) throw new Error(error.message)
  invalidateDonationSiteSettingsCache()
}

// ────────────────────────────────────────────────────────────
// Markten & modules (`site_settings.markten_modules`)
// ────────────────────────────────────────────────────────────
export type MarktenModuleEntry = { id: string; enabled: boolean; label?: string }
export type MarktenCampaignEntry = { id: string; title?: string; active?: boolean }
export type MarktenModulesConfig = {
  modules: MarktenModuleEntry[]
  campaigns: MarktenCampaignEntry[]
}

const DEFAULT_MARKTEN_MODULES: MarktenModulesConfig = { modules: [], campaigns: [] }

function slugId(s: string) {
  return s.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
}

function parseMarktenModulesConfig(raw: unknown): MarktenModulesConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_MARKTEN_MODULES, modules: [], campaigns: [] }
  const o = raw as Record<string, unknown>
  const modulesIn = Array.isArray(o.modules) ? o.modules : []
  const campaignsIn = Array.isArray(o.campaigns) ? o.campaigns : []
  const modules: MarktenModuleEntry[] = []
  for (const m of modulesIn) {
    if (!m || typeof m !== 'object') continue
    const r = m as Record<string, unknown>
    const id = typeof r.id === 'string' ? slugId(r.id) : ''
    if (!id) continue
    modules.push({
      id,
      enabled: r.enabled === true,
      label: typeof r.label === 'string' ? r.label : undefined,
    })
  }
  const campaigns: MarktenCampaignEntry[] = []
  for (const c of campaignsIn) {
    if (!c || typeof c !== 'object') continue
    const r = c as Record<string, unknown>
    const id = typeof r.id === 'string' ? slugId(r.id) : ''
    if (!id) continue
    campaigns.push({
      id,
      title: typeof r.title === 'string' ? r.title : undefined,
      active: r.active === true,
    })
  }
  return { modules, campaigns }
}

export function normalizeMarktenModulesConfig(value: unknown): MarktenModulesConfig {
  return parseMarktenModulesConfig(value)
}

export async function fetchMarktenModulesSetting(): Promise<MarktenModulesConfig> {
  const client = requireSupabase()
  const { data, error } = await client.from('site_settings').select('*').eq('key', 'markten_modules').maybeSingle()
  if (error) throw new Error(error.message)
  const row = data as SiteSettingRow | null
  return parseMarktenModulesConfig(row?.value)
}

export async function saveMarktenModulesSetting(value: MarktenModulesConfig): Promise<void> {
  const client = requireSupabase()
  const byMod = new Map<string, MarktenModuleEntry>()
  for (const m of value.modules) {
    const id = slugId(m.id)
    if (!id) continue
    byMod.set(id, {
      id,
      enabled: m.enabled === true,
      label: m.label?.trim() || undefined,
    })
  }
  const byCamp = new Map<string, MarktenCampaignEntry>()
  for (const c of value.campaigns) {
    const id = slugId(c.id)
    if (!id) continue
    byCamp.set(id, {
      id,
      title: c.title?.trim() || undefined,
      active: c.active === true,
    })
  }
  const { error } = await client
    .from('site_settings')
    .upsert(
      {
        key: 'markten_modules',
        value: {
          modules: Array.from(byMod.values()),
          campaigns: Array.from(byCamp.values()),
        },
      },
      { onConflict: 'key' },
    )
  if (error) throw new Error(error.message)
}

// ────────────────────────────────────────────────────────────
// E-mail templates (site_email_templates) — beheer in admin, verzending via send-email
// ────────────────────────────────────────────────────────────
export type SiteEmailTemplateRow = {
  key: string
  subject: string
  html: string
  updated_at: string
}

export async function fetchSiteEmailTemplates(): Promise<SiteEmailTemplateRow[]> {
  const client = requireSupabase()
  const { data, error } = await client
    .from('site_email_templates')
    .select('key, subject, html, updated_at')
    .order('key', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as SiteEmailTemplateRow[]
}

export async function upsertSiteEmailTemplate(row: { key: string; subject: string; html: string }): Promise<void> {
  const client = requireSupabase()
  const k = row.key.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
  if (!k) throw new Error('Key is verplicht (letters, cijfers, - en _).')
  const { error } = await client
    .from('site_email_templates')
    .upsert(
      {
        key: k,
        subject: row.subject.trim() || '(geen onderwerp)',
        html: row.html,
      },
      { onConflict: 'key' },
    )
  if (error) throw new Error(error.message)
}

export async function deleteSiteEmailTemplate(key: string): Promise<void> {
  const client = requireSupabase()
  const { error } = await client.from('site_email_templates').delete().eq('key', key)
  if (error) throw new Error(error.message)
}

// ────────────────────────────────────────────────────────────
// Charity causes (goede doelen beheer)
// ────────────────────────────────────────────────────────────
export type SiteCharityCauseRow = {
  cause_key: string
  label: string
  active: boolean
  sort_order: number
  created_at: string
}

export async function fetchSiteCharityCauses(onlyActive = false): Promise<SiteCharityCauseRow[]> {
  const client = requireSupabase()
  let q = client.from('site_charity_causes').select('*').order('sort_order', { ascending: true })
  if (onlyActive) q = q.eq('active', true)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as SiteCharityCauseRow[]
}

export async function upsertSiteCharityCause(
  row: Partial<SiteCharityCauseRow> & { cause_key: string; label: string },
): Promise<SiteCharityCauseRow> {
  const client = requireSupabase()
  const active = typeof row.active === 'boolean' ? row.active : true
  const { data, error } = await client
    .from('site_charity_causes')
    .upsert({ ...row, active })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as SiteCharityCauseRow
}

/** Zet elke regel in `site_charity_causes` op zichtbaar; per-doel toggle blijft daarna werken. */
export async function setAllSiteCharityCausesActive(): Promise<void> {
  const client = requireSupabase()
  const { error } = await client
    .from('site_charity_causes')
    .update({ active: true })
    .not('cause_key', 'is', null)
  if (error) throw new Error(error.message)
}

const CBF_IMPORT_CHUNK = 200

/**
 * Vult/actualiseert `site_charity_causes` met de volledige CBF-lijst (o.a. uit `cbfCauses.generated.ts`).
 * Alles `active: true` zodat /goede-doelen dezelfde doelen toont, met sector uit de client-side CBF-data (filters dieren, welzijn, … blijven kloppen). Bestaande `cause_key`-rijen worden overschreven.
 */
export async function importAllCbfCausesToSite(
  items: readonly { id: number; naam: string }[],
): Promise<{ count: number }> {
  if (items.length === 0) return { count: 0 }
  const client = requireSupabase()
  const rows = items.map((c, idx) => ({
    cause_key: `cbf-${c.id}`,
    label: c.naam,
    active: true,
    sort_order: (idx + 1) * 10,
  }))
  for (let i = 0; i < rows.length; i += CBF_IMPORT_CHUNK) {
    const chunk = rows.slice(i, i + CBF_IMPORT_CHUNK)
    const { error } = await client
      .from('site_charity_causes')
      .upsert(chunk, { onConflict: 'cause_key' })
    if (error) throw new Error(error.message)
  }
  return { count: rows.length }
}

export async function deleteSiteCharityCause(causeKey: string): Promise<void> {
  const client = requireSupabase()
  const { error } = await client.from('site_charity_causes').delete().eq('cause_key', causeKey)
  if (error) throw new Error(error.message)
}

export async function fetchFeaturedCauses(): Promise<FeaturedCauseRow[]> {
  const client = requireSupabase()
  const { data, error } = await client
    .from('site_featured_causes')
    .select('*')
    .order('sort_order', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as FeaturedCauseRow[]
}

export async function addFeaturedCause(causeKey: string, sortOrder: number): Promise<FeaturedCauseRow> {
  const client = requireSupabase()
  const { data, error } = await client
    .from('site_featured_causes')
    .insert({ cause_key: causeKey, sort_order: sortOrder, active: true })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as FeaturedCauseRow
}

export async function updateFeaturedCause(
  id: string,
  patch: Partial<Pick<FeaturedCauseRow, 'active' | 'sort_order'>>,
): Promise<void> {
  const client = requireSupabase()
  const { error } = await client.from('site_featured_causes').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteFeaturedCause(id: string): Promise<void> {
  const client = requireSupabase()
  const { error } = await client.from('site_featured_causes').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ────────────────────────────────────────────────────────────
// FAQ items
// ────────────────────────────────────────────────────────────
export type FaqItemRow = {
  id: string
  category: string
  question: string
  answer: string
  sort_order: number
  active: boolean
  created_at: string
  updated_at: string
}

/** Admin: vaste basis-slots + DB; `is_placeholder` = alleen in code, nog niet opgeslagen. */
export type FaqAdminRow = FaqItemRow & {
  is_basis_slot: boolean
  is_placeholder: boolean
}

export async function fetchFaqItems(onlyActive = false): Promise<FaqItemRow[]> {
  const client = requireSupabase()
  let q = client.from('site_faq_items').select('*').order('sort_order', { ascending: true })
  if (onlyActive) q = q.eq('active', true)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as FaqItemRow[]
}

/** Basisvragen uit `FAQ_ITEMS` staan gefuseerd met `site_faq_items` (bewerkbaar als er een rij bestaat). */
export async function fetchFaqItemsForAdmin(): Promise<FaqAdminRow[]> {
  const rows = await fetchFaqItems(false)
  const asShapes: FaqDbShape[] = rows.map((r) => ({
    id: r.id,
    category: r.category,
    question: r.question,
    answer: r.answer,
    sort_order: r.sort_order,
    active: r.active,
  }))
  const used = new Set<string>()
  const basis: FaqAdminRow[] = []
  for (let i = 0; i < FAQ_ITEMS.length; i++) {
    const f = FAQ_ITEMS[i]
    const hit = pickBasisSlotRow(i, f, asShapes, used)
    if (hit) {
      const row = rows.find((r) => r.id === hit.id)
      if (!row) continue
      used.add(hit.id)
      basis.push({ ...row, is_basis_slot: true, is_placeholder: false })
    } else {
      basis.push({
        id: '',
        category: 'basis',
        question: f.q,
        answer: f.a,
        sort_order: i * 10,
        active: true,
        created_at: '',
        updated_at: '',
        is_basis_slot: true,
        is_placeholder: true,
      })
    }
  }
  const extras = rows
    .filter((r) => !used.has(r.id))
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((r) => ({ ...r, is_basis_slot: false, is_placeholder: false }))
  return [...basis, ...extras]
}

export async function upsertFaqItem(
  row: Partial<FaqItemRow> & { question: string; answer: string },
): Promise<FaqItemRow> {
  const client = requireSupabase()
  const { data, error } = await client.from('site_faq_items').upsert(row).select().single()
  if (error) throw new Error(error.message)
  return data as FaqItemRow
}

export async function deleteFaqItem(id: string): Promise<void> {
  const client = requireSupabase()
  const { error } = await client.from('site_faq_items').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ────────────────────────────────────────────────────────────
// News posts
// ────────────────────────────────────────────────────────────
export type NewsPostRow = {
  id: string
  title: string
  slug: string | null
  excerpt: string | null
  body: string | null
  image_url: string | null
  category: HomeNewsType
  published: boolean
  published_at: string | null
  author_id: string | null
  created_at: string
  updated_at: string
}

export async function fetchNewsPosts(onlyPublished = false): Promise<NewsPostRow[]> {
  const client = requireSupabase()
  let q = client.from('site_news_posts').select('*').order('created_at', { ascending: false })
  if (onlyPublished) q = q.eq('published', true)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []).map((raw) => {
    const r = raw as Omit<NewsPostRow, 'category'> & { category?: string | null }
    return {
      ...r,
      category: parseHomeNewsCategory(r.category),
    } as NewsPostRow
  })
}

export async function upsertNewsPost(
  row: Partial<NewsPostRow> & { title: string },
): Promise<NewsPostRow> {
  const client = requireSupabase()
  const payload: Record<string, unknown> = { ...row }
  if (row.published && !row.published_at) payload.published_at = new Date().toISOString()
  const { data, error } = await client.from('site_news_posts').upsert(payload).select().single()
  if (error) throw new Error(error.message)
  return data as NewsPostRow
}

export async function deleteNewsPost(id: string): Promise<void> {
  const client = requireSupabase()
  const { error } = await client.from('site_news_posts').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ────────────────────────────────────────────────────────────
// Homepage settings (bestaande singleton-tabel homepage_settings, id=1)
// ────────────────────────────────────────────────────────────
export type HomepageSettingsRow = {
  id: number
  badge: string
  h1: string
  h1em: string
  desc: string
  cta1: string
  trust_count: string
  trust_text: string
  stats_live: boolean
  stat1: string; stat1_lbl: string
  stat2: string; stat3: string; stat4: string
  card1_val: string; card1_sub: string
  card2_name1: string; card2_name2: string; card2_name3: string
  card3_badge1: string; card3_badge2: string; card3_badge3: string
  updated_at: string
  updated_by: string | null
}

export async function fetchHomepageSettings(): Promise<HomepageSettingsRow | null> {
  const client = requireSupabase()
  const { data, error } = await client.from('homepage_settings').select('*').eq('id', 1).maybeSingle()
  if (error) throw new Error(error.message)
  return (data as HomepageSettingsRow) ?? null
}

export async function updateHomepageSettings(patch: Partial<HomepageSettingsRow>): Promise<void> {
  const client = requireSupabase()
  const { error } = await client.from('homepage_settings').update(patch).eq('id', 1)
  if (error) throw new Error(error.message)
}

// ────────────────────────────────────────────────────────────
// Volunteer requests
// ────────────────────────────────────────────────────────────
export type VolunteerRequestRow = {
  id: string
  user_id: string
  motivation: string | null
  availability: string | null
  phone: string | null
  status: 'pending' | 'approved' | 'rejected'
  reviewed_by: string | null
  reviewed_at: string | null
  reviewer_note: string | null
  created_at: string
  updated_at: string
}

export type VolunteerRequestWithProfile = VolunteerRequestRow & {
  email: string | null
  first_name: string | null
  last_name: string | null
}

export async function fetchVolunteerRequests(
  status?: VolunteerRequestRow['status'],
): Promise<VolunteerRequestWithProfile[]> {
  const client = requireSupabase()
  /* Geen join: user_id-FK wijst naar auth.users, niet profiles — PostgREST embed faalt. */
  let q = client.from('volunteer_requests').select('*').order('created_at', { ascending: false })
  if (status) q = q.eq('status', status)
  const { data: rows, error } = await q
  if (error) throw new Error(error.message)
  const list = (rows ?? []) as VolunteerRequestRow[]
  if (list.length === 0) return []

  const userIds = [...new Set(list.map((r) => r.user_id))]
  const { data: profs, error: pErr } = await client
    .from('profiles')
    .select('id, email, first_name, last_name')
    .in('id', userIds)
  if (pErr) throw new Error(pErr.message)
  const byId = new Map(
    (profs ?? []).map((p) => {
      const x = p as { id: string; email: string | null; first_name: string | null; last_name: string | null }
      return [x.id, x] as const
    }),
  )
  return list.map((r) => {
    const p = byId.get(r.user_id)
    return {
      ...r,
      email: p?.email ?? null,
      first_name: p?.first_name ?? null,
      last_name: p?.last_name ?? null,
    }
  })
}

export async function setVolunteerRequestStatus(
  id: string,
  status: 'approved' | 'rejected',
  reviewerNote?: string,
): Promise<void> {
  const client = requireSupabase()
  const { error } = await client
    .from('volunteer_requests')
    .update({
      status,
      reviewer_note: reviewerNote ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw new Error(error.message)

  if (status === 'approved') {
    try {
      const { data: v } = await client.from('volunteer_requests').select('user_id').eq('id', id).maybeSingle()
      const uid = (v as { user_id?: string } | null)?.user_id
      if (uid) {
        const { data: p } = await client
          .from('profiles')
          .select('email, first_name, last_name')
          .eq('id', uid)
          .maybeSingle()
        const pr = p as { email: string | null; first_name: string | null; last_name: string | null } | null
        if (pr?.email?.includes('@')) {
          const name =
            [pr.first_name, pr.last_name].map((s) => (s ?? '').trim()).filter(Boolean).join(' ') || 'deelnemer'
          void sendEdgeEmail({ to: pr.email, type: 'volunteer_approved', payload: { name } }).catch(() => undefined)
        }
      }
    } catch {
      /* optioneel: geen falen op mail */
    }
  }
}

// ────────────────────────────────────────────────────────────
// Communities (Influencers & bedrijven — admin overzicht)
// ────────────────────────────────────────────────────────────
export type AdminCommunityListRow = {
  id: string
  owner_user_id: string
  kind: 'bedrijf' | 'influencer'
  join_code: string
  name: string
  slug: string | null
  created_at: string
  member_count: number
  owner_email: string | null
  owner_first_name: string | null
  owner_last_name: string | null
}

/**
 * Alle communities + ledentelling (via community_members) + profielgegevens eigenaar.
 * RLS: zie `docs/SQL_ADMIN_INFLUENCERS_COMMUNITIES_READ.sql`.
 */
export async function fetchAdminCommunitiesList(): Promise<AdminCommunityListRow[]> {
  const client = requireSupabase()
  const { data: comms, error } = await client
    .from('communities')
    .select('id, owner_user_id, kind, join_code, name, slug, created_at')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  const list = (comms ?? []) as Array<{
    id: string
    owner_user_id: string
    kind: string
    join_code: string
    name: string
    slug: string | null
    created_at: string
  }>
  if (list.length === 0) return []

  const { data: memRows, error: mErr } = await client.from('community_members').select('community_id')
  if (mErr) throw new Error(mErr.message)
  const memberCount = new Map<string, number>()
  for (const m of (memRows ?? []) as Array<{ community_id: string }>) {
    const id = String(m.community_id)
    memberCount.set(id, (memberCount.get(id) ?? 0) + 1)
  }

  const ownerIds = [...new Set(list.map((c) => c.owner_user_id))]
  const { data: profs, error: pErr } = await client
    .from('profiles')
    .select('id, email, first_name, last_name')
    .in('id', ownerIds)
  if (pErr) throw new Error(pErr.message)
  const byOwner = new Map(
    (profs ?? []).map((p) => {
      const x = p as { id: string; email: string | null; first_name: string | null; last_name: string | null }
      return [x.id, x] as const
    }),
  )

  return list.map((c) => {
    const p = byOwner.get(c.owner_user_id)
    const k = c.kind === 'bedrijf' || c.kind === 'influencer' ? c.kind : 'influencer'
    return {
      id: c.id,
      owner_user_id: c.owner_user_id,
      kind: k,
      join_code: c.join_code,
      name: c.name,
      slug: c.slug,
      created_at: c.created_at,
      member_count: memberCount.get(c.id) ?? 0,
      owner_email: p?.email ?? null,
      owner_first_name: p?.first_name ?? null,
      owner_last_name: p?.last_name ?? null,
    }
  })
}

export type AdminCommunityMemberDetailRow = {
  user_id: string
  role: 'owner' | 'member' | 'sponsor'
  joined_at: string
  email: string | null
  first_name: string | null
  last_name: string | null
}

/**
 * Leden + profielen voor één community. RLS: community_members (admin) + profiles.
 * Zie ook `docs/SQL_ADMIN_INFLUENCERS_COMMUNITIES_READ.sql` voor leden-SELECT.
 */
export async function fetchAdminCommunityMemberDetails(
  communityId: string,
): Promise<AdminCommunityMemberDetailRow[]> {
  const client = requireSupabase()
  const { data: mems, error } = await client
    .from('community_members')
    .select('user_id, role, joined_at')
    .eq('community_id', communityId)
    .order('joined_at', { ascending: false })
  if (error) throw new Error(error.message)
  const list = (mems ?? []) as Array<{ user_id: string; role: string; joined_at: string }>
  if (list.length === 0) return []
  const norm = (r: string): AdminCommunityMemberDetailRow['role'] => {
    if (r === 'owner' || r === 'sponsor' || r === 'member') return r
    return 'member'
  }
  const uids = [...new Set(list.map((m) => m.user_id))]
  const { data: profs, error: pErr } = await client
    .from('profiles')
    .select('id, email, first_name, last_name')
    .in('id', uids)
  if (pErr) throw new Error(pErr.message)
  const byId = new Map(
    (profs ?? []).map((p) => {
      const x = p as { id: string; email: string | null; first_name: string | null; last_name: string | null }
      return [x.id, x] as const
    }),
  )
  return list.map((m) => {
    const p = byId.get(m.user_id)
    return {
      user_id: m.user_id,
      role: norm(m.role),
      joined_at: m.joined_at,
      email: p?.email ?? null,
      first_name: p?.first_name ?? null,
      last_name: p?.last_name ?? null,
    }
  })
}

export type AdminCommunityPostRow = {
  id: string
  body: string
  created_at: string
  project_id: string | null
  author_id: string
  author_label: string
}

/** Rechtstreekse `community_posts`-lees: RLS `SQL_ADMIN_COMMUNITY_BEHEER_READ.sql`. */
export async function fetchAdminCommunityPosts(
  communityId: string,
  limit = 100,
): Promise<AdminCommunityPostRow[]> {
  const client = requireSupabase()
  const { data: posts, error } = await client
    .from('community_posts')
    .select('id, body, created_at, project_id, author_id')
    .eq('community_id', communityId)
    .order('created_at', { ascending: false })
    .limit(Math.min(200, Math.max(1, limit)))
  if (error) throw new Error(error.message)
  const list = (posts ?? []) as Array<{
    id: string
    body: string
    created_at: string
    project_id: string | null
    author_id: string
  }>
  if (list.length === 0) return []
  const aids = [...new Set(list.map((p) => p.author_id))]
  const { data: profs, error: pErr } = await client
    .from('profiles')
    .select('id, email, first_name, last_name')
    .in('id', aids)
  if (pErr) throw new Error(pErr.message)
  const byId = new Map(
    (profs ?? []).map((p) => {
      const x = p as { id: string; email: string | null; first_name: string | null; last_name: string | null }
      return [x.id, x] as const
    }),
  )
  const authorLabel = (authorId: string) => {
    const x = byId.get(authorId)
    if (!x) return '—'
    const n = [x.first_name, x.last_name]
      .map((s) => (s ?? '').trim())
      .filter(Boolean)
      .join(' ')
    return n || x.email || '—'
  }
  return list.map((row) => ({
    id: row.id,
    body: row.body,
    created_at: row.created_at,
    project_id: row.project_id,
    author_id: row.author_id,
    author_label: authorLabel(row.author_id),
  }))
}

export async function createVolunteerRequest(input: {
  userId: string
  motivation: string
  availability?: string
  phone?: string
}): Promise<VolunteerRequestRow> {
  const client = requireSupabase()
  const { data, error } = await client
    .from('volunteer_requests')
    .insert({
      user_id: input.userId,
      motivation: input.motivation.trim() || null,
      availability: input.availability?.trim() || null,
      phone: input.phone?.trim() || null,
      status: 'pending',
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as VolunteerRequestRow
}

export async function fetchMyVolunteerRequest(userId: string): Promise<VolunteerRequestRow | null> {
  const client = requireSupabase()
  const { data, error } = await client
    .from('volunteer_requests')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as VolunteerRequestRow) ?? null
}

// ────────────────────────────────────────────────────────────
// Collectant requests (zelfde velden als vrijwilliger)
// ────────────────────────────────────────────────────────────
export type CollectantRequestRow = VolunteerRequestRow
export type CollectantRequestWithProfile = VolunteerRequestWithProfile

export async function fetchCollectantRequests(
  status?: VolunteerRequestRow['status'],
): Promise<CollectantRequestWithProfile[]> {
  const client = requireSupabase()
  let q = client.from('collectant_requests').select('*').order('created_at', { ascending: false })
  if (status) q = q.eq('status', status)
  const { data: rows, error } = await q
  if (error) throw new Error(error.message)
  const list = (rows ?? []) as CollectantRequestRow[]
  if (list.length === 0) return []

  const userIds = [...new Set(list.map((r) => r.user_id))]
  const { data: profs, error: pErr } = await client
    .from('profiles')
    .select('id, email, first_name, last_name')
    .in('id', userIds)
  if (pErr) throw new Error(pErr.message)
  const byId = new Map(
    (profs ?? []).map((p) => {
      const x = p as { id: string; email: string | null; first_name: string | null; last_name: string | null }
      return [x.id, x] as const
    }),
  )
  return list.map((r) => {
    const p = byId.get(r.user_id)
    return {
      ...r,
      email: p?.email ?? null,
      first_name: p?.first_name ?? null,
      last_name: p?.last_name ?? null,
    }
  })
}

export async function setCollectantRequestStatus(
  id: string,
  status: 'approved' | 'rejected',
  reviewerNote?: string,
): Promise<void> {
  const client = requireSupabase()
  const { error } = await client
    .from('collectant_requests')
    .update({
      status,
      reviewer_note: reviewerNote ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw new Error(error.message)

  if (status === 'approved') {
    try {
      const { data: v } = await client.from('collectant_requests').select('user_id').eq('id', id).maybeSingle()
      const uid = (v as { user_id?: string } | null)?.user_id
      if (uid) {
        const { data: p } = await client
          .from('profiles')
          .select('email, first_name, last_name')
          .eq('id', uid)
          .maybeSingle()
        const pr = p as { email: string | null; first_name: string | null; last_name: string | null } | null
        if (pr?.email?.includes('@')) {
          const name =
            [pr.first_name, pr.last_name].map((s) => (s ?? '').trim()).filter(Boolean).join(' ') || 'deelnemer'
          void sendEdgeEmail({ to: pr.email, type: 'collectant_approved', payload: { name } }).catch(() => undefined)
        }
      }
    } catch {
      /* mail optioneel */
    }
  }
}

export async function createCollectantRequest(input: {
  userId: string
  motivation: string
  availability?: string
  phone: string
}): Promise<CollectantRequestRow> {
  const client = requireSupabase()
  const { data, error } = await client
    .from('collectant_requests')
    .insert({
      user_id: input.userId,
      motivation: input.motivation.trim() || null,
      availability: input.availability?.trim() || null,
      phone: input.phone.trim() || null,
      status: 'pending',
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as CollectantRequestRow
}

export async function fetchMyCollectantRequest(userId: string): Promise<CollectantRequestRow | null> {
  const client = requireSupabase()
  const { data, error } = await client
    .from('collectant_requests')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as CollectantRequestRow) ?? null
}

// ────────────────────────────────────────────────────────────
// Donations (admin betalingen + finance)
// ────────────────────────────────────────────────────────────
export type DonationAdminRow = {
  id: string
  created_at: string
  paid_at: string | null
  refunded_at: string | null
  amount: number
  amount_to_charity: number | null
  amount_retained: number | null
  status: string
  type: string | null
  donor_user_id: string | null
  donor_email: string | null
  donor_name: string | null
  charity_name: string | null
  charity_id: number | null
  payment_method: string | null
  mollie_payment_id: string | null
  project_id: string | null
}

export async function fetchAdminDonations(limit = 100, query = ''): Promise<DonationAdminRow[]> {
  const client = requireSupabase()
  let q = client
    .from('donations')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (query.trim()) {
    const needle = `%${query.trim()}%`
    q = q.or(`donor_email.ilike.${needle},donor_name.ilike.${needle},charity_name.ilike.${needle}`)
  }
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as DonationAdminRow[]
}

export type AdminProjectListRow = {
  id: string
  title: string
  community_id: string | null
  owner_id: string | null
  status: string
  visibility: string | null
  target_amount: number
  raised_hint: number
  charity_cause_key: string | null
  created_at: string
}

/** Admin: alle community-projecten uit `public.projects`. */
export async function fetchAdminProjectsList(search = '', limit = 500): Promise<AdminProjectListRow[]> {
  const client = requireSupabase()
  let q = client.from('projects').select('*').order('created_at', { ascending: false }).limit(limit)
  if (search.trim()) {
    const needle = `%${search.trim()}%`
    q = q.or(`name.ilike.${needle},title.ilike.${needle},description.ilike.${needle}`)
  }
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>
    return {
      id: String(r.id ?? ''),
      title: String(r.name ?? r.title ?? 'Project').trim(),
      community_id: typeof r.community_id === 'string' ? r.community_id : null,
      owner_id: typeof r.owner_id === 'string' ? r.owner_id : null,
      status: String(r.status ?? ''),
      visibility: typeof r.visibility === 'string' ? r.visibility : null,
      target_amount: Math.max(0, Number(r.target_amount ?? r.goal ?? 0)),
      raised_hint: Math.max(0, Number(r.raised_amount ?? r.amount_raised ?? r.raised ?? 0)),
      charity_cause_key: typeof r.charity_cause_key === 'string' ? r.charity_cause_key : null,
      created_at: String(r.created_at ?? ''),
    }
  })
}

export async function fetchAdminDonationsForProject(projectId: string): Promise<DonationAdminRow[]> {
  const client = requireSupabase()
  const { data, error } = await client
    .from('donations')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) throw new Error(error.message)
  return (data ?? []) as DonationAdminRow[]
}

// ────────────────────────────────────────────────────────────
// Site shop items (puntenwinkel admin)
// ────────────────────────────────────────────────────────────
export type SiteShopItemRow = {
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

export async function fetchSiteShopItems(): Promise<SiteShopItemRow[]> {
  const client = requireSupabase()
  const { data, error } = await client
    .from('site_shop_items')
    .select('*')
    .order('sort_order', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as SiteShopItemRow[]
}

export async function upsertSiteShopItem(
  row: Partial<SiteShopItemRow> & { title: string; cost: number },
): Promise<SiteShopItemRow> {
  const client = requireSupabase()
  const { data, error } = await client.from('site_shop_items').upsert(row).select().single()
  if (error) throw new Error(error.message)
  return data as SiteShopItemRow
}

export async function deleteSiteShopItem(id: string): Promise<void> {
  const client = requireSupabase()
  const { error } = await client.from('site_shop_items').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ────────────────────────────────────────────────────────────
// Site notifications (meldingen + push)
// ────────────────────────────────────────────────────────────
export type NotificationRow = {
  id: string
  type: 'melding' | 'push' | 'actie'
  from_user_id: string | null
  target_user_id: string | null
  title: string
  body: string | null
  icon: string | null
  data: Record<string, unknown>
  read_at: string | null
  created_at: string
}

export async function fetchNotifications(type?: NotificationRow['type']): Promise<NotificationRow[]> {
  const client = requireSupabase()
  let q = client.from('site_notifications').select('*').order('created_at', { ascending: false }).limit(200)
  if (type) q = q.eq('type', type)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as NotificationRow[]
}

export async function createPushNotification(input: {
  targetUserId: string | null
  title: string
  body?: string
  icon?: string
  data?: Record<string, unknown>
}): Promise<void> {
  const client = requireSupabase()
  const { error } = await client.from('site_notifications').insert({
    type: 'push',
    target_user_id: input.targetUserId,
    title: input.title.trim(),
    body: input.body?.trim() || null,
    icon: input.icon?.trim() || null,
    data: input.data ?? {},
  })
  if (error) throw new Error(error.message)
}

export async function deleteNotification(id: string): Promise<void> {
  const client = requireSupabase()
  const { error } = await client.from('site_notifications').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function markNotificationRead(id: string): Promise<void> {
  const client = requireSupabase()
  const { error } = await client
    .from('site_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

// ────────────────────────────────────────────────────────────
// Admin user search (voor push-target-kiezer, shadow-view)
// ────────────────────────────────────────────────────────────
export type AdminSearchUserRow = {
  user_id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  account_type: string | null
  is_volunteer: boolean
  is_admin: boolean
  points: number
  total_donated: number
  created_at: string | null
  /** Null = nooit quiz gedaan. */
  quiz_completed_at: string | null
}

function mapAdminSearchUserRow(x: Record<string, unknown>): AdminSearchUserRow {
  return {
    user_id: String(x.user_id ?? ''),
    email: (x.email as string) ?? null,
    first_name: (x.first_name as string) ?? null,
    last_name: (x.last_name as string) ?? null,
    account_type: (x.account_type as string) ?? null,
    is_volunteer: x.is_volunteer === true,
    is_admin: x.is_admin === true,
    points: Number(x.points ?? 0),
    total_donated: Number(x.total_donated ?? 0),
    created_at: (x.created_at as string) ?? null,
    quiz_completed_at: (x.quiz_completed_at as string | null | undefined) ?? null,
  }
}

export async function adminSearchUsers(
  query: string,
  limit = 20,
  offset = 0,
  /** Optioneel: toon alleen gebruikers met minstens één van deze CBF doel-id’s in hun opgeslagen quiz (top-10). */
  filterCauseIds?: number[] | null,
): Promise<AdminSearchUserRow[]> {
  const client = requireSupabase()
  const { data, error } = await client.rpc('admin_search_users', {
    p_query: query,
    p_limit: limit,
    p_offset: offset,
    p_filter_cause_ids:
      filterCauseIds != null && filterCauseIds.length > 0 ? filterCauseIds : null,
  })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => mapAdminSearchUserRow(row))
}

// ────────────────────────────────────────────────────────────
// Doelen-quiz (marketing / uitslag per profiel)
// ────────────────────────────────────────────────────────────

export async function adminGetUserCauseQuizJson(userId: string): Promise<Record<string, unknown> | null> {
  const client = requireSupabase()
  const { data, error } = await client.rpc('admin_get_user_cause_quiz', { p_user_id: userId })
  if (error) throw new Error(error.message)
  if (data == null) return null
  return data as Record<string, unknown>
}

export type AdminQuizUserByCauseRow = {
  user_id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  account_type: string | null
  points: number
  total_donated: number
  completed_at: string | null
  rank_in_quiz: number | null
}

export async function adminListUsersByQuizCause(causeId: number): Promise<AdminQuizUserByCauseRow[]> {
  const client = requireSupabase()
  const { data, error } = await client.rpc('admin_list_users_by_quiz_cause', { p_cause_id: causeId })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    user_id: String(r.user_id ?? ''),
    email: (r.email as string) ?? null,
    first_name: (r.first_name as string) ?? null,
    last_name: (r.last_name as string) ?? null,
    account_type: (r.account_type as string) ?? null,
    points: Number(r.points ?? 0),
    total_donated: Number(r.total_donated ?? 0),
    completed_at: (r.completed_at as string) ?? null,
    rank_in_quiz: r.rank_in_quiz != null ? Number(r.rank_in_quiz) : null,
  }))
}

// ────────────────────────────────────────────────────────────
// Active sessions + shadow snapshot
// ────────────────────────────────────────────────────────────
export type AdminActiveSessionRow = {
  user_id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  account_type: string | null
  last_heartbeat: string
  route: string | null
  shadow_granted: boolean
}

export async function fetchAdminActiveSessions(sinceMinutes = 10): Promise<AdminActiveSessionRow[]> {
  const client = requireSupabase()
  const { data, error } = await client.rpc('admin_list_active_sessions', { p_since_minutes: sinceMinutes })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    user_id: String(row.user_id ?? ''),
    email: (row.email as string | null | undefined) ?? null,
    first_name: (row.first_name as string | null | undefined) ?? null,
    last_name: (row.last_name as string | null | undefined) ?? null,
    account_type: (row.account_type as string | null | undefined) ?? null,
    last_heartbeat: String(row.last_heartbeat ?? new Date().toISOString()),
    route: (row.route as string | null | undefined) ?? null,
    shadow_granted:
      row.shadow_granted === true ||
      row.shadow_granted === 'true' ||
      row.shadow_granted === 't' ||
      row.shadow_granted === 1,
  }))
}

export type AdminShadowSnapshot = {
  profile: Record<string, unknown>
  shadow_grant: Record<string, unknown>
  active_session: Record<string, unknown>
  donations: Array<Record<string, unknown>>
  community_memberships: Array<Record<string, unknown>>
  owned_communities: Array<Record<string, unknown>>
  generated_at: string
}

export async function fetchAdminShadowSnapshot(
  userId: string,
  donationLimit = 20,
): Promise<AdminShadowSnapshot> {
  const client = requireSupabase()
  const { data, error } = await client.rpc('admin_get_user_shadow_snapshot', {
    p_user_id: userId,
    p_donation_limit: donationLimit,
  })
  if (error) throw new Error(error.message)
  return (data ?? {}) as AdminShadowSnapshot
}

// ────────────────────────────────────────────────────────────
// User-side admin shadow grant toggle
// ────────────────────────────────────────────────────────────
export type AdminShadowGrantRow = {
  user_id: string
  granted: boolean
  granted_at: string | null
  revoked_at: string | null
  updated_at: string
}

export async function fetchMyAdminShadowGrant(userId: string): Promise<AdminShadowGrantRow | null> {
  const client = requireSupabase()
  const { data, error } = await client
    .from('admin_shadow_grants')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as AdminShadowGrantRow) ?? null
}

export async function setMyAdminShadowGrant(userId: string, granted: boolean): Promise<void> {
  const client = requireSupabase()
  const nowIso = new Date().toISOString()
  // Prefer RPC (security definer) om auth.uid() op serverkant te gebruiken.
  // Fallback blijft bestaan voor backward compatibility als RPC nog niet bestaat.
  const rpc = await client.rpc('set_my_shadow_grant', { p_granted: granted })
  if (!rpc.error) return

  const { error } = await client
    .from('admin_shadow_grants')
    .upsert(
      {
        user_id: userId,
        granted,
        granted_at: granted ? nowIso : null,
        revoked_at: granted ? null : nowIso,
      },
      { onConflict: 'user_id' },
    )
  if (error) throw new Error(error.message)
}

export async function fetchAdminShadowGrantStates(): Promise<Record<string, boolean>> {
  const client = requireSupabase()
  const { data, error } = await client.from('admin_shadow_grants').select('user_id, granted')
  if (error) throw new Error(error.message)
  const out: Record<string, boolean> = {}
  for (const row of (data ?? []) as Array<{ user_id: string; granted: boolean }>) {
    out[row.user_id] = row.granted === true
  }
  return out
}

// ────────────────────────────────────────────────────────────
// Realtime subscribe helper
// ────────────────────────────────────────────────────────────
export function subscribeToTableChanges(
  table: 'site_featured_causes' | 'site_faq_items' | 'site_news_posts' | 'site_settings'
    | 'donations' | 'profiles' | 'communities' | 'community_members' | 'active_sessions' | 'volunteer_requests'
    | 'collectant_requests'
    | 'site_notifications' | 'homepage_settings' | 'site_shop_items' | 'site_shop_redemptions'
    | 'site_charity_causes'
    | 'admin_shadow_grants'
    | 'user_cause_quiz'
    | 'community_posts' | 'community_shop_items' | 'projects'
    | 'site_email_templates',
  onChange: () => void,
): () => void {
  const client = supabase
  if (!client) return () => undefined
  const channel = client
    .channel(`admin-live-${table}-${Math.random().toString(36).slice(2, 8)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table }, () => onChange())
    .subscribe()
  return () => {
    try {
      void client.removeChannel(channel)
    } catch {
      /* ignore */
    }
  }
}
