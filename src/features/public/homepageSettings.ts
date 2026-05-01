/**
 * Mirrors `DEFAULT_HP_SETTINGS`, `getHomepageSettings`, `applyHomepageSettings`,
 * `calcLiveStats`, and `updateLiveStats` from legacy index.html (homepage).
 * Live laag: `useLiveHomepageSettings` leest `public.homepage_settings` via Supabase
 * met realtime subscription + 10s polling-fallback.
 */

import { useEffect, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'

export type HomepageSettings = {
  badge: string
  h1: string
  h1em: string
  desc: string
  cta1: string
  trustCount: string
  trustText: string
  statsLive: boolean
  stat1: string
  stat1Lbl: string
  stat2: string
  stat3: string
  stat4: string
  card1Val: string
  card1Sub: string
  card2Name1: string
  card2Name2: string
  card2Name3: string
  card3Badge1: string
  card3Badge2: string
  card3Badge3: string
}

export const DEFAULT_HP_SETTINGS: HomepageSettings = {
  badge: 'Het moderne alternatief voor deur-aan-deur collectes',
  h1: 'Doneer slim.',
  h1em: 'Doneer met plezier.',
  desc: 'Doneer slim, verdien punten en klim op de ranglijst. Volledig transparant en betrouwbaar — maak écht het verschil.',
  cta1: 'Ontdek goede doelen →',
  trustCount: '2.400+',
  trustText: 'donateurs gingen je voor',
  statsLive: true,
  stat1: '€124K+',
  stat1Lbl: 'Opgehaald totaal',
  stat2: '2.400+',
  stat3: '500+',
  stat4: '340+',
  card1Val: '€124.380',
  card1Sub: 'Verdeeld over 18 goede doelen',
  card2Name1: 'Pieter V.',
  card2Name2: 'Lisa M.',
  card2Name3: 'Mark D.',
  card3Badge1: '🌟 Starter',
  card3Badge2: '🏷️ Sticker',
  card3Badge3: '💚 Gever',
}

type RawAccount = {
  donations?: { amount?: string | number }[]
  monthlyDonations?: { org?: string }[]
  sticker?: boolean
  collectantActies?: unknown[]
}

/** Afgeronde weergave voor statistiekbalk (bijv. €124K+). */
export function formatHomepageEuroStat(n: number) {
  const x = Number.isFinite(n) && n >= 0 ? n : 0
  if (x >= 1_000_000) return `€${(x / 1_000_000).toFixed(1)}M+`
  if (x >= 1000) return `€${Math.round(x / 1000)}K+`
  return `€${Math.round(x)}`
}

function calcLiveStats(): {
  totalDonated: number
  totalDonors: number
  totalStickers: number
} {
  let totalDonated = 0
  let totalDonors = 0
  let totalStickers = 0
  try {
    const accounts = JSON.parse(localStorage.getItem('dnl_accounts') || '{}') as Record<string, RawAccount>
    for (const u of Object.values(accounts)) {
      if (!u) continue
      let hasDonated = false
      for (const d of u.donations || []) {
        totalDonated += parseFloat(String(d.amount)) || 0
        hasDonated = true
      }
      for (const _d of u.monthlyDonations || []) {
        hasDonated = true
      }
      if (hasDonated) totalDonors++
      if (u.sticker || (u.collectantActies || []).length) totalStickers++
    }
  } catch {
    /* ignore */
  }
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith('dnl_inbox_')) continue
      const msgs = JSON.parse(localStorage.getItem(key) || '[]') as { type?: string; refNr?: string; body?: string }[]
      for (const m of msgs) {
        if (m.type === 'donatie' && m.refNr && m.body) {
          const match = m.body.match(/€([\d,.]+)/)
          if (match) {
            const amt = parseFloat(match[1].replace(',', '.'))
            if (!Number.isNaN(amt) && amt < 10000) totalDonated += amt
          }
        }
      }
    }
  } catch {
    /* ignore */
  }
  return { totalDonated, totalDonors: totalDonors > 0 ? totalDonors : 0, totalStickers }
}

export function getHomepageSettings(): HomepageSettings {
  try {
    const s = localStorage.getItem('dnl_homepage')
    if (!s) return { ...DEFAULT_HP_SETTINGS }
    const parsed = JSON.parse(s) as Partial<HomepageSettings> & { statsLive?: unknown }
    const statsLive =
      typeof parsed.statsLive === 'boolean'
        ? parsed.statsLive
        : typeof parsed.statsLive === 'string'
          ? parsed.statsLive === 'true'
          : DEFAULT_HP_SETTINGS.statsLive
    return { ...DEFAULT_HP_SETTINGS, ...parsed, statsLive }
  } catch {
    return { ...DEFAULT_HP_SETTINGS }
  }
}

// ────────────────────────────────────────────────────────────
// Supabase-gedreven versie: leest uit public.homepage_settings (id=1)
// met realtime updates. Fallback op legacy getHomepageSettings() +
// DEFAULT_HP_SETTINGS zolang geen response binnen is.
// ────────────────────────────────────────────────────────────

type HomepageSettingsRow = {
  badge: string | null
  h1: string | null
  h1em: string | null
  desc: string | null
  cta1: string | null
  trust_count: string | null
  trust_text: string | null
  stats_live: boolean | null
  stat1: string | null
  stat1_lbl: string | null
  stat2: string | null
  stat3: string | null
  stat4: string | null
  card1_val: string | null
  card1_sub: string | null
  card2_name1: string | null
  card2_name2: string | null
  card2_name3: string | null
  card3_badge1: string | null
  card3_badge2: string | null
  card3_badge3: string | null
}

function mapRowToSettings(row: HomepageSettingsRow | null): HomepageSettings {
  if (!row) return { ...DEFAULT_HP_SETTINGS }
  return {
    badge:       row.badge       ?? DEFAULT_HP_SETTINGS.badge,
    h1:          row.h1          ?? DEFAULT_HP_SETTINGS.h1,
    h1em:        row.h1em        ?? DEFAULT_HP_SETTINGS.h1em,
    desc:        row.desc        ?? DEFAULT_HP_SETTINGS.desc,
    cta1:        row.cta1        ?? DEFAULT_HP_SETTINGS.cta1,
    trustCount:  row.trust_count ?? DEFAULT_HP_SETTINGS.trustCount,
    trustText:   row.trust_text  ?? DEFAULT_HP_SETTINGS.trustText,
    statsLive:   typeof row.stats_live === 'boolean' ? row.stats_live : DEFAULT_HP_SETTINGS.statsLive,
    stat1:       row.stat1       ?? DEFAULT_HP_SETTINGS.stat1,
    stat1Lbl:    row.stat1_lbl   ?? DEFAULT_HP_SETTINGS.stat1Lbl,
    stat2:       row.stat2       ?? DEFAULT_HP_SETTINGS.stat2,
    stat3:       row.stat3       ?? DEFAULT_HP_SETTINGS.stat3,
    stat4:       row.stat4       ?? DEFAULT_HP_SETTINGS.stat4,
    card1Val:    row.card1_val   ?? DEFAULT_HP_SETTINGS.card1Val,
    card1Sub:    row.card1_sub   ?? DEFAULT_HP_SETTINGS.card1Sub,
    card2Name1:  row.card2_name1 ?? DEFAULT_HP_SETTINGS.card2Name1,
    card2Name2:  row.card2_name2 ?? DEFAULT_HP_SETTINGS.card2Name2,
    card2Name3:  row.card2_name3 ?? DEFAULT_HP_SETTINGS.card2Name3,
    card3Badge1: row.card3_badge1 ?? DEFAULT_HP_SETTINGS.card3Badge1,
    card3Badge2: row.card3_badge2 ?? DEFAULT_HP_SETTINGS.card3Badge2,
    card3Badge3: row.card3_badge3 ?? DEFAULT_HP_SETTINGS.card3Badge3,
  }
}

async function fetchHomepageSettingsFromSupabase(): Promise<HomepageSettings | null> {
  if (!isSupabaseConfigured || !supabase) return null
  const { data, error } = await supabase.from('homepage_settings').select('*').eq('id', 1).maybeSingle()
  if (error || !data) return null
  return mapRowToSettings(data as HomepageSettingsRow)
}

/** Hook die de actuele homepage-teksten live levert uit Supabase. */
export function useLiveHomepageSettings(): HomepageSettings {
  const [settings, setSettings] = useState<HomepageSettings>(() => getHomepageSettings())

  useEffect(() => {
    let cancelled = false
    async function load() {
      const next = await fetchHomepageSettingsFromSupabase()
      if (cancelled || !next) return
      setSettings((prev) => {
        // Shallow compare om onnodige renders te vermijden
        const same = (Object.keys(next) as (keyof HomepageSettings)[]).every(
          (k) => prev[k] === next[k],
        )
        return same ? prev : next
      })
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
      .channel(`public-homepage-settings-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'homepage_settings' }, () => {
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

  return settings
}

/** Stat- en trust-teksten zoals `updateLiveStats` + defaults in de legacy-app. */
export function getHomepageStatsDisplay(settings: HomepageSettings) {
  if (settings.statsLive === false) {
    return {
      statOpgehaald: settings.stat1,
      statOpgehaaldLbl: settings.stat1Lbl,
      statDonateurs: settings.stat2,
      statDoelen: settings.stat3,
      statStickers: settings.stat4,
      trustCount: settings.trustCount,
      trustText: settings.trustText,
    }
  }
  const stats = calcLiveStats()
  const displayAmt = Math.max(stats.totalDonated, 124000)
  const displayDonors = Math.max(stats.totalDonors + 2400, 2400)
  const displayStickers = Math.max(stats.totalStickers + 340, 340)
  return {
    statOpgehaald: formatHomepageEuroStat(displayAmt),
    statOpgehaaldLbl: settings.stat1Lbl,
    statDonateurs: `${displayDonors.toLocaleString('nl-NL')}+`,
    statDoelen: '500+',
    statStickers: `${displayStickers}+`,
    trustCount: settings.trustCount,
    trustText: settings.trustText,
  }
}
