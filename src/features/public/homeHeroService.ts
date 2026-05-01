import { supabase } from '../../lib/supabase'
import type { LegacyDonation } from '../account/legacyDashboardModel'

export type PublicHomepageTopDonor = {
  rank: number
  points: number
  label: string
  initial: string
}

export type PublicHomepageStats = {
  total_raised: number
  unique_donors: number
  distinct_causes: number
  top_donors: PublicHomepageTopDonor[]
}

const TOP_DONOR_GRADIENTS = [
  'linear-gradient(135deg,#FFD700,#FFA500)',
  'linear-gradient(135deg,#43A3FA,#1a7fd4)',
  'linear-gradient(135deg,#5DE8B0,#28c484)',
]

const BADGE_CHIP_CLASS = ['chip-yellow', 'chip-blue', 'chip-green'] as const

export function topDonorRowStyle(index: number): string {
  return TOP_DONOR_GRADIENTS[index % TOP_DONOR_GRADIENTS.length]
}

export function badgeChipClass(index: number): string {
  return BADGE_CHIP_CLASS[index % BADGE_CHIP_CLASS.length]
}

/** Euro zoals hero card1 (bijv. € 124.380) */
export function formatHeroEuroFull(amount: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(amount))
}

function parseHomepageStats(data: unknown): PublicHomepageStats | null {
  let raw: unknown = data
  if (raw == null) return null
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw) as unknown
    } catch {
      return null
    }
  }
  if (typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const total = Number(o.total_raised)
  const donors = Number(o.unique_donors)
  const causes = Number(o.distinct_causes)
  if (!Number.isFinite(total) || !Number.isFinite(donors)) return null
  const rawTop = o.top_donors
  const top_donors: PublicHomepageTopDonor[] = []
  if (Array.isArray(rawTop)) {
    for (const row of rawTop) {
      if (!row || typeof row !== 'object') continue
      const r = row as Record<string, unknown>
      top_donors.push({
        rank: Number(r.rank) || top_donors.length + 1,
        points: Number(r.points) || 0,
        label: typeof r.label === 'string' ? r.label : 'Donateur',
        initial: typeof r.initial === 'string' ? r.initial : '?',
      })
    }
  }
  return {
    total_raised: total,
    unique_donors: Math.max(0, Math.floor(donors)),
    distinct_causes: Number.isFinite(causes) ? Math.max(0, Math.floor(causes)) : 0,
    top_donors,
  }
}

export async function fetchPublicHomepageStats(): Promise<PublicHomepageStats | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('get_public_homepage_stats')
  if (error) {
    console.warn('[homeHero] get_public_homepage_stats:', error.message, error.code ?? '')
    return null
  }
  const parsed = parseHomepageStats(data)
  if (!parsed && data != null) {
    console.warn('[homeHero] Onverwacht RPC-antwoord, controleer get_public_homepage_stats:', data)
  }
  return parsed
}

function donationDayToLegacyDate(day: string): string {
  // Legacy badge maandlogica gebruikt "YYYY-MM-DD" strings
  return day.length >= 10 ? day.slice(0, 10) : day
}

export async function fetchMyDonationsForBadges(): Promise<LegacyDonation[]> {
  if (!supabase) return []
  const { data, error } = await supabase.rpc('get_my_donations_for_badges')
  if (error) {
    console.warn('[homeHero] get_my_donations_for_badges', error.message)
    return []
  }
  if (!Array.isArray(data)) return []
  const out: LegacyDonation[] = []
  for (const row of data) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const org = typeof r.charity_name === 'string' ? r.charity_name : ''
    const dayRaw = r.donation_day as string | null | undefined
    const day = dayRaw ? donationDayToLegacyDate(String(dayRaw)) : ''
    out.push({
      cause: org,
      org,
      amount: Number(r.amount) || 0,
      pts: Number(r.points_value) || 0,
      date: day,
      monthly: r.is_monthly === true,
    })
  }
  return out
}

/** Voortgangsbalk t.o.v. stretchdoel (alleen visueel). */
export function heroProgressPercent(totalRaised: number, goalEuro = 250_000): number {
  if (goalEuro <= 0) return 0
  return Math.min(100, Math.round((totalRaised / goalEuro) * 100))
}
