import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLegacyUiSession } from '../../context/LegacyUiSessionContext'
import { buildHomeLiveLeaderboard, type LiveLbRow } from '../../features/public/homeLiveLeaderboard'
import { mapPublicLeaderboardToLiveLbRows } from '../../features/public/liveLeaderboardUi'
import { fetchPublicLeaderboard } from '../../features/public/liveLeaderboardService'
import { isSupabaseConfigured } from '../../lib/supabase'

/** Zelfde voorbeelddata als de hero-kaarten wanneer er (nog) geen `dnl_accounts` in localStorage staat — voorkomt een lege widget. */
const FALLBACK_TOP5: LiveLbRow[] = [
  {
    rank: 1,
    name: 'Peter H.',
    pts: 300,
    amt: 1240,
    sticker: false,
    ava: 'P',
    color: 'linear-gradient(135deg,#FFD700,#FFA500)',
    isCurrentUser: false,
    isAnon: false,
  },
  {
    rank: 2,
    name: 'Lisa V.',
    pts: 216,
    amt: 980,
    sticker: false,
    ava: 'L',
    color: 'linear-gradient(135deg,#43A3FA,#1a7fd4)',
    isCurrentUser: false,
    isAnon: false,
  },
  {
    rank: 3,
    name: 'Marijn B.',
    pts: 180,
    amt: 820,
    sticker: false,
    ava: 'M',
    color: 'linear-gradient(135deg,#5DE8B0,#28c484)',
    isCurrentUser: false,
    isAnon: false,
  },
  {
    rank: 4,
    name: 'Sanne K.',
    pts: 142,
    amt: 640,
    sticker: false,
    ava: 'S',
    color: 'linear-gradient(135deg,#FF6B6B,#ee3e3e)',
    isCurrentUser: false,
    isAnon: false,
  },
  {
    rank: 5,
    name: 'Tom W.',
    pts: 118,
    amt: 510,
    sticker: false,
    ava: 'T',
    color: 'linear-gradient(135deg,#FDB2C7,#e8799a)',
    isCurrentUser: false,
    isAnon: false,
  },
]

function rankCell(i: number) {
  if (i === 0) return '🥇'
  if (i === 1) return '🥈'
  if (i === 2) return '🥉'
  return String(i + 1)
}

function rankClass(i: number) {
  if (i === 0) return 'r1'
  if (i === 1) return 'r2'
  if (i === 2) return 'r3'
  return ''
}

export function HomeLiveLeaderboardWidget() {
  const { shell } = useLegacyUiSession()
  const [tick, setTick] = useState(0)
  const [liveTop, setLiveTop] = useState<LiveLbRow[] | undefined>(undefined)

  const currentEmail = shell?.email ?? null

  const loadLive = useCallback(async () => {
    if (!isSupabaseConfigured) return
    try {
      const rows = await fetchPublicLeaderboard('individuen', 12)
      setLiveTop(mapPublicLeaderboardToLiveLbRows(rows, 5))
    } catch (e) {
      console.warn('[home leaderboard] fetchPublicLeaderboard', e)
      setLiveTop([])
    }
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured) return
    void loadLive()
    const id = window.setInterval(() => void loadLive(), 30_000)
    const onVis = () => {
      if (document.visibilityState === 'visible') void loadLive()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [loadLive])

  useEffect(() => {
    if (!isSupabaseConfigured) return
    const t = window.setTimeout(() => void loadLive(), 400)
    return () => window.clearTimeout(t)
  }, [shell?.points, shell?.totalDonated, loadLive])

  const data = useMemo(() => {
    if (isSupabaseConfigured) {
      if (liveTop !== undefined) return liveTop
      return []
    }
    void tick
    return buildHomeLiveLeaderboard(currentEmail)
  }, [currentEmail, tick, shell?.points, shell?.totalDonated, liveTop])

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'dnl_accounts') setTick((t) => t + 1)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const top5 = (() => {
    if (isSupabaseConfigured) return data.slice(0, 5)
    return (data.length ? data : FALLBACK_TOP5).slice(0, 5)
  })()

  const dataForYouBar = data.length ? data : []

  const youBarInner = useMemo(() => {
    if (!shell) {
      return (
        <>
          <Link to="/auth" style={{ color: 'var(--blue)', fontWeight: 700 }}>
            Log in
          </Link>{' '}
          om jouw positie te zien op de ranglijst.
        </>
      )
    }
    const me = dataForYouBar.find((r) => r.isCurrentUser)
    if (!me) return null
    const rank3 = dataForYouBar[2]
    if (rank3 && me.rank > 3) {
      const diff = rank3.pts - me.pts
      return (
        <>
          Je staat <strong>{diff} punten</strong> achter positie #3. Doneer €{Math.ceil(diff * 2)} om bij te halen!
        </>
      )
    }
    if (me.rank <= 3) {
      return (
        <>
          🏆 Je staat in de <strong>top 3</strong>! Blijf doneren om je positie te houden.
        </>
      )
    }
    return null
  }, [shell, dataForYouBar])

  return (
    <>
      <div className="lb-title">🏅 Top donateurs — live</div>
      <div id="homeLiveLeaderboard">
        {top5.map((r, i) => {
          const rowStyle = r.isCurrentUser
            ? ({ background: 'linear-gradient(90deg,#eff6ff,#f0fdf4)', borderRadius: 10 } as const)
            : undefined
          return (
            <div key={`${r.name}-${i}`} className="lb-row" style={rowStyle}>
              <div className={`lb-rank ${rankClass(i)}`}>{rankCell(i)}</div>
              <div className="lb-ava" style={{ background: r.color }}>
                {r.ava}
              </div>
              <div className="lb-info">
                <div className="lb-name">
                  {r.name}
                  {r.isCurrentUser ? (
                    <span
                      style={{
                        fontSize: '0.7rem',
                        background: '#dbeafe',
                        color: '#1d4ed8',
                        borderRadius: 6,
                        padding: '1px 5px',
                        fontWeight: 700,
                        marginLeft: 4,
                      }}
                    >
                      jij
                    </span>
                  ) : null}
                  {r.isAnon && !r.isCurrentUser ? (
                    <span
                      style={{
                        fontSize: '0.7rem',
                        background: '#e2e8f0',
                        color: '#475569',
                        borderRadius: 6,
                        padding: '1px 5px',
                        fontWeight: 700,
                        marginLeft: 4,
                      }}
                      title="Anoniem op de ranglijst"
                    >
                      🕵️ anoniem
                    </span>
                  ) : null}
                  {r.isAnon && r.isCurrentUser ? (
                    <span
                      style={{
                        fontSize: '0.65rem',
                        background: '#dbeafe',
                        color: '#1e40af',
                        borderRadius: 6,
                        padding: '2px 6px',
                        fontWeight: 700,
                        marginLeft: 4,
                      }}
                      title="Voor anderen: Anoniem"
                    >
                      🕵️ verborgen voor anderen
                    </span>
                  ) : null}
                </div>
                <div className="lb-amt">€{r.amt} gedoneerd</div>
              </div>
              <div className="lb-sticker">{r.sticker ? '🏷️' : <span style={{ opacity: 0.25 }}>—</span>}</div>
              <div className="lb-pts">{r.pts}</div>
            </div>
          )
        })}
      </div>
      <div id="homeLbYouBar" className="lb-you-bar" style={{ display: youBarInner ? '' : 'none' }}>
        {youBarInner}
      </div>
    </>
  )
}
