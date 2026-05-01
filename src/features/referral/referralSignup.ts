import { isSupabaseConfigured, supabase } from '../../lib/supabase'

const REFERRAL_META_KEY = 'referral_code'

function normalizeReferralInput(raw: string | undefined | null): string | null {
  const s = String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  return s.length === 6 ? s : null
}

/**
 * Roept RPC aan nadat een profiel­rij voor de ingelogde gebruiker bestaat.
 * Dubbel uitvoeren veilig door `referred_by_user_id` in de database.
 */
export async function claimReferralSignupRewardFromMetadata(userMetadata?: Record<string, unknown> | null): Promise<void> {
  const code = normalizeReferralInput(
    typeof userMetadata?.[REFERRAL_META_KEY] === 'string' ? userMetadata![REFERRAL_META_KEY] as string : '',
  )
  if (!code) return
  if (!isSupabaseConfigured || !supabase) return

  await supabase.rpc('claim_referral_signup_reward', { p_referrer_code: code })
}

export type MyReferralInviteStats = {
  inviteCount: number
  pointsFromInvites: number
  rewardedInvites?: number
  inviteCap?: number
}

export async function fetchMyReferralInviteStats(): Promise<MyReferralInviteStats | null> {
  if (!isSupabaseConfigured || !supabase) return null
  const { data, error } = await supabase.rpc('get_my_referral_invite_stats')
  if (error || !data || typeof data !== 'object') return null
  const o = data as Record<string, unknown>
  const inviteCount = Number(o.invite_count ?? 0) || 0
  const pointsFromInvites = Number(o.points_from_invites ?? 0) || 0
  const rewardedInvites =
    o.rewarded_invites != null && String(o.rewarded_invites).trim() !== ''
      ? Math.max(0, Number(o.rewarded_invites) || 0)
      : undefined
  const inviteCap =
    o.invite_cap != null && String(o.invite_cap).trim() !== '' ? Number(o.invite_cap) || undefined : undefined
  return {
    inviteCount,
    pointsFromInvites,
    ...(rewardedInvites !== undefined ? { rewardedInvites } : {}),
    ...(inviteCap !== undefined ? { inviteCap } : {}),
  }
}
