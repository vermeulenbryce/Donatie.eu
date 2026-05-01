/** Mirrors `buildLiveLeaderboard()` + `renderHomeLiveLeaderboard()` row shape from legacy index.html */

export type LiveLbRow = {
  name: string
  pts: number
  amt: number
  sticker: boolean
  ava: string
  color: string
  isCurrentUser: boolean
  isAnon: boolean
  rank: number
}

const COLORS = [
  'linear-gradient(135deg,#3a98f8,#6c47ff)',
  'linear-gradient(135deg,#f59e0b,#d97706)',
  'linear-gradient(135deg,#10b981,#059669)',
  'linear-gradient(135deg,#ef4444,#dc2626)',
  'linear-gradient(135deg,#8b5cf6,#7c3aed)',
]

type RawAccount = {
  firstName?: string
  lastName?: string
  email?: string
  points?: number
  totalDonated?: number
  anonymous?: boolean
  avatarUrl?: string
  sticker?: boolean
}

export function buildHomeLiveLeaderboard(currentEmail: string | null): LiveLbRow[] {
  const base: Omit<LiveLbRow, 'rank'>[] = []
  try {
    const accounts = JSON.parse(localStorage.getItem('dnl_accounts') || '{}') as Record<string, RawAccount>
    let ci = 0
    for (const u of Object.values(accounts)) {
      if (!u?.firstName) continue
      const pts = u.points || 0
      const amt = u.totalDonated || 0
      const isCurrentUser = !!(currentEmail && u.email === currentEmail)
      const isAnon = !!(u.anonymous && !isCurrentUser)
      const name = isAnon ? 'Anoniem' : `${u.firstName} ${u.lastName ? `${u.lastName[0]}.` : ''}`.trim()
      base.push({
        name,
        pts,
        amt,
        sticker: !!u.sticker,
        ava: isAnon ? '?' : u.firstName[0].toUpperCase(),
        color: isCurrentUser
          ? 'linear-gradient(135deg,#3a98f8,#1a237e)'
          : isAnon
            ? 'linear-gradient(135deg,#64748b,#334155)'
            : COLORS[ci++ % COLORS.length],
        isCurrentUser,
        isAnon,
      })
    }
  } catch {
    /* ignore */
  }

  base.sort((a, b) => b.pts - a.pts || b.amt - a.amt)
  return base.map((r, i) => ({ ...r, rank: i + 1 }))
}
