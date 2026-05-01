export const ADMIN_SESSION_KEY = 'donatie_admin_ok'

const LEGACY_OK = '1'
const TTL_MS = 8 * 60 * 60 * 1000

type StoredSession = { v: 1; exp: number }

function parseStored(raw: string | null): StoredSession | null {
  if (!raw || raw === LEGACY_OK) return null
  try {
    const p = JSON.parse(raw) as StoredSession
    if (p.v !== 1 || typeof p.exp !== 'number') return null
    return p
  } catch {
    return null
  }
}

/** Alleen client-side “deur”; echte autorisatie blijft server/legacy. */
export function setAdminSessionOk(): void {
  sessionStorage.setItem(
    ADMIN_SESSION_KEY,
    JSON.stringify({ v: 1, exp: Date.now() + TTL_MS } satisfies StoredSession),
  )
}

export function isAdminSessionOk(): boolean {
  const raw = sessionStorage.getItem(ADMIN_SESSION_KEY)
  if (!raw) return false
  if (raw === LEGACY_OK) return true
  const p = parseStored(raw)
  if (!p) return false
  if (Date.now() >= p.exp) {
    sessionStorage.removeItem(ADMIN_SESSION_KEY)
    return false
  }
  return true
}

export function clearAdminSession(): void {
  sessionStorage.removeItem(ADMIN_SESSION_KEY)
}
