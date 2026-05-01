import { supabase } from '../../lib/supabase'
import { sendEdgeEmail } from '../../services/edgeFunctions'
import type { AccountType, LocalUser, Profile } from '../../types/auth'
import { upsertDnlAccountProfile } from '../account/legacyDashboardModel'
import { claimReferralSignupRewardFromMetadata } from '../referral/referralSignup'
import { ensureSignupWelcomeInbox } from '../public/userSiteNotifications'
import {
  activateMyPendingCommunityPoints,
  syncProfileAccountTypeIndividu,
} from '../community/communityProjectsService'
import { activateMyPendingPoints } from '../shop/siteShopService'

const adminFunctionPath = '/functions/v1/admin-login'
export const authStateChangedEvent = 'donatie:auth-state-changed'

const PW_RECOVERY_INTENT_KEY = 'donatie:pw-recovery-intent'

/** Zet/vraag intent aan na klik op Supabase-herstelmail (hash/query; zie ook vroege vang in index.html vóór Supabase-init). */
export function readPasswordRecoveryIntent(): boolean {
  if (typeof window === 'undefined') return false
  const onResetPath = (window.location.pathname || '').includes('reset-password')

  const fromHash = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('type') === 'recovery'
  if (fromHash) {
    try {
      sessionStorage.setItem(PW_RECOVERY_INTENT_KEY, '1')
    } catch {
      /* ignore */
    }
    return true
  }

  if (onResetPath) {
    const q = new URLSearchParams(window.location.search)
    if (q.get('type') === 'recovery' || q.has('code')) {
      try {
        sessionStorage.setItem(PW_RECOVERY_INTENT_KEY, '1')
      } catch {
        /* ignore */
      }
      return true
    }
  }

  try {
    return sessionStorage.getItem(PW_RECOVERY_INTENT_KEY) === '1'
  } catch {
    return false
  }
}

export function clearPasswordRecoveryIntent() {
  try {
    sessionStorage.removeItem(PW_RECOVERY_INTENT_KEY)
  } catch {
    /* ignore */
  }
}

/** URL voor Supabase wachtwoordherstel; moet in het Supabase-project onder Auth → URL configuration staan als redirect-URL. */
export function getPasswordResetRedirectUrl(): string {
  const explicit = import.meta.env.VITE_SITE_URL
  if (typeof explicit === 'string' && explicit.trim()) {
    return `${explicit.replace(/\/$/, '')}/auth/reset-password`
  }
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/auth/reset-password`
  }
  return '/auth/reset-password'
}

export async function requestPasswordReset(email: string): Promise<void> {
  if (!supabase) {
    throw new Error('Supabase is nog niet geconfigureerd.')
  }
  const trimmed = email.trim().toLowerCase()
  if (!trimmed || !trimmed.includes('@')) {
    throw new Error('Vul een geldig e-mailadres in.')
  }
  const redirectTo = getPasswordResetRedirectUrl()
  const { error } = await supabase.auth.resetPasswordForEmail(trimmed, { redirectTo })
  if (error) {
    throw new Error(mapResetRequestError(error.message))
  }
}

export async function updatePasswordFromRecovery(newPassword: string): Promise<void> {
  if (!supabase) {
    throw new Error('Supabase is nog niet geconfigureerd.')
  }
  if (newPassword.length < 8) {
    throw new Error('Wachtwoord moet minimaal 8 tekens zijn.')
  }
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) {
    throw new Error(mapPasswordUpdateError(error.message))
  }
}

export async function loginWithPassword(email: string, password: string): Promise<LocalUser> {
  if (!supabase) {
    throw new Error('Supabase is nog niet geconfigureerd.')
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data.user) {
    throw new Error(mapAuthError(error?.message))
  }

  clearPasswordRecoveryIntent()
  await tryJoinPendingCommunityCode(data.user.user_metadata)
  try {
    await Promise.all([activateMyPendingCommunityPoints(), activateMyPendingPoints()])
  } catch {
    /* niet-fataal */
  }
  let profile = await loadProfile(data.user.id)
  if (!profile) {
    await upsertProfileFromAuthUser(data.user)
    profile = await loadProfile(data.user.id)
  }
  await claimReferralSignupRewardFromMetadata(data.user.user_metadata ?? {})
  profile = await loadProfile(data.user.id)
  const user = buildLocalUser(data.user, profile)
  syncDnlAccountFromAuth(user, data.user.user_metadata, profile)
  emitAuthStateChanged(user)
  return user
}

export async function adminLogin(email: string, password: string): Promise<void> {
  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error('Supabase env vars ontbreken.')
  }

  const response = await fetch(`${url}${adminFunctionPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ email, password }),
  })

  const result = (await response.json()) as { success?: boolean; error?: string }
  if (!response.ok || !result.success) {
    throw new Error(result.error ?? 'Onjuiste admin-inloggegevens.')
  }
}

export async function restoreAuthenticatedUser(): Promise<LocalUser | null> {
  if (!supabase) {
    throw new Error('Supabase is nog niet geconfigureerd.')
  }

  const { data, error } = await supabase.auth.getSession()
  if (error) {
    throw new Error(`Sessie kon niet worden geladen: ${error.message}`)
  }

  const sessionUser = data.session?.user
  if (!sessionUser) return null

  await tryJoinPendingCommunityCode(sessionUser.user_metadata)
  // Activeer punten (algemeen + community) waarvan de 72u reflectieperiode voorbij is.
  try {
    await Promise.all([activateMyPendingCommunityPoints(), activateMyPendingPoints()])
  } catch {
    /* niet-fataal */
  }
  let profile = await loadProfile(sessionUser.id)
  if (!profile) {
    await upsertProfileFromAuthUser(sessionUser)
    profile = await loadProfile(sessionUser.id)
  }

  await claimReferralSignupRewardFromMetadata(sessionUser.user_metadata ?? {})
  profile = await loadProfile(sessionUser.id)
  void ensureSignupWelcomeInbox()

  const user = buildLocalUser(sessionUser, profile)
  syncDnlAccountFromAuth(user, sessionUser.user_metadata, profile)
  return user
}

export async function logoutCurrentUser(): Promise<void> {
  if (!supabase) {
    throw new Error('Supabase is nog niet geconfigureerd.')
  }

  const { error } = await supabase.auth.signOut()
  if (error) {
    throw new Error(`Uitloggen mislukt: ${error.message}`)
  }

  clearPasswordRecoveryIntent()
  emitAuthStateChanged(null)
}

interface RegisterInput {
  firstName: string
  lastName: string
  email: string
  password: string
  anonymous: boolean
  accountType: AccountType
  metadata?: Record<string, unknown>
}

interface RegisterResult {
  emailConfirmationRequired: boolean
  user: LocalUser | null
}

export async function registerIndividual(
  input: Omit<RegisterInput, 'accountType'>,
): Promise<RegisterResult> {
  return registerAccount({
    ...input,
    accountType: 'individu',
  })
}

export async function registerCompany(input: Omit<RegisterInput, 'accountType'>): Promise<RegisterResult> {
  return registerAccount({
    ...input,
    accountType: 'bedrijf',
  })
}

export async function registerInfluencer(
  input: Omit<RegisterInput, 'accountType'>,
): Promise<RegisterResult> {
  return registerAccount({
    ...input,
    accountType: 'influencer',
  })
}

async function registerAccount(input: RegisterInput): Promise<RegisterResult> {
  if (!supabase) {
    throw new Error('Supabase is nog niet geconfigureerd.')
  }

  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: {
        first_name: input.firstName,
        last_name: input.lastName,
        account_type: input.accountType,
        anonymous: input.anonymous,
        ...(input.metadata ?? {}),
      },
    },
  })

  if (error || !data.user) {
    throw new Error(mapRegisterError(error?.message))
  }

  if (!data.session) {
    return {
      emailConfirmationRequired: true,
      user: null,
    }
  }

  await upsertProfile(data.user.id, input)
  await tryJoinPendingCommunityCode(data.user.user_metadata)
  await claimReferralSignupRewardFromMetadata({
    ...(data.user.user_metadata ?? {}),
    ...(input.metadata ?? {}),
  })
  void ensureSignupWelcomeInbox()

  const profileAfter = await loadProfile(data.user.id)

  const name =
    [input.firstName, input.lastName]
      .map((s) => (typeof s === 'string' ? s.trim() : ''))
      .filter(Boolean)
      .join(' ') || 'daar'
  void sendEdgeEmail({ to: input.email, type: 'welcome', payload: { name } }).catch(() => undefined)

  const metaOverride = {
    first_name: input.firstName,
    last_name: input.lastName,
    account_type: input.accountType,
    anonymous: input.anonymous,
    ...(input.metadata ?? {}),
  }
  const user = buildLocalUser(data.user, profileAfter, metaOverride)
  syncDnlAccountFromAuth(user, data.user.user_metadata, profileAfter)

  emitAuthStateChanged(user)

  return {
    emailConfirmationRequired: false,
    user,
  }
}

async function loadProfile(userId: string): Promise<Profile | null> {
  if (!supabase) return null
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
  if (error) return null
  return data as Profile
}

async function upsertProfile(userId: string, input: RegisterInput): Promise<void> {
  if (!supabase) return

  const { error } = await supabase.from('profiles').upsert(
    {
      id: userId,
      email: input.email,
      first_name: input.firstName,
      last_name: input.lastName,
      account_type: input.accountType,
      anonymous: input.anonymous,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  )

  if (error) {
    throw new Error(`Profiel kon niet opgeslagen worden: ${error.message}`)
  }
}

async function upsertProfileFromAuthUser(user: {
  id: string
  email?: string | null
  user_metadata?: Record<string, unknown>
}): Promise<void> {
  if (!supabase) return

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  const { error } = await supabase.from('profiles').upsert(
    {
      id: user.id,
      email: user.email ?? null,
      first_name: readString(meta.first_name) || null,
      last_name: readString(meta.last_name) || null,
      account_type: readAccountType(meta.account_type),
      anonymous: readBoolean(meta.anonymous),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  )

  if (error) {
    throw new Error(`Profiel kon niet opgeslagen worden: ${error.message}`)
  }
}

function buildLocalUser(
  sbUser: { id: string; email?: string | null; user_metadata?: Record<string, unknown> },
  profile: Profile | null,
  metadataOverride?: Record<string, unknown>,
): LocalUser {
  const meta = {
    ...(sbUser.user_metadata ?? {}),
    ...(metadataOverride ?? {}),
  } as Record<string, unknown>
  const email = sbUser.email ?? ''
  const emailPrefix = email.split('@')[0] || 'Gebruiker'

  return {
    id: sbUser.id,
    email,
    firstName: profile?.first_name || readString(meta.first_name) || emailPrefix,
    lastName: profile?.last_name || readString(meta.last_name) || '',
    type: (profile?.account_type || readString(meta.account_type) || 'individu') as LocalUser['type'],
    anonymous: Boolean(profile?.anonymous ?? readBoolean(meta.anonymous)),
    points: Number(profile?.points ?? 0),
    totalDonated: Number(profile?.total_donated ?? 0),
    communityPoints: Number(profile?.community_points ?? 0),
    avatarUrl: profile?.avatar_url ?? null,
    address: profile?.address ?? null,
    postalCode: profile?.postal_code ?? null,
    city: profile?.city ?? null,
    country: profile?.country ?? null,
    referralMyCode: profile?.referral_my_code ?? null,
  }
}

function mapAuthError(message?: string): string {
  const known: Record<string, string> = {
    'Invalid login credentials': 'Onjuist e-mailadres of wachtwoord.',
    'Email not confirmed': 'Bevestig eerst je e-mailadres via de welkomstmail.',
    'Too many requests': 'Te veel pogingen. Probeer later opnieuw.',
  }
  return known[message ?? ''] ?? `Inloggen mislukt${message ? `: ${message}` : '.'}`
}

function mapRegisterError(message?: string): string {
  const known: Record<string, string> = {
    'User already registered': 'Er bestaat al een account met dit e-mailadres.',
    'Email already in use': 'Er bestaat al een account met dit e-mailadres.',
  }
  return known[message ?? ''] ?? `Registratie mislukt${message ? `: ${message}` : '.'}`
}

function mapResetRequestError(message?: string): string {
  const known: Record<string, string> = {
    'Too many requests': 'Te veel pogingen. Probeer later opnieuw.',
  }
  return known[message ?? ''] ?? `E-mail kon niet worden verstuurd${message ? `: ${message}` : '.'}`
}

function mapPasswordUpdateError(message?: string): string {
  const known: Record<string, string> = {
    'Auth session missing!': 'De herstellink is ongeldig of verlopen. Vraag een nieuwe aan.',
    'New password should be different from the old password.': 'Kies een ander wachtwoord dan je huidige.',
  }
  return known[message ?? ''] ?? `Wachtwoord bijwerken mislukt${message ? `: ${message}` : '.'}`
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function readBoolean(value: unknown): boolean {
  return typeof value === 'boolean' ? value : false
}

function readAccountType(value: unknown): AccountType {
  return value === 'bedrijf' || value === 'influencer' ? value : 'individu'
}

function emitAuthStateChanged(user: LocalUser | null) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent(authStateChangedEvent, {
      detail: user,
    }),
  )
}

function syncDnlAccountFromAuth(
  user: LocalUser,
  metadata: Record<string, unknown> | undefined,
  profile: Profile | null,
) {
  const meta = metadata || {}
  const bedrijfsnaam = readString(meta.bedrijfsnaam) || readString(meta.company_name)
  const inflNaam = readString(meta.inflNaam) || readString(meta.influencer_name)
  const niche = readString(meta.niche)
  const avatarUrl = readString(meta.avatar_url)
  upsertDnlAccountProfile(user.email, {
    type: user.type,
    firstName: user.firstName,
    lastName: user.lastName,
    anonymous: user.anonymous,
    points: user.points,
    totalDonated: user.totalDonated,
    ...(bedrijfsnaam ? { bedrijfsnaam } : {}),
    ...(inflNaam ? { inflNaam } : {}),
    ...(niche ? { niche } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
    ...(profile?.email ? { email: String(profile.email).toLowerCase() } : {}),
  })
}

async function tryJoinPendingCommunityCode(metadata: Record<string, unknown> | undefined) {
  if (!supabase) return
  const meta = (metadata ?? {}) as Record<string, unknown>
  const raw = meta.pending_community_code ?? meta.bedrijf_code ?? meta.community_code
  const code = typeof raw === 'string' ? raw.trim().toUpperCase() : ''
  if (!code) return

  try {
    const rawAt = meta.account_type
    if (rawAt !== 'bedrijf' && rawAt !== 'influencer') {
      await syncProfileAccountTypeIndividu()
    }
    await supabase.rpc('join_community_with_code', { raw_code: code })
    const { data } = await supabase.auth.getUser()
    const user = data.user
    if (!user) return
    const nextMeta = { ...(user.user_metadata ?? {}) } as Record<string, unknown>
    delete nextMeta.pending_community_code
    await supabase.auth.updateUser({ data: nextMeta })
  } catch {
    // Inloggen/registreren moet niet falen op community-koppeling.
  }
}
