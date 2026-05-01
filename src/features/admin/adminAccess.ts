import { supabase } from '../../lib/supabase'

/** Vraagt Supabase of de huidige gebruiker `raw_app_meta_data.role = 'admin'` heeft. */
export async function fetchIsPlatformAdmin(): Promise<boolean> {
  if (!supabase) return false
  const { data, error } = await supabase.rpc('is_platform_admin')
  if (error) return false
  return Boolean(data)
}

/**
 * Probeert de admin in te loggen bij Supabase Auth met dezelfde credentials als de legacy
 * admin-login edge function. Niet-fataal: als het faalt zijn admin-functies gewoon
 * read-only-ish totdat er een Supabase-sessie is.
 */
export async function trySupabaseAdminSignIn(username: string, password: string): Promise<boolean> {
  if (!supabase) return false
  const looksLikeEmail = username.includes('@')
  const candidates = looksLikeEmail ? [username] : [`${username}@donatie.eu`, username]
  for (const email of candidates) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (!error && data.user) {
      return await fetchIsPlatformAdmin()
    }
  }
  return false
}

export async function signOutAdminSupabase(): Promise<void> {
  if (!supabase) return
  try {
    await supabase.auth.signOut()
  } catch {
    /* ignore */
  }
}
