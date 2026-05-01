import { isSupabaseConfigured, supabase } from '../../lib/supabase'

export type UserSiteNotificationRow = {
  id: string
  type: 'melding' | 'push' | 'actie'
  target_user_id: string | null
  title: string
  body: string | null
  icon: string | null
  read_at: string | null
  created_at: string
}

/** Zelfde sleutel als `PushInbox` — ongelezen lokaal als DB geen `read_at` bijwerkt (RLS). */
export const USER_NOTIF_READ_IDS_LS = 'donatie:pushinbox:read_ids'

export function readLocalUserNotifReadIds(): Set<string> {
  try {
    const raw = sessionStorage.getItem(USER_NOTIF_READ_IDS_LS)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as string[]
    return new Set(arr)
  } catch {
    return new Set()
  }
}

export function writeLocalUserNotifReadIds(ids: Set<string>) {
  try {
    sessionStorage.setItem(USER_NOTIF_READ_IDS_LS, JSON.stringify(Array.from(ids)))
  } catch {
    /* ignore */
  }
}

/** Header-bel en account-inbox: zelfde feed (push, algemene melding, actie). */
export const SITE_INBOX_NOTIFICATION_TYPES: Array<'push' | 'melding' | 'actie'> = ['push', 'melding', 'actie']

/**
 * Site-inbox: `push`, `melding`, `actie` voor dezelfde gebruiker of broadcast (target_user_id is null).
 */
export async function fetchUserSiteNotifications(
  userId: string,
  types: Array<'push' | 'melding' | 'actie'>,
): Promise<UserSiteNotificationRow[] | null> {
  if (!isSupabaseConfigured || !supabase) return null
  const { data, error } = await supabase
    .from('site_notifications')
    .select('id, type, target_user_id, title, body, icon, read_at, created_at')
    .in('type', types)
    .or(`target_user_id.eq.${userId},target_user_id.is.null`)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error || !data) return null
  return data as UserSiteNotificationRow[]
}

export async function markUserNotificationReadServer(id: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return
  const { error } = await supabase
    .from('site_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
  if (error) {
    /* RLS: blijf leunen op lokale read-ids in UI */
  }
}

/**
 * Eenmalige welkomst-inbox bij nieuwe accounts (zie `docs/SQL_SIGNUP_WELCOME_INBOX.sql`).
 * Idempotent aanroepbaar na registratie of eerste sessie (e-mailbevestiging).
 */
export async function ensureSignupWelcomeInbox(): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return
  const { error } = await supabase.rpc('ensure_signup_welcome_notification')
  if (error) {
    /* niet-fataal voor registratie-/sessieflow */
  }
}
