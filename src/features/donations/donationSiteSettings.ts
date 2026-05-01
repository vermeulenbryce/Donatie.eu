import { supabase } from '../../lib/supabase'

/** Minima + voorgestelde knoppen (€) voor donatie-UI. */
export type DonationAmountsConfig = {
  eenmalig_min: number
  maandelijks_min: number
  /** Snelkeuzebedragen, oplopend, positieve getallen. */
  default_buckets: number[]
}

/** Compatibel met huidige formule: `round((amount / divisor) * pointsPerTenEuro)`. */
export type PointsConfig = {
  /** Standaard 10: “per €10” */
  divisor: number
  /** Standaard 5: punten per “divisor” euro (zoals 5 pt per €10) */
  pointsPerTenEuro: number
}

const DEFAULT_AMOUNTS: DonationAmountsConfig = {
  eenmalig_min: 5,
  maandelijks_min: 10,
  default_buckets: [5, 10, 25, 50, 100],
}

const DEFAULT_POINTS: PointsConfig = {
  divisor: 10,
  pointsPerTenEuro: 5,
}

type Cache = {
  amounts: DonationAmountsConfig
  points: PointsConfig
  at: number
}

let cache: Cache | null = null
const CACHE_MS = 60_000

export function invalidateDonationSiteSettingsCache(): void {
  cache = null
}

function num(x: unknown, d: number): number {
  const n = typeof x === 'number' ? x : Number(x)
  return Number.isFinite(n) && n > 0 ? n : d
}

export function normalizeDonationAmountsConfig(v: unknown): DonationAmountsConfig {
  if (!v || typeof v !== 'object') return { ...DEFAULT_AMOUNTS }
  const o = v as Record<string, unknown>
  const buckets = Array.isArray(o.default_buckets)
    ? o.default_buckets.map((b) => Number(b)).filter((n) => Number.isFinite(n) && n > 0)
    : DEFAULT_AMOUNTS.default_buckets
  return {
    eenmalig_min: num(o.eenmalig_min, DEFAULT_AMOUNTS.eenmalig_min),
    maandelijks_min: num(o.maandelijks_min, DEFAULT_AMOUNTS.maandelijks_min),
    default_buckets: buckets.length ? [...new Set(buckets)].sort((a, b) => a - b) : DEFAULT_AMOUNTS.default_buckets,
  }
}

export function normalizePointsConfig(v: unknown): PointsConfig {
  if (!v || typeof v !== 'object') return { ...DEFAULT_POINTS }
  const o = v as Record<string, unknown>
  const divisor = num(o.divisor, DEFAULT_POINTS.divisor)
  const p10 = num(o.pointsPerTenEuro, DEFAULT_POINTS.pointsPerTenEuro)
  return {
    divisor: divisor > 0 ? divisor : DEFAULT_POINTS.divisor,
    pointsPerTenEuro: p10 >= 0 ? p10 : DEFAULT_POINTS.pointsPerTenEuro,
  }
}

export async function preloadDonationSiteSettings(force = false): Promise<void> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return
  if (!supabase) {
    cache = { amounts: { ...DEFAULT_AMOUNTS }, points: { ...DEFAULT_POINTS }, at: Date.now() }
    return
  }
  const { data, error } = await supabase
    .from('site_settings')
    .select('key, value')
    .in('key', ['donation_amounts', 'points_config'])
  if (error) {
    cache = { amounts: { ...DEFAULT_AMOUNTS }, points: { ...DEFAULT_POINTS }, at: Date.now() }
    return
  }
  const rows = (data ?? []) as { key: string; value: unknown }[]
  let amounts = DEFAULT_AMOUNTS
  let points = DEFAULT_POINTS
  for (const r of rows) {
    if (r.key === 'donation_amounts') amounts = normalizeDonationAmountsConfig(r.value)
    if (r.key === 'points_config') points = normalizePointsConfig(r.value)
  }
  cache = { amounts, points, at: Date.now() }
}

function readCache(): Cache {
  if (!cache) {
    return { amounts: { ...DEFAULT_AMOUNTS }, points: { ...DEFAULT_POINTS }, at: 0 }
  }
  return cache
}

export function getDonationAmountsSync(): DonationAmountsConfig {
  return { ...readCache().amounts }
}

export function getPointsConfigSync(): PointsConfig {
  return { ...readCache().points }
}

export function computeDonorPointsPreviewSync(amount: number): number {
  const { divisor, pointsPerTenEuro } = readCache().points
  if (!Number.isFinite(amount) || amount <= 0) return 0
  return Math.max(0, Math.round((amount / divisor) * pointsPerTenEuro))
}

export function getDefaultDonationAmounts(): DonationAmountsConfig {
  return { ...DEFAULT_AMOUNTS }
}

export function getDefaultPointsConfig(): PointsConfig {
  return { ...DEFAULT_POINTS }
}
