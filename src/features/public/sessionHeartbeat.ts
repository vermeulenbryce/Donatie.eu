import { isSupabaseConfigured, supabase } from '../../lib/supabase'

let timer: ReturnType<typeof setInterval> | null = null
let started = false

/**
 * Start een periodieke heartbeat naar Supabase zodat admin kan zien wie online is.
 * Idempotent: meerdere calls leiden niet tot meerdere timers.
 */
export function startSessionHeartbeat(intervalMs = 30_000): () => void {
  if (started) return stopSessionHeartbeat
  started = true
  const tick = async () => {
    if (!isSupabaseConfigured || !supabase) return
    const { data } = await supabase.auth.getSession()
    if (!data.session) return
    try {
      await supabase.rpc('heartbeat_session', {
        p_route: typeof window !== 'undefined' ? window.location.pathname : null,
        p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      })
    } catch {
      /* niet-fataal */
    }
  }
  void tick()
  timer = setInterval(() => void tick(), Math.max(5000, intervalMs))
  return stopSessionHeartbeat
}

export function stopSessionHeartbeat(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  started = false
}
