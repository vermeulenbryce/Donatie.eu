import type { LegacyShellUser } from '../../context/LegacyUiSessionContext'
import type { LocalUser } from '../../types/auth'

export type DonnieUserType = 'gast' | 'particulier' | 'bedrijf' | 'influencer'

export type DonnieContext = {
  type: DonnieUserType
  naam: string
  acc: Record<string, unknown>
  extra: {
    comms?: unknown[]
    camps?: unknown[]
  }
}

function readJson<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || '') as T
  } catch {
    return fallback
  }
}

/**
 * Mirrors `donnieGetContext()` from legacy `index.html`, using React session
 * (`LegacyShellUser`) instead of `state` / `bdState` / `inflState`.
 */
export function getDonnieContext(shell: LegacyShellUser | null): DonnieContext {
  const ctx: DonnieContext = { type: 'gast', naam: '', acc: {}, extra: {} }
  if (!shell) return ctx

  const allAccounts = readJson<Record<string, Record<string, unknown>>>('dnl_accounts', {})

  if (shell.source === 'demo') {
    ctx.type = 'particulier'
    ctx.naam = shell.firstName || 'Donateur'
    ctx.acc = allAccounts[shell.email] || {
      donations: shell.previewDonations ?? [],
      points: shell.points,
      totalDonated: shell.totalDonated,
    }
    return ctx
  }

  const u: LocalUser | null = shell.user
  if (!u) return ctx

  const acc = allAccounts[u.email] || {}
  ctx.acc = acc

  if (u.type === 'bedrijf') {
    ctx.type = 'bedrijf'
    ctx.naam = (acc.bedrijfsnaam as string) || u.firstName || 'Bedrijf'
    const comms = readJson<Record<string, unknown>[]>('dnl_communities', []).filter(
      (c) => (c as { _owner?: string })._owner === u.email,
    )
    const camps = readJson<Record<string, unknown>[]>('dnl_campaigns', []).filter(
      (c) => (c as { owner?: string }).owner === u.email,
    )
    ctx.extra = { comms, camps }
    return ctx
  }

  if (u.type === 'influencer') {
    ctx.type = 'influencer'
    ctx.naam = (acc.inflNaam as string) || u.firstName || 'Influencer'
    const comms = readJson<Record<string, unknown>[]>('dnl_communities', []).filter(
      (c) => (c as { influencerEmail?: string }).influencerEmail === u.email,
    )
    const camps = readJson<Record<string, unknown>[]>('dnl_campaigns', []).filter(
      (c) => (c as { owner?: string }).owner === u.email,
    )
    ctx.extra = { comms, camps }
    return ctx
  }

  ctx.type = 'particulier'
  ctx.naam = u.firstName || 'Donateur'
  return ctx
}
