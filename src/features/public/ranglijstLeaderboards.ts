/**
 * Ranglijst-tabbladen: bij geconfigureerde Supabase komt data uit `get_public_leaderboard` (zie /ranglijst),
 * anders uit localStorage (`dnl_accounts`, `dnl_communities`, `dnl_projects`) zoals legacy index.html.
 */

import { readDnlAccounts, type DnlStoredAccount } from '../account/legacyDashboardModel'
import { CBF_CAUSES, type LegacyCbfCause } from '../legacy/cbfCauses.generated'
import { sectorMeta, type LegacySectorVisual } from '../legacy/legacySectorMeta'
import { readLegacyProjects } from './legacyStorage'
import type { PublicLeaderboardRow } from './liveLeaderboardService'

const COLORS = [
  'linear-gradient(135deg,#3a98f8,#6c47ff)',
  'linear-gradient(135deg,#f59e0b,#d97706)',
  'linear-gradient(135deg,#10b981,#059669)',
  'linear-gradient(135deg,#ef4444,#dc2626)',
  'linear-gradient(135deg,#8b5cf6,#7c3aed)',
]

export type RankDiffClass = 'up' | 'down' | 'same'

export type RanglijstStdRow = {
  rank: number
  medal: string
  rankNumClass: string
  name: string
  sub?: string
  ava: string
  avaColor: string
  isYou: boolean
  isAnon: boolean
  sticker: boolean
  elite: boolean
  amt: number
  pts: number
  extra: string
  extraClass: RankDiffClass
}

export type RanglijstProjectRow = {
  rank: number
  medal: string
  rankNumClass: string
  id: string
  title: string
  raised: number
  goal: number
  donors: number
  isYou: boolean
}

/** Zelfde logica als `renderGoededoelenRank()` in legacy index.html */
export type RanglijstGoedDoelRow = {
  rank: number
  medal: string
  cause: LegacyCbfCause
  donCount: number
  sectorKey: string
  sectorVisual: LegacySectorVisual
}

type RawCommunity = {
  name?: string
  title?: string
  influencerEmail?: string
  _owner?: string
  raised?: number
  totalRaised?: number
  donations?: unknown[]
  members?: unknown[]
}

type RawProject = {
  id?: string
  title?: string
  name?: string
  raised?: number
  goal?: number
  donors?: number
  ownerEmail?: string
}

function safeJson<T>(key: string, fallback: T): T {
  try {
    const s = localStorage.getItem(key)
    if (!s) return fallback
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
}

function medalForRank(i: number): string {
  if (i === 0) return '🥇'
  if (i === 1) return '🥈'
  if (i === 2) return '🥉'
  return ''
}

function rankNumClass(i: number): string {
  if (i === 0) return 'r1'
  if (i === 1) return 'r2'
  if (i === 2) return 'r3'
  return ''
}

function diffVsAbove(i: number, sorted: { pts: number }[]): { text: string; cls: RankDiffClass } {
  if (i === 0) return { text: '—', cls: 'same' }
  const gap = sorted[i - 1].pts - sorted[i].pts
  if (gap <= 0) return { text: '—', cls: 'same' }
  return { text: `−${gap} pt`, cls: 'down' }
}

function displayNameIndividu(
  u: DnlStoredAccount,
  isYou: boolean,
): { name: string; isAnon: boolean; sub?: string } {
  const isAnon = !!(u.anonymous && !isYou)
  if (isAnon) return { name: 'Anoniem', isAnon: true }
  const ln = u.lastName?.trim()
  const shortLast = ln ? `${ln[0]}.` : ''
  const name = `${u.firstName || ''} ${shortLast}`.trim()
  const sub = u.niche || u.inflNaam ? String(u.niche || u.inflNaam) : undefined
  return { name: name || 'Donateur', isAnon: false, sub }
}

export function buildRanglijstIndividuen(currentEmail: string | null): RanglijstStdRow[] {
  const accounts = readDnlAccounts()
  const pre: Array<
    Omit<RanglijstStdRow, 'rank' | 'medal' | 'rankNumClass' | 'extra' | 'extraClass'> & { pts: number }
  > = []
  let ci = 0
  for (const u of Object.values(accounts)) {
    if (!u?.firstName) continue
    const pts = u.points || 0
    const amt = u.totalDonated || 0
    const isYou = !!(currentEmail && u.email === currentEmail)
    const { name, isAnon, sub } = displayNameIndividu(u, isYou)
    pre.push({
      name,
      sub,
      ava: isAnon ? '?' : (u.firstName![0] || '?').toUpperCase(),
      avaColor: isYou
        ? 'linear-gradient(135deg,#3a98f8,#1a237e)'
        : isAnon
          ? 'linear-gradient(135deg,#64748b,#334155)'
          : COLORS[ci++ % COLORS.length],
      isYou,
      isAnon,
      sticker: !!u.sticker,
      elite: pts >= 1500,
      amt,
      pts,
    })
  }
  pre.sort((a, b) => b.pts - a.pts || b.amt - a.amt)
  return pre.map((r, i) => {
    const { text, cls } = diffVsAbove(i, pre)
    return {
      ...r,
      rank: i + 1,
      medal: medalForRank(i),
      rankNumClass: rankNumClass(i),
      extra: text,
      extraClass: cls,
    }
  })
}

export function buildRanglijstBedrijven(currentEmail: string | null): RanglijstStdRow[] {
  const accounts = readDnlAccounts()
  const pre: Array<
    Omit<RanglijstStdRow, 'rank' | 'medal' | 'rankNumClass' | 'extra' | 'extraClass'> & { pts: number }
  > = []
  let ci = 0
  for (const u of Object.values(accounts)) {
    const isBedrijf = u.type === 'bedrijf' || !!u.bedrijfsnaam
    if (!isBedrijf) continue
    const team = Array.isArray(u.teamMembers) ? u.teamMembers.length : 0
    const pts = u.points || 0
    const amt = u.totalDonated || 0
    const isYou = !!(currentEmail && u.email === currentEmail)
    const name = (u.bedrijfsnaam || `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Bedrijf').trim()
    const sub = team > 0 ? `${team} teamleden` : undefined
    pre.push({
      name,
      sub,
      ava: (name[0] || 'B').toUpperCase(),
      avaColor: isYou ? 'linear-gradient(135deg,#1a237e,#3a98f8)' : COLORS[ci++ % COLORS.length],
      isYou,
      isAnon: false,
      sticker: !!u.sticker,
      elite: pts >= 1500,
      amt,
      pts,
    })
  }
  pre.sort((a, b) => b.amt - a.amt || b.pts - a.pts)
  return pre.map((r, i) => {
    const { text, cls } = diffVsAbove(i, pre)
    return {
      ...r,
      rank: i + 1,
      medal: medalForRank(i),
      rankNumClass: rankNumClass(i),
      extra: text,
      extraClass: cls,
    }
  })
}

function communityRaised(c: RawCommunity): number {
  if (typeof c.totalRaised === 'number') return c.totalRaised
  if (typeof c.raised === 'number') return c.raised
  if (Array.isArray(c.donations)) return c.donations.length * 45
  return 0
}

export function buildRanglijstInfluencers(currentEmail: string | null): RanglijstStdRow[] {
  const comms = safeJson<RawCommunity[]>('dnl_communities', [])
  const pre: Array<
    Omit<RanglijstStdRow, 'rank' | 'medal' | 'rankNumClass' | 'extra' | 'extraClass'> & { pts: number }
  > = []
  let ci = 0
  for (const c of comms) {
    const title = (c.title || c.name || 'Community').trim()
    const amt = communityRaised(c)
    const pts = Math.round(amt * 0.5)
    const inflMail = (c.influencerEmail || '').toLowerCase()
    const isYou = !!(currentEmail && inflMail && inflMail === currentEmail.toLowerCase())
    const mem = Array.isArray(c.members) ? c.members.length : 0
    pre.push({
      name: title,
      sub: mem > 0 ? `${mem} leden` : undefined,
      ava: (title[0] || '★').toUpperCase(),
      avaColor: isYou ? 'linear-gradient(135deg,#f59e0b,#d97706)' : COLORS[ci++ % COLORS.length],
      isYou,
      isAnon: false,
      sticker: false,
      elite: pts >= 1500,
      amt,
      pts,
    })
  }

  const emailsInComms = new Set(
    comms.map((c) => (c.influencerEmail || '').toLowerCase()).filter(Boolean),
  )
  for (const u of Object.values(readDnlAccounts())) {
    if (u.type !== 'influencer') continue
    const em = (u.email || '').toLowerCase()
    if (em && emailsInComms.has(em)) continue
    const pts = u.points || 0
    const amt = u.totalDonated || 0
    const isYou = !!(currentEmail && u.email === currentEmail)
    const handle = u.inflNaam || u.firstName || 'Influencer'
    pre.push({
      name: String(handle),
      sub: u.niche ? String(u.niche) : undefined,
      ava: (String(handle).replace(/^@/, '')[0] || 'I').toUpperCase(),
      avaColor: isYou ? 'linear-gradient(135deg,#f59e0b,#d97706)' : COLORS[ci++ % COLORS.length],
      isYou,
      isAnon: false,
      sticker: !!u.sticker,
      elite: pts >= 1500,
      amt,
      pts,
    })
  }

  pre.sort((a, b) => b.amt - a.amt || b.pts - a.pts)
  return pre.map((r, i) => {
    const { text, cls } = diffVsAbove(i, pre)
    return {
      ...r,
      rank: i + 1,
      medal: medalForRank(i),
      rankNumClass: rankNumClass(i),
      extra: text,
      extraClass: cls,
    }
  })
}

function readStoredProjects(): RawProject[] {
  return readLegacyProjects()
}

/** Alleen lokale `dnl_projects` — geen demodata. */
export function buildRanglijstProjectenLocal(currentEmail: string | null): RanglijstProjectRow[] {
  const fromStore = readStoredProjects()
  const scored = fromStore
    .map((p, idx) => {
      const title = (p.title || p.name || `Project ${idx + 1}`).trim()
      const raised = Number(p.raised) || 0
      const goal = Number(p.goal) || 1
      const donors = Number(p.donors) || Math.max(0, Math.round(raised / 150))
      const isYou = !!(currentEmail && p.ownerEmail && p.ownerEmail.toLowerCase() === currentEmail.toLowerCase())
      return { id: p.id || `p-${idx}`, title, raised, goal, donors, isYou }
    })
    .sort((a, b) => b.raised - a.raised)

  return scored.map((r, i) => ({
    rank: i + 1,
    medal: medalForRank(i),
    rankNumClass: rankNumClass(i),
    ...r,
  }))
}

/** Zet Supabase `projects`-rijen om naar ranglijstrijen (publiek zichtbare, actieve). */
export function mapDbProjectsToRankRows(
  rows: Record<string, unknown>[],
  currentEmail: string | null,
): Array<Omit<RanglijstProjectRow, 'rank' | 'medal' | 'rankNumClass'>> {
  const out: Array<Omit<RanglijstProjectRow, 'rank' | 'medal' | 'rankNumClass'>> = []
  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx]
    const vis = row.visibility as string | null | undefined
    if (vis === 'members_only') continue
    const st = String(row.status ?? '').toLowerCase()
    if (st === 'verlopen' || st === 'cancelled' || st === 'draft') continue

    const id = String(row.id ?? `db-${idx}`)
    const title = String(row.name ?? row.title ?? 'Project').trim()
    const goal = Math.max(0, Number(row.goal ?? row.target_amount ?? 0))
    const raised = Math.max(
      0,
      Number(row.raised_amount ?? row.amount_raised ?? row.current_amount ?? row.raised ?? 0),
    )
    const donors = Math.max(0, Number(row.donor_count ?? row.donors ?? 0))
    const ownerEmail =
      typeof row.owner_email === 'string'
        ? row.owner_email
        : typeof row.ownerEmail === 'string'
          ? row.ownerEmail
          : null
    const isYou = !!(currentEmail && ownerEmail && ownerEmail.toLowerCase() === currentEmail.toLowerCase())
    out.push({ id, title, raised, goal, donors, isYou })
  }
  out.sort((a, b) => b.raised - a.raised || b.goal - a.goal)
  return out
}

export function applyProjectRankMetadata(
  rows: Array<Omit<RanglijstProjectRow, 'rank' | 'medal' | 'rankNumClass'>>,
): RanglijstProjectRow[] {
  return rows.map((r, i) => ({
    ...r,
    rank: i + 1,
    medal: medalForRank(i),
    rankNumClass: rankNumClass(i),
  }))
}

/** Voegt database-projecten samen met lokale demo-projecten; DB wint bij gelijke id. */
export function mergeProjectRankRows(
  dbRows: Array<Omit<RanglijstProjectRow, 'rank' | 'medal' | 'rankNumClass'>>,
  localRows: Array<Omit<RanglijstProjectRow, 'rank' | 'medal' | 'rankNumClass'>>,
): RanglijstProjectRow[] {
  const byId = new Map<string, Omit<RanglijstProjectRow, 'rank' | 'medal' | 'rankNumClass'>>()
  for (const r of localRows) {
    byId.set(r.id.toLowerCase(), r)
  }
  for (const r of dbRows) {
    byId.set(r.id.toLowerCase(), r)
  }
  const merged = [...byId.values()].sort((a, b) => b.raised - a.raised || b.goal - a.goal)
  return applyProjectRankMetadata(merged)
}

export function buildRanglijstGoedeDoelen(): RanglijstGoedDoelRow[] {
  const accounts = readDnlAccounts()
  const counts: Record<string, number> = {}
  for (const u of Object.values(accounts)) {
    for (const d of u.donations || []) {
      const key = String(d.org || d.cause || '').trim()
      if (!key) continue
      counts[key] = (counts[key] || 0) + 1
    }
  }

  const sorted = CBF_CAUSES.slice().sort((a, b) => {
    const ca = counts[a.naam_statutair || a.naam] || counts[a.naam] || 0
    const cb = counts[b.naam_statutair || b.naam] || counts[b.naam] || 0
    return cb - ca
  })

  return sorted.map((c, i) => {
    const orgKey = c.naam_statutair || c.naam
    const donCount = counts[orgKey] || counts[c.naam] || 0
    const sectorKey = c.sector || 'INTERNATIONALE HULP EN MENSENRECHTEN'
    return {
      rank: i + 1,
      medal: medalForRank(i),
      cause: c,
      donCount,
      sectorKey,
      sectorVisual: sectorMeta(sectorKey),
    }
  })
}

/** Mapt Supabase `get_public_leaderboard` naar de tabelrijen op /ranglijst. */
export function mapLiveRowsToRanglijstStd(rows: PublicLeaderboardRow[]): RanglijstStdRow[] {
  const sortedPts = rows.map((r) => ({ pts: r.points }))
  return rows.map((r, i) => {
    const diff = diffVsAbove(i, sortedPts)
    return {
      rank: r.rank,
      medal: medalForRank(i),
      rankNumClass: rankNumClass(i),
      name: r.label,
      sub: undefined,
      ava: r.initial,
      avaColor: COLORS[i % COLORS.length],
      isYou: r.is_me,
      isAnon: r.is_anonymous,
      sticker: false,
      elite: r.elite,
      amt: Math.round(Number(r.total_donated) || 0),
      pts: r.points,
      extra: diff.text,
      extraClass: diff.cls,
    }
  })
}
