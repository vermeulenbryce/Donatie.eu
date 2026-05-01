import type { AccountType } from '../../types/auth'
import type { LegacyPreviewDonation, LegacyShellUser } from '../../context/LegacyUiSessionContext'
import { buildHomeLiveLeaderboard } from '../public/homeLiveLeaderboard'

const DNL_ACCOUNTS = 'dnl_accounts'
export const REFERRAL_REWARD_INVITE_CAP = 5
const DNL_REFERRALS = 'dnl_referrals'
export const dnlAccountsUpdatedEvent = 'dnl:accounts-updated'
const DNL_ACCOUNTS_MIGRATION = 'dnl_accounts_migration_v1'

export type LegacyDonation = {
  cause: string
  org: string
  amount: number
  pts: number
  date: string
  monthly?: boolean
}

export type LegacyMonthlyDonation = {
  org?: string
  cause?: string
  amount?: number | string
  status?: string
}

export type DnlStoredAccount = {
  email?: string
  firstName?: string
  lastName?: string
  /** Sync met `LocalUser.type` wanneer aanwezig (ranglijst / Donnie). */
  type?: AccountType
  bedrijfsnaam?: string
  bedrijfCode?: string
  inflNaam?: string
  niche?: string
  teamMembers?: string[]
  donations?: LegacyDonation[]
  monthlyDonations?: LegacyMonthlyDonation[]
  totalDonated?: number
  points?: number
  sticker?: boolean
  shopSpent?: number
  anonymous?: boolean
  refCode?: string
  projects?: unknown[]
  avatarUrl?: string
  adminAccess?: boolean
  charitySubscribed?: boolean
  monthlyDonor?: boolean
  collectantActive?: boolean
  collectantCity?: string
  claimedBadges?: string[]
  phone?: string
  street?: string
  houseNumber?: string
  postcode?: string
  city?: string
  passwordUpdatedAt?: string
}

function safeParse<T>(json: string | null, fallback: T): T {
  try {
    if (!json) return fallback
    return JSON.parse(json) as T
  } catch {
    return fallback
  }
}

export function readDnlAccounts(): Record<string, DnlStoredAccount> {
  const raw = safeParse(localStorage.getItem(DNL_ACCOUNTS), {})
  return migrateDnlAccountsIfNeeded(raw)
}

export function writeDnlAccounts(accounts: Record<string, DnlStoredAccount>) {
  localStorage.setItem(DNL_ACCOUNTS, JSON.stringify(accounts))
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(dnlAccountsUpdatedEvent))
  }
}

function migrateDnlAccountsIfNeeded(
  accounts: Record<string, DnlStoredAccount>,
): Record<string, DnlStoredAccount> {
  if (typeof window === 'undefined') return accounts
  try {
    if (localStorage.getItem(DNL_ACCOUNTS_MIGRATION) === '1') return accounts
  } catch {
    return accounts
  }

  let changed = false
  const next: Record<string, DnlStoredAccount> = {}
  for (const [k, v] of Object.entries(accounts)) {
    const email = (v.email || k || '').trim().toLowerCase()
    const row: DnlStoredAccount = {
      ...v,
      ...(email ? { email } : {}),
    }
    if (!row.type) {
      if (row.bedrijfsnaam) row.type = 'bedrijf'
      else if (row.inflNaam || row.niche) row.type = 'influencer'
      else row.type = 'individu'
      changed = true
    }
    if (email !== k) changed = true
    next[email || k] = row
  }

  try {
    if (changed) {
      localStorage.setItem(DNL_ACCOUNTS, JSON.stringify(next))
      window.dispatchEvent(new CustomEvent(dnlAccountsUpdatedEvent))
    }
    localStorage.setItem(DNL_ACCOUNTS_MIGRATION, '1')
  } catch {
    return changed ? next : accounts
  }
  return changed ? next : accounts
}

/** Zorgt dat `buildHomeLiveLeaderboard` dezelfde gebruiker ziet als in legacy `dnl_accounts`. */
export function upsertLeaderboardAccountFromShell(shell: LegacyShellUser) {
  const accounts = readDnlAccounts()
  const prev = accounts[shell.email] || {}
  const typeFromSession = shell.source === 'session' && shell.user ? shell.user.type : prev.type
  accounts[shell.email] = {
    ...prev,
    email: shell.email,
    firstName: shell.firstName,
    lastName: shell.lastName,
    points: shell.points,
    totalDonated: shell.totalDonated,
    anonymous: shell.anonymous,
    ...(typeFromSession ? { type: typeFromSession } : {}),
  }
  writeDnlAccounts(accounts)
}

export function mergeSessionUserIntoDnlAccounts(shell: LegacyShellUser) {
  if (shell.source !== 'session' || !shell.user) return
  upsertLeaderboardAccountFromShell(shell)
}

/** Schrijft aanvullende profielvelden (bedrijf/influencer) naar `dnl_accounts`. */
export function upsertDnlAccountProfile(email: string, patch: Partial<DnlStoredAccount>) {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return
  const accounts = readDnlAccounts()
  const prev = accounts[normalized] || {}
  accounts[normalized] = {
    ...prev,
    email: normalized,
    ...patch,
  }
  writeDnlAccounts(accounts)
}

export function deleteDnlAccountProfile(email: string) {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return
  const accounts = readDnlAccounts()
  if (!(normalized in accounts)) return
  delete accounts[normalized]
  writeDnlAccounts(accounts)
}

export function appendDonationToDnlAccounts(
  email: string,
  row: LegacyDonation,
  shellAfter: {
    points: number
    totalDonated: number
    firstName: string
    lastName: string
    anonymous: boolean
  },
  seedPreviewDonations?: LegacyPreviewDonation[],
) {
  const accounts = readDnlAccounts()
  const prev = accounts[email] || {}
  let existing = [...(prev.donations || [])]
  if (existing.length === 0 && seedPreviewDonations?.length) {
    existing = previewToDonations(seedPreviewDonations)
  }
  const donations = [...existing, row]
  accounts[email] = {
    ...prev,
    email,
    firstName: shellAfter.firstName,
    lastName: shellAfter.lastName,
    donations,
    points: shellAfter.points,
    totalDonated: shellAfter.totalDonated,
    anonymous: shellAfter.anonymous,
  }
  writeDnlAccounts(accounts)
}

function previewToDonations(prev: LegacyPreviewDonation[] | undefined): LegacyDonation[] {
  return (prev || []).map((p) => ({ ...p, monthly: false }))
}

function generateUniqueRefCode(accounts: Record<string, DnlStoredAccount>): string {
  const used = new Set<string>()
  for (const a of Object.values(accounts)) {
    if (a.refCode) used.add(a.refCode)
  }
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  do {
    code = ''
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
  } while (used.has(code))
  return code
}

export function ensureRefCodeInAccounts(email: string, firstName: string): string {
  const accounts = readDnlAccounts()
  const row = { ...(accounts[email] || {}) }
  if (!row.refCode) {
    row.refCode = generateUniqueRefCode(accounts)
    row.email = email
    row.firstName = firstName
    accounts[email] = row
    writeDnlAccounts(accounts)
  }
  return row.refCode!
}

export function getReferralLink(refCode: string, type: 'particulier' | 'bedrijf' | 'influencer' = 'particulier'): string {
  const origin =
    typeof window !== 'undefined'
      ? `${window.location.protocol}//${window.location.host}`
      : 'https://donatie.eu'
  const u = new URL('/auth', origin)
  if (refCode.trim()) u.searchParams.set('ref', refCode.trim().toUpperCase())
  u.searchParams.set('type', type)
  u.searchParams.set('tab', 'register')
  return u.toString()
}

export function readReferralSignedUps(refCode: string): unknown[] {
  const data = safeParse<Record<string, unknown[]>>(localStorage.getItem(DNL_REFERRALS), {})
  return data[refCode] || []
}

export const BADGES_ALL = [
  { id: 'starter', icon: '🌟', name: 'Starter', desc: 'Eerste donatie gedaan' },
  { id: 'gever', icon: '💚', name: 'Warm Hart', desc: '5 donaties gedaan' },
  { id: 'sticker', icon: '🏷️', name: 'Sticker Drager', desc: 'Sticker aangeschaft' },
  { id: 'streak', icon: '🔥', name: 'Streaker', desc: '3 maanden op rij' },
  { id: 'top10', icon: '🏅', name: 'Top 10', desc: 'Top 10 ranglijst' },
  { id: 'honderd', icon: '💯', name: 'Eeuwig Gever', desc: '€100 totaal gedoneerd' },
  { id: 'anbi', icon: '✅', name: 'ANBI Supporter', desc: 'Aan 3 ANBI-doelen gegeven' },
  { id: 'community', icon: '🤝', name: 'Community Hero', desc: '10 donaties' },
] as const

export type BadgeDef = (typeof BADGES_ALL)[number]

type BadgeUser = {
  donations: LegacyDonation[]
  totalDonated: number
  sticker?: boolean
  monthlyDonations?: LegacyMonthlyDonation[]
  email: string
}

export function checkBadgeEarned(b: BadgeDef, u: BadgeUser): boolean {
  const dons = u.donations || []
  if (b.id === 'starter') return dons.length >= 1
  if (b.id === 'gever') return dons.length >= 5
  if (b.id === 'honderd') return (u.totalDonated || 0) >= 100
  if (b.id === 'community') return dons.length >= 10
  if (b.id === 'anbi') return new Set(dons.map((d) => d.org)).size >= 3
  if (b.id === 'sticker') return u.sticker === true
  if (b.id === 'top10') {
    try {
      const lb = buildHomeLiveLeaderboard(u.email)
      const me = lb.find((r) => r.isCurrentUser)
      return !!(me && me.rank <= 10)
    } catch {
      return false
    }
  }
  if (b.id === 'streak') {
    if (dons.length < 3) return false
    const monthSet: Record<string, boolean> = {}
    dons.forEach((d) => {
      const parts = (d.date || '').split('-')
      if (parts.length === 3) {
        const key = `${parts[2]}-${parts[1]}`
        monthSet[key] = true
      }
    })
    const monthArr = Object.keys(monthSet).sort()
    if (monthArr.length < 3) return false
    for (let i = 0; i <= monthArr.length - 3; i++) {
      const p1 = monthArr[i].split('-')
      const p2 = monthArr[i + 1].split('-')
      const p3 = monthArr[i + 2].split('-')
      const n1 = parseInt(p1[0], 10) * 12 + parseInt(p1[1], 10)
      const n2 = parseInt(p2[0], 10) * 12 + parseInt(p2[1], 10)
      const n3 = parseInt(p3[0], 10) * 12 + parseInt(p3[1], 10)
      if (n2 === n1 + 1 && n3 === n2 + 1) return true
    }
    return false
  }
  return false
}

export function computeLevel(pts: number) {
  const levels = [
    { name: 'Starter', min: 0, max: 99 },
    { name: 'Helper', min: 100, max: 299 },
    { name: 'Gever', min: 300, max: 699 },
    { name: 'Held', min: 700, max: 1499 },
    { name: 'Ambassadeur', min: 1500, max: 9999 },
  ]
  const lv = levels.find((l) => pts >= l.min && pts <= l.max) || levels[0]
  const pct = Math.min(100, Math.round(((pts - lv.min) / (lv.max - lv.min + 1)) * 100))
  return { lv, pct }
}

export type DashboardSnapshot = {
  email: string
  donations: LegacyDonation[]
  monthlyDonations: LegacyMonthlyDonation[]
  points: number
  totalDonated: number
  sticker: boolean
  shopSpent: number
  anonymous: boolean
  refCode: string
  referralLink: string
  referralCount: number
  referralPtsEarned: number
  yearTotal: number
  year: number
  monthlyAmount: number
  monthlyCount: number
  oneTimeCount: number
  dsMonthlyCountLabel: string
  rankPos: string
  earnedBadgeCount: number
  hasProject: boolean
}

export function buildDashboardSnapshot(shell: LegacyShellUser): DashboardSnapshot {
  const email = shell.email
  const stored = readDnlAccounts()[email] || {}
  const storedPoints = Number(stored.points ?? shell.points ?? 0)
  const storedTotalDonated = Number(stored.totalDonated ?? shell.totalDonated ?? 0)

  const isLiveSession = shell.source === 'session' && Boolean(shell.user)
  const sessionRef =
    shell.user?.referralMyCode?.trim() != null && shell.user.referralMyCode.trim() !== ''
      ? shell.user.referralMyCode.trim().toUpperCase()
      : ''
  const refCode = isLiveSession ? sessionRef || '' : ensureRefCodeInAccounts(email, shell.firstName)

  const referralLink = refCode ? getReferralLink(refCode, 'particulier') : ''
  const refs = readReferralSignedUps(refCode)
  const referralCount = refs.length
  const referralPtsEarned = Math.min(referralCount, REFERRAL_REWARD_INVITE_CAP) * 100

  let donations: LegacyDonation[]
  if ((stored.donations?.length ?? 0) > 0) {
    donations = [...(stored.donations || [])]
  } else if (shell.previewDonations?.length) {
    donations = previewToDonations(shell.previewDonations)
  } else {
    donations = []
  }

  const monthlyDonations = stored.monthlyDonations || []
  const year = new Date().getFullYear()
  const yearDonations = donations.filter((d) => d.date && d.date.includes(String(year)))
  const yearTotal = yearDonations.reduce((s, d) => s + (d.amount || 0), 0)

  const activeMonthly = monthlyDonations.filter((d) => d.status !== 'gestopt')
  const monthlyAmount = activeMonthly.reduce((s, d) => s + (parseFloat(String(d.amount)) || 0), 0)
  const monthlyCount = activeMonthly.length
  const oneTime = donations.filter((d) => !d.monthly).length

  const dsMonthlyCountLabel =
    monthlyAmount > 0 ? `€${monthlyAmount.toFixed(2)}` : monthlyCount > 0 ? `${monthlyCount}x` : '€0'

  const lb = buildHomeLiveLeaderboard(email)
  const me = lb.find((r) => r.isCurrentUser)
  const rankPos = me ? `#${me.rank}` : '#—'

  const badgeUser: BadgeUser = {
    donations,
    totalDonated: storedTotalDonated,
    sticker: stored.sticker,
    monthlyDonations,
    email,
  }
  const earnedBadgeCount = BADGES_ALL.filter((b) => checkBadgeEarned(b, badgeUser)).length

  const hasProject = Array.isArray(stored.projects) && stored.projects.length > 0

  const anonymous =
    shell.source === 'session' ? shell.anonymous : !!(stored.anonymous ?? false)

  return {
    email: shell.email,
    donations,
    monthlyDonations,
    points: storedPoints,
    totalDonated: storedTotalDonated,
    sticker: !!stored.sticker,
    shopSpent: stored.shopSpent ?? 0,
    anonymous,
    refCode,
    referralLink,
    referralCount,
    referralPtsEarned,
    yearTotal,
    year,
    monthlyAmount,
    monthlyCount,
    oneTimeCount: oneTime,
    dsMonthlyCountLabel,
    rankPos,
    earnedBadgeCount,
    hasProject,
  }
}

export function downloadDonationsPdf(shell: LegacyShellUser, donations: LegacyDonation[], year: string) {
  const list = year === 'all' ? [...donations] : donations.filter((d) => d.date && d.date.includes(year))
  const total = list.reduce((s, d) => s + (d.amount || 0), 0)
  const yearLabel = year === 'all' ? 'Alle jaren' : year
  const rows = [...list]
    .reverse()
    .map(
      (d) =>
        `<tr><td>${escapeHtml(d.cause)}</td><td>${escapeHtml(d.org)}</td><td style="text-align:center;">${d.monthly ? 'Maandelijks' : 'Eenmalig'}</td><td style="text-align:center;">${escapeHtml(d.date)}</td><td style="text-align:right;">€${(d.amount || 0).toFixed(2)}</td></tr>`,
    )
    .join('')
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <style>
    body{font-family:Arial,sans-serif;padding:40px;color:#1f2937;max-width:800px;margin:0 auto;}
    h1{color:#1a237e;font-size:22px;margin-bottom:4px;}
    .sub{color:#6b7280;font-size:13px;margin-bottom:28px;}
    .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:28px;}
    .info-box{background:#f8f9ff;border:1px solid #dde6ff;border-radius:8px;padding:12px 16px;}
    .info-label{font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.05em;}
    .info-val{font-size:18px;font-weight:900;color:#1a237e;margin-top:2px;}
    table{width:100%;border-collapse:collapse;font-size:13px;}
    th{background:#1a237e;color:#fff;padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;}
    td{padding:9px 12px;border-bottom:1px solid #e5e7eb;}
    tr:nth-child(even) td{background:#f8f9ff;}
    .total-row td{background:#e0e7ff;font-weight:700;border-top:2px solid #1a237e;}
    .footer{margin-top:28px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;line-height:1.7;}
    .anbi-note{background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:12px 16px;margin-bottom:20px;font-size:12px;color:#92400e;}
  </style></head><body>
  <h1>Donatieoverzicht — Donatie.eu</h1>
  <div class="sub">Gegenereerd op ${new Date().toLocaleDateString('nl-NL')} · Periode: ${yearLabel} · ${escapeHtml(shell.firstName)} ${escapeHtml(shell.lastName)} · ${escapeHtml(shell.email)}</div>
  <div class="anbi-note">💡 <strong>Belastingaangifte:</strong> Giften aan ANBI-erkende organisaties zijn fiscaal aftrekbaar. Bewaar dit overzicht voor uw aangifte inkomstenbelasting. Alle organisaties op Donatie.eu zijn CBF-gecertificeerd.</div>
  <div class="info-grid">
    <div class="info-box"><div class="info-label">Totaal gedoneerd</div><div class="info-val">€${total.toFixed(2)}</div></div>
    <div class="info-box"><div class="info-label">Aantal donaties</div><div class="info-val">${list.length}</div></div>
    <div class="info-box"><div class="info-label">Periode</div><div class="info-val">${yearLabel}</div></div>
    <div class="info-box"><div class="info-label">Naam donor</div><div class="info-val">${escapeHtml(shell.firstName)} ${escapeHtml(shell.lastName)}</div></div>
  </div>
  <table><thead><tr><th>Doel</th><th>Organisatie</th><th>Type</th><th>Datum</th><th style="text-align:right;">Bedrag</th></tr></thead>
  <tbody>${rows}<tr class="total-row"><td colspan="4"><strong>Totaal ${yearLabel}</strong></td><td style="text-align:right;">€${total.toFixed(2)}</td></tr></tbody></table>
  <div class="footer">Donatie.eu · Platform voor transparante filantropie · Alle getoonde organisaties zijn CBF-erkend.<br>
  Dit overzicht is automatisch gegenereerd en dient als bewijsdocument voor uw belastingaangifte.<br>
  Bewaar dit document samen met eventuele schriftelijke bevestigingen van de organisaties zelf.</div>
</body></html>`
  const w = window.open('', '_blank', 'width=850,height=700')
  if (!w) return
  w.document.write(html)
  w.document.close()
  window.setTimeout(() => {
    try {
      w.print()
    } catch {
      /* ignore */
    }
  }, 600)
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
