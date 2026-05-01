/**
 * Gedeelde mapping van `get_public_leaderboard` → rijen voor widgets / dashboard.
 */

import type { LiveLbRow } from './homeLiveLeaderboard'
import type { PublicLeaderboardRow } from './liveLeaderboardService'

const ROW_COLORS = [
  'linear-gradient(135deg,#FFD700,#FFA500)',
  'linear-gradient(135deg,#43A3FA,#1a7fd4)',
  'linear-gradient(135deg,#5DE8B0,#28c484)',
  'linear-gradient(135deg,#FF6B6B,#ee3e3e)',
  'linear-gradient(135deg,#FDB2C7,#e8799a)',
] as const

export function mapPublicLeaderboardToLiveLbRows(rows: PublicLeaderboardRow[], slice = rows.length): LiveLbRow[] {
  const part = rows.slice(0, slice)
  return part.map((r, i) => ({
    rank: r.rank,
    name: r.is_anonymous && !r.is_me ? 'Anoniem' : r.label,
    pts: r.points,
    amt: Math.round(Number(r.total_donated) || 0),
    sticker: false,
    ava: r.is_anonymous && !r.is_me ? '?' : r.initial,
    color: ROW_COLORS[i % ROW_COLORS.length],
    isCurrentUser: r.is_me,
    isAnon: r.is_anonymous,
  }))
}
