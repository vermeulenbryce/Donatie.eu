import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PublicPageHeader } from '../../components/public/PublicPageHeader'
import { useLegacyUiSession } from '../../context/LegacyUiSessionContext'
import { dnlAccountsUpdatedEvent } from '../../features/account/legacyDashboardModel'
import type { RankTabId } from '../../features/public/demoPublicData'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'
import { fetchPublicLeaderboard, fetchPublicProjectsForRanklist } from '../../features/public/liveLeaderboardService'
import {
  dnlCommunitiesUpdatedEvent,
  dnlProjectsUpdatedEvent,
} from '../../features/public/legacyStorage'
import {
  buildRanglijstBedrijven,
  buildRanglijstGoedeDoelen,
  buildRanglijstIndividuen,
  buildRanglijstInfluencers,
  buildRanglijstProjectenLocal,
  mapDbProjectsToRankRows,
  mapLiveRowsToRanglijstStd,
  mergeProjectRankRows,
  type RanglijstGoedDoelRow,
  type RanglijstProjectRow,
  type RanglijstStdRow,
} from '../../features/public/ranglijstLeaderboards'

/** Zelfde stroke-stijl als Bedrijven / Goede doelen (16px tabs) */
function RlTabIconUser() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}
function RlTabIconBuilding() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  )
}
function RlTabIconRocket() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
      <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </svg>
  )
}
function RlTabIconStar() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}
function RlTabIconTrophy() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  )
}
function RlTabIconHeart() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  )
}

const TABS: { id: RankTabId; label: ReactNode }[] = [
  {
    id: 'individuen',
    label: (
      <>
        <RlTabIconUser /> Individuen
      </>
    ),
  },
  {
    id: 'bedrijven',
    label: (
      <>
        <RlTabIconBuilding /> Bedrijven
      </>
    ),
  },
  {
    id: 'projecten',
    label: (
      <>
        <RlTabIconRocket /> Projecten
      </>
    ),
  },
  {
    id: 'influencers',
    label: (
      <>
        <RlTabIconStar /> Influencers
      </>
    ),
  },
  {
    id: 'puntensysteem',
    label: (
      <>
        <RlTabIconTrophy /> Puntensysteem
      </>
    ),
  },
  {
    id: 'goededoelen',
    label: (
      <>
        <RlTabIconHeart /> Goede doelen
      </>
    ),
  },
]

function formatEuro(n: number) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

function formatPts(n: number) {
  return new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 0 }).format(n)
}

function diffClassName(c: RanglijstStdRow['extraClass']) {
  if (c === 'up') return 'rank-diff up'
  if (c === 'down') return 'rank-diff down'
  return 'rank-diff same'
}

function StdRows({ rows }: { rows: RanglijstStdRow[] }) {
  if (!rows.length) {
    return (
      <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--mid)', fontSize: '0.92rem' }}>
        Nog geen deelnemers — wees de eerste die doneert.
      </div>
    )
  }
  return (
    <>
      {rows.map((r) => (
        <div key={`${r.rank}-${r.name}`} className={`rank-row rl-row${r.isYou ? ' you' : ''}`}>
          <div className="rl-cell-rank">
            <span className={`rank-num ${r.rankNumClass}`}>
              {r.medal ? <span className="rank-medal">{r.medal}</span> : null}
              {r.rank}
            </span>
          </div>
          <div className="rl-cell-user">
            <div className="rl-row-icon-tile">
              <div className="rank-ava" style={{ background: r.avaColor }}>
                {r.ava}
              </div>
            </div>
            <div className="rl-user-info">
              <div className="rank-uname">
                <span style={r.isAnon && !r.isYou ? { fontStyle: 'italic', color: '#64748b' } : undefined}>
                  {r.isAnon && !r.isYou ? 'Anoniem' : r.name}
                </span>
                {r.isYou ? (
                  <span style={{ fontSize: '0.7rem', marginLeft: 6, fontWeight: 800, color: 'var(--blue)' }}>(jij)</span>
                ) : null}
                {r.isYou && r.isAnon ? (
                  <span
                    style={{
                      display: 'inline-block',
                      marginLeft: 8,
                      fontSize: '0.65rem',
                      fontWeight: 800,
                      color: '#1e40af',
                      background: '#dbeafe',
                      borderRadius: 6,
                      padding: '2px 8px',
                      verticalAlign: 'middle',
                    }}
                    title="Voor andere bezoekers sta je als Anoniem op de lijst"
                  >
                    🕵️ Naam verborgen voor anderen
                  </span>
                ) : null}
              </div>
              {r.sub ? <div className="rank-usub">{r.sub}</div> : null}
              <div className="rl-badges">
                {r.sticker ? (
                  <span className="rank-sticker" title="Sticker">
                    🏷️
                  </span>
                ) : null}
                {r.elite ? (
                  <span title="Elite / Legende">⭐</span>
                ) : null}
                {r.isAnon && !r.isYou ? (
                  <span className="rank-sticker" title="Kiest ervoor anoniem op de ranglijst te staan">
                    🕵️
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <div className="rl-cell-amt">{formatEuro(r.amt)}</div>
          <div className="rl-cell-pts">
            <span>{formatPts(r.pts)}</span>
            <span className="rl-pts-label"> punten</span>
          </div>
          <div className={`rl-cell-extra ${diffClassName(r.extraClass)}`}>{r.extra}</div>
        </div>
      ))}
    </>
  )
}

function ProjectRows({ rows }: { rows: RanglijstProjectRow[] }) {
  if (!rows.length) {
    return (
      <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--mid)', fontSize: '0.92rem' }}>
        Nog geen projecten — start er een via{' '}
        <Link to="/start-project">Start project</Link>.
      </div>
    )
  }
  return (
    <>
      {rows.map((r) => (
        <div key={r.id} className={`rank-row proj-row${r.isYou ? ' you' : ''}`}>
          <div className="rl-cell-rank">
            <span className={`rank-num ${r.rankNumClass}`}>
              {r.medal ? <span className="rank-medal">{r.medal}</span> : null}
              {r.rank}
            </span>
          </div>
          <div className="rl-cell-user" style={{ minWidth: 0 }}>
            <div className="rl-row-icon-tile" aria-hidden>
              <RlTabIconRocket />
            </div>
            <div className="rl-user-info">
              <div className="rank-uname">{r.title}</div>
            </div>
          </div>
          <div className="rl-cell-amt">{formatEuro(r.raised)}</div>
          <div className="rl-cell-pts">{formatEuro(r.goal)}</div>
          <div className="rl-cell-extra">{r.donors}</div>
        </div>
      ))}
    </>
  )
}

function GoedeDoelenRows({ rows }: { rows: RanglijstGoedDoelRow[] }) {
  const navigate = useNavigate()
  return (
    <>
      {rows.map((r) => {
        const c = r.cause
        const meta = r.sectorVisual
        const rankEmoji = r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : ''
        const donateHref = `/goede-doelen?donate=1&causeId=${c.id}`
        const detailHref = `/goede-doelen?causeId=${c.id}`
        return (
          <div
            key={`${r.rank}-${c.id}`}
            role="button"
            tabIndex={0}
            className="rank-row gd-row"
            onClick={() => navigate(detailHref)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                navigate(detailHref)
              }
            }}
            style={{
              display: 'grid',
              gridTemplateColumns: '28px 44px minmax(0, 1fr) 80px',
              gap: 6,
              padding: '10px 10px',
              borderBottom: '1px solid #f1f5f9',
              alignItems: 'center',
              boxSizing: 'border-box',
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: rankEmoji ? '1.2rem' : '1rem',
                fontWeight: 900,
                color: '#1a237e',
              }}
            >
              {rankEmoji || r.rank}
            </div>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                flexShrink: 0,
                background: `linear-gradient(135deg,${meta.color || '#3a98f8'},${meta.color2 || '#1a237e'})`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.1rem',
                boxShadow: '0 2px 8px rgba(0,0,0,.08)',
              }}
              aria-hidden
            >
              {meta.emoji || '💚'}
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: '.82rem',
                  color: '#1a237e',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {c.naam}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 2,
                    background: '#d1fae5',
                    color: '#065f46',
                    borderRadius: 20,
                    padding: '1px 6px',
                    fontSize: '.63rem',
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  ✅ CBF
                </span>
                {r.donCount > 0 ? (
                  <span style={{ fontSize: '.65rem', color: '#9ca3af' }}>{r.donCount} donaties</span>
                ) : null}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
              <Link
                to={donateHref}
                onClick={(e) => e.stopPropagation()}
                style={{
                  background: 'linear-gradient(135deg,#43A3FA,#1a7fd4)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 16,
                  padding: '6px 10px',
                  fontSize: '.75rem',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  boxShadow: '0 2px 8px rgba(67,163,250,.3)',
                  textDecoration: 'none',
                }}
              >
                Doneer →
              </Link>
            </div>
          </div>
        )
      })}
    </>
  )
}

/** Zelfde inhoud als `renderPuntensysteem()` in legacy index.html (ranglijst-tab). */
function PuntensysteemBlok() {
  const earnRows: [string, string, string][] = [
    ['🎯', 'Per €1 donatie', '0,5 punt'],
    ['🔄', 'Terugkerende donatie', '×1.2 multiplier'],
    ['📣', 'Campagnestickerbonus', 'tot ×1.5'],
    ['🏷️', 'Sticker persoonlijk', '+50 punten'],
    ['🏷️', 'Sticker zakelijk', '+100 punten'],
    ['🔥', '3 maanden streak', '+5 bonus'],
  ]
  const levelRows: [string, string, string, string][] = [
    ['🌱', 'Starter', '0–99 pts', '#86efac'],
    ['⭐', 'Donateur', '100–499 pts', '#fde68a'],
    ['💎', 'Kampioen', '500–1499 pts', '#93c5fd'],
    ['🏆', 'Elite', '1500–2999 pts', '#c4b5fd'],
    ['👑', 'Legende', '3000+ pts', '#fca5a5'],
  ]
  return (
    <div style={{ padding: 16 }}>
      <h3 style={{ fontFamily: 'Fraunces, serif', marginBottom: 14, fontSize: '1rem', marginTop: 0 }}>⭐ Hoe verdien je punten?</h3>
      <div style={{ display: 'grid', gap: 8, marginBottom: 20 }}>
        {earnRows.map(([ico, lbl, val]) => (
          <div
            key={lbl}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#f8fafc',
              borderRadius: 10,
              padding: '11px 14px',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '1.1rem' }}>{ico}</span>
              <span style={{ fontSize: '.85rem', fontWeight: 600 }}>{lbl}</span>
            </span>
            <span
              style={{
                fontFamily: 'Fraunces, serif',
                fontWeight: 800,
                color: '#1a237e',
                textAlign: 'right',
                minWidth: 90,
                flexShrink: 0,
              }}
            >
              {val}
            </span>
          </div>
        ))}
      </div>
      <h3 style={{ fontFamily: 'Fraunces, serif', marginBottom: 12, fontSize: '1rem', marginTop: 0 }}>🏆 Levels</h3>
      <div style={{ display: 'grid', gap: 7 }}>
        {levelRows.map(([ico, name, range, col]) => (
          <div
            key={name}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              background: `${col}40`,
              borderLeft: `4px solid ${col}`,
              borderRadius: 8,
              padding: '10px 14px',
            }}
          >
            <span style={{ fontSize: '1.3rem' }}>{ico}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: '.88rem' }}>{name}</div>
              <div style={{ fontSize: '.75rem', color: '#6b7280' }}>{range}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

type LiveStdState = {
  individuen: RanglijstStdRow[] | null
  bedrijven: RanglijstStdRow[] | null
  influencers: RanglijstStdRow[] | null
}

export function RanglijstPage() {
  const { shell } = useLegacyUiSession()
  const [tab, setTab] = useState<RankTabId>('individuen')
  const [rev, setRev] = useState(0)
  const [liveStd, setLiveStd] = useState<LiveStdState>({
    individuen: null,
    bedrijven: null,
    influencers: null,
  })
  const [liveDbProjects, setLiveDbProjects] = useState<RanglijstProjectRow[] | null>(null)

  useEffect(() => {
    setTab('individuen')
  }, [])

  useEffect(() => {
    const bump = () => setRev((n) => n + 1)
    window.addEventListener('storage', bump)
    window.addEventListener('focus', bump)
    window.addEventListener(dnlAccountsUpdatedEvent, bump)
    window.addEventListener(dnlProjectsUpdatedEvent, bump)
    window.addEventListener(dnlCommunitiesUpdatedEvent, bump)
    return () => {
      window.removeEventListener('storage', bump)
      window.removeEventListener('focus', bump)
      window.removeEventListener(dnlAccountsUpdatedEvent, bump)
      window.removeEventListener(dnlProjectsUpdatedEvent, bump)
      window.removeEventListener(dnlCommunitiesUpdatedEvent, bump)
    }
  }, [])

  const loadLiveStd = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) return
    try {
      const [a, b, c] = await Promise.all([
        fetchPublicLeaderboard('individuen', 250),
        fetchPublicLeaderboard('bedrijven', 250),
        fetchPublicLeaderboard('influencers', 250),
      ])
      setLiveStd({
        individuen: mapLiveRowsToRanglijstStd(a),
        bedrijven: mapLiveRowsToRanglijstStd(b),
        influencers: mapLiveRowsToRanglijstStd(c),
      })
    } catch (e) {
      console.warn('[ranglijst] get_public_leaderboard', e)
      setLiveStd({ individuen: [], bedrijven: [], influencers: [] })
    }
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured) return
    void loadLiveStd()
    const id = window.setInterval(() => void loadLiveStd(), 30_000)
    const onVis = () => {
      if (document.visibilityState === 'visible') void loadLiveStd()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [loadLiveStd])

  useEffect(() => {
    if (!isSupabaseConfigured) return
    const t = window.setTimeout(() => void loadLiveStd(), 400)
    return () => window.clearTimeout(t)
  }, [shell?.points, shell?.totalDonated, shell?.communityPoints, loadLiveStd])

  const loadLiveProjects = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setLiveDbProjects(null)
      return
    }
    const raw = await fetchPublicProjectsForRanklist(150)
    const mapped = mapDbProjectsToRankRows(raw, shell?.email ?? null)
    setLiveDbProjects(mergeProjectRankRows(mapped, []))
  }, [shell?.email])

  useEffect(() => {
    void loadLiveProjects()
  }, [loadLiveProjects, rev])

  useEffect(() => {
    if (!isSupabaseConfigured) return
    const id = window.setInterval(() => void loadLiveProjects(), 30_000)
    return () => window.clearInterval(id)
  }, [loadLiveProjects])

  const email = shell?.email ?? null

  const individuen = useMemo(() => {
    if (isSupabaseConfigured) return liveStd.individuen ?? []
    void rev
    return buildRanglijstIndividuen(email)
  }, [email, rev, liveStd.individuen, shell?.points, shell?.totalDonated, isSupabaseConfigured])

  const bedrijven = useMemo(() => {
    if (isSupabaseConfigured) return liveStd.bedrijven ?? []
    void rev
    return buildRanglijstBedrijven(email)
  }, [email, rev, liveStd.bedrijven, shell?.points, shell?.totalDonated, isSupabaseConfigured])

  const influencers = useMemo(() => {
    if (isSupabaseConfigured) return liveStd.influencers ?? []
    void rev
    return buildRanglijstInfluencers(email)
  }, [email, rev, liveStd.influencers, shell?.points, shell?.totalDonated, isSupabaseConfigured])

  const projecten = useMemo(() => {
    void rev
    if (!isSupabaseConfigured) return buildRanglijstProjectenLocal(email)
    if (liveDbProjects === null) return []
    return liveDbProjects
  }, [email, rev, liveDbProjects])

  const goedeDoelen = useMemo(() => {
    void rev
    return buildRanglijstGoedeDoelen()
  }, [rev])

  const meIndividu = useMemo(() => individuen.find((r) => r.isYou) ?? null, [individuen])

  const tableClass = `rank-table tab-${tab}${tab === 'puntensysteem' ? ' ps-table' : ''}`

  const theadHidden = tab === 'goededoelen' || tab === 'puntensysteem'

  const userPosInner = useMemo(() => {
    if (!shell) {
      return (
        <>
          <div>
            <div style={{ fontSize: '0.78rem', color: 'var(--blue)', fontWeight: 700, marginBottom: 4 }}>JOUW POSITIE</div>
            <div style={{ fontSize: '0.97rem', fontWeight: 600 }}>Log in om je ranglijstpositie te zien</div>
          </div>
          <Link to="/auth" className="btn btn-blue btn-sm">
            Inloggen →
          </Link>
        </>
      )
    }
    if (!meIndividu) {
      return (
        <>
          <div>
            <div style={{ fontSize: '0.78rem', color: 'var(--blue)', fontWeight: 700, marginBottom: 4 }}>JOUW POSITIE</div>
            <div style={{ fontSize: '0.97rem', fontWeight: 600 }}>
              Je profiel staat (nog) niet op de individuenlijst. Doneer om punten te sparen en zichtbaar te worden.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link to="/account" className="btn btn-outline btn-sm">
              Account
            </Link>
            <Link to="/goede-doelen?donate=1" className="btn btn-green btn-sm">
              Doneer nu →
            </Link>
          </div>
        </>
      )
    }
    return (
      <>
        <div>
          <div style={{ fontSize: '0.78rem', color: 'var(--blue)', fontWeight: 700, marginBottom: 4 }}>JOUW POSITIE</div>
          <div style={{ fontSize: '0.97rem', fontWeight: 600 }}>
            #{meIndividu.rank} op de individuenlijst · {formatPts(meIndividu.pts)} punten · {formatEuro(meIndividu.amt)} gedoneerd
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to="/account" className="btn btn-outline btn-sm">
            Dashboard
          </Link>
          <Link to="/goede-doelen?donate=1" className="btn btn-green btn-sm">
            Door doneren omhoog →
          </Link>
        </div>
      </>
    )
  }, [shell, meIndividu])

  return (
    <main role="main" id="mainContent">
      <div id="page-ranglijst">
        <PublicPageHeader
          eyebrow="Community"
          titleAsFragment
          title={
            <div className="rl-header-wrap" style={{ width: '100%' }}>
              <div className="rl-title-row" style={{ width: '100%' }}>
                <h1 style={{ margin: 0 }}>Ranglijst</h1>
                <div className="rl-periode-label">
                  Periode: <strong>Juni 2025</strong>
                </div>
              </div>
            </div>
          }
          subtitle={
            liveStd.individuen !== null
              ? 'Live vanuit de database: plek op actieve spaarpunten; het eurototaal komt uit je profiel (betaalde donaties). Punten kunnen eerst “in behandeling” zijn (72 uur / 60 dagen).'
              : 'Wie doneerde het meest deze maand? Klim op de lijst en win badges.'
          }
        />

        <div className="container section-sm">
          <div className="rank-tabs-scroll-wrap">
            <div className="rank-tabs" role="tablist" aria-label="Ranglijst-categorie">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  className={`rank-tab${tab === t.id ? ' active' : ''}`}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className={tableClass}>
            <div className={`rank-thead${theadHidden ? ' rl-thead-hidden' : ''}`}>
              {tab === 'projecten' ? (
                <>
                  <div>#</div>
                  <div>Project</div>
                  <div>
                    <span className="col-label-full">Opgehaald</span>
                    <span className="col-label-short">€</span>
                  </div>
                  <div>
                    <span className="col-label-full">Doel</span>
                    <span className="col-label-short">Doel</span>
                  </div>
                  <div>Donateurs</div>
                </>
              ) : (
                <>
                  <div>#</div>
                  <div>Donateur</div>
                  <div>
                    <span className="col-label-full">Donaties (€)</span>
                    <span className="col-label-short">€</span>
                  </div>
                  <div>
                    <span className="col-label-full">Donatie punten</span>
                    <span className="col-label-short">Punten</span>
                  </div>
                  <div>Verschil</div>
                </>
              )}
            </div>

            <div id="rankBody">
              {tab === 'individuen' ? <StdRows rows={individuen} /> : null}
              {tab === 'bedrijven' ? <StdRows rows={bedrijven} /> : null}
              {tab === 'influencers' ? <StdRows rows={influencers} /> : null}
              {tab === 'projecten' ? <ProjectRows rows={projecten} /> : null}
              {tab === 'goededoelen' ? <GoedeDoelenRows rows={goedeDoelen} /> : null}
              {tab === 'puntensysteem' ? <PuntensysteemBlok /> : null}
            </div>
          </div>

          <div
            style={{
              marginTop: 16,
              background: '#f8fafc',
              border: '1.5px solid #e5e7eb',
              borderRadius: 14,
              padding: '16px 22px',
            }}
          >
            <div
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                color: '#6b7280',
                letterSpacing: '0.07em',
                textTransform: 'uppercase',
                marginBottom: 12,
              }}
            >
              Legenda
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px 28px' }}>
              {[
                ['🥇', 'Koploper (#1 positie)'],
                ['🥈', 'Tweede positie'],
                ['🥉', 'Derde positie'],
                ['⭐', 'Elite of Legende status (1500+ punten)'],
                ['🏷️', 'Heeft een Donatie.eu sticker op de deur'],
              ].map(([icon, text]) => (
                <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '0.82rem', color: '#374151' }}>
                  <span style={{ fontSize: '1.1rem' }}>{icon}</span>
                  <span>{text}</span>
                </div>
              ))}
            </div>
          </div>

          <div
            id="rankUserPosBox"
            style={{
              marginTop: 32,
              background: 'var(--blue-light)',
              border: '1.5px solid rgba(67,163,250,.2)',
              borderRadius: 'var(--r)',
              padding: '20px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            {userPosInner}
          </div>
        </div>
      </div>
    </main>
  )
}
