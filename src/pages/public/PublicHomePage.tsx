import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { FeaturedCausesGrid } from '../../components/public/FeaturedCausesGrid'
import { HomeBlogPreviewBlock } from '../../components/public/HomeBlogPreviewBlock'
import { HomeLiveLeaderboardWidget } from '../../components/public/HomeLiveLeaderboardWidget'
import { HomeNewsSection } from '../../components/public/HomeNewsSection'
import {
  formatHomepageEuroStat,
  getHomepageStatsDisplay,
  useLiveHomepageSettings,
} from '../../features/public/homepageSettings'
import {
  badgeChipClass,
  fetchMyDonationsForBadges,
  fetchPublicHomepageStats,
  formatHeroEuroFull,
  heroProgressPercent,
  topDonorRowStyle,
  type PublicHomepageStats,
  type PublicHomepageTopDonor,
} from '../../features/public/homeHeroService'
import {
  BADGES_ALL,
  checkBadgeEarned,
  dnlAccountsUpdatedEvent,
  readDnlAccounts,
  type LegacyDonation,
} from '../../features/account/legacyDashboardModel'
import { dnlCommunitiesUpdatedEvent, dnlProjectsUpdatedEvent } from '../../features/public/legacyStorage'
import { useLegacyUiSession } from '../../context/LegacyUiSessionContext'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'

export function PublicHomePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { shell } = useLegacyUiSession()
  const [rev, setRev] = useState(0)
  const [liveTick, setLiveTick] = useState(0)
  const [liveStats, setLiveStats] = useState<PublicHomepageStats | null>(null)
  const [badgeDons, setBadgeDons] = useState<LegacyDonation[]>([])
  const heroDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const bumpLive = useCallback(() => {
    if (heroDebounceRef.current) clearTimeout(heroDebounceRef.current)
    heroDebounceRef.current = setTimeout(() => {
      heroDebounceRef.current = null
      setLiveTick((t) => t + 1)
    }, 900)
  }, [])

  useEffect(
    () => () => {
      if (heroDebounceRef.current) clearTimeout(heroDebounceRef.current)
    },
    [],
  )

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (
        e.key === 'dnl_homepage' ||
        e.key === 'dnl_accounts' ||
        e.key === 'dnl_projects' ||
        e.key === 'dnl_communities' ||
        (e.key != null && e.key.startsWith('dnl_inbox'))
      ) {
        setRev((x) => x + 1)
      }
    }
    const bump = () => setRev((x) => x + 1)
    window.addEventListener('storage', onStorage)
    window.addEventListener(dnlAccountsUpdatedEvent, bump)
    window.addEventListener(dnlProjectsUpdatedEvent, bump)
    window.addEventListener(dnlCommunitiesUpdatedEvent, bump)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(dnlAccountsUpdatedEvent, bump)
      window.removeEventListener(dnlProjectsUpdatedEvent, bump)
      window.removeEventListener(dnlCommunitiesUpdatedEvent, bump)
    }
  }, [])

  /** Oude verwijslinks `/?ref=...` doorsturen naar het registratieformulier met ingevulde code. */
  useEffect(() => {
    const raw = searchParams.get('ref')?.trim()
    if (!raw) return
    const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
    if (code.length < 6) return
    const tp = searchParams.get('type') ?? 'particulier'
    navigate(`/auth?ref=${encodeURIComponent(code)}&tab=register&type=${encodeURIComponent(tp)}`, { replace: true })
  }, [navigate, searchParams])

  const hp = useLiveHomepageSettings()
  void rev // legacy storage bump, nog steeds gebruikt voor andere memos
  const useSupabaseHero = isSupabaseConfigured && hp.statsLive !== false

  useEffect(() => {
    if (!useSupabaseHero) {
      setLiveStats(null)
      return
    }
    let cancelled = false
    void (async () => {
      const s = await fetchPublicHomepageStats()
      if (!cancelled && s) setLiveStats(s)
    })()
    return () => {
      cancelled = true
    }
  }, [useSupabaseHero, liveTick])

  useEffect(() => {
    if (!useSupabaseHero) return
    const tick = () => setLiveTick((t) => t + 1)
    const id = window.setInterval(tick, 30_000)
    const onVis = () => {
      if (document.visibilityState === 'visible') tick()
    }
    window.addEventListener('focus', tick)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', tick)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [useSupabaseHero])

  useEffect(() => {
    if (!useSupabaseHero || !supabase) return
    const client = supabase
    const ch = client
      .channel('homepage-hero-refresh')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'donations' },
        () => bumpLive(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => bumpLive(),
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[homeHero] Realtime-kanaal:', status, err?.message ?? '')
        }
      })
    return () => {
      void client.removeChannel(ch)
    }
  }, [useSupabaseHero, bumpLive])

  useEffect(() => {
    if (!useSupabaseHero) {
      setBadgeDons([])
      return
    }
    if (shell?.source !== 'session' || !shell.user) {
      setBadgeDons([])
      return
    }
    let cancelled = false
    void (async () => {
      const rows = await fetchMyDonationsForBadges()
      if (!cancelled) setBadgeDons(rows)
    })()
    return () => {
      cancelled = true
    }
  }, [useSupabaseHero, shell?.source, shell?.user?.id, liveTick])

  const baseStats = useMemo(() => getHomepageStatsDisplay(hp), [hp, rev])
  const stats = useMemo(() => {
    if (!liveStats || !useSupabaseHero) return baseStats
    const donorsLbl = `${liveStats.unique_donors.toLocaleString('nl-NL')}+`
    const goalsLbl =
      liveStats.distinct_causes > 0
        ? `${Math.max(liveStats.distinct_causes, 500).toLocaleString('nl-NL')}+`
        : baseStats.statDoelen
    return {
      ...baseStats,
      statOpgehaald: formatHomepageEuroStat(liveStats.total_raised),
      statDonateurs: donorsLbl,
      statDoelen: goalsLbl,
      trustCount: donorsLbl,
      trustText: baseStats.trustText,
    }
  }, [baseStats, liveStats, useSupabaseHero])

  const topDonorRows: PublicHomepageTopDonor[] = useMemo(() => {
    if (liveStats?.top_donors?.length) return liveStats.top_donors.slice(0, 3)
    return [
      { rank: 1, points: 300, label: hp.card2Name1, initial: (hp.card2Name1 || '?')[0] || '?' },
      { rank: 2, points: 216, label: hp.card2Name2, initial: (hp.card2Name2 || '?')[0] || '?' },
      { rank: 3, points: 180, label: hp.card2Name3, initial: (hp.card2Name3 || '?')[0] || '?' },
    ]
  }, [liveStats, hp.card2Name1, hp.card2Name2, hp.card2Name3])

  const trustInitials = useMemo(() => {
    const from = (liveStats?.top_donors ?? []).map((d) => d.initial).filter(Boolean)
    const pad = ['D', 'O', 'N', 'A', 'T']
    const out = [...from]
    for (const c of pad) {
      if (out.length >= 5) break
      if (!out.includes(c)) out.push(c)
    }
    return out.slice(0, 5)
  }, [liveStats])

  const earnedHeroBadges = useMemo(() => {
    if (shell?.source !== 'session' || !shell.user) return []
    const acc = readDnlAccounts()[shell.email] || {}
    const badgeUser = {
      donations: badgeDons,
      totalDonated: shell.totalDonated,
      sticker: !!acc.sticker,
      monthlyDonations: acc.monthlyDonations || [],
      email: shell.email,
    }
    return BADGES_ALL.filter((b) => checkBadgeEarned(b, badgeUser))
  }, [shell, badgeDons])

  const card1Val = liveStats && useSupabaseHero ? formatHeroEuroFull(liveStats.total_raised) : hp.card1Val
  const card1Sub =
    liveStats && useSupabaseHero && liveStats.distinct_causes > 0
      ? `Verdeeld over ${liveStats.distinct_causes.toLocaleString('nl-NL')} goede doelen`
      : hp.card1Sub
  const progressPct =
    liveStats && useSupabaseHero ? heroProgressPercent(liveStats.total_raised) : 78

  return (
    <main role="main" id="mainContent">
      <div className="page active" id="page-home">
        <div className="hero">
          <div className="hero-bg">
            <div className="blob blob1" />
            <div className="blob blob2" />
            <div className="blob blob3" />
          </div>
          <div className="hero-inner">
            <div className="hero-left">
              <div className="hero-badge" id="heroBadge">
                <span className="hero-badge-dot" />
                <span id="heroBadgeText">{hp.badge}</span>
              </div>
              <h1 id="heroH1">
                {hp.h1}
                <br />
                <em id="heroH1Em">{hp.h1em}</em>
              </h1>
              <p className="hero-desc" id="heroDesc">
                {hp.desc}
              </p>
              <div className="hero-actions" id="heroActions">
                <Link to="/goede-doelen" className="btn btn-dark btn-lg" id="heroCta1">
                  {hp.cta1}
                </Link>
                <Link to="/faq" className="btn btn-outline btn-lg" id="heroCta2">
                  Hoe werkt het?
                </Link>
              </div>
              <div className="hero-trust">
                <div className="hero-trust-avatars">
                  {trustInitials.map((c, i) => (
                    <div key={`${c}-${i}`} className="trust-av">
                      {c}
                    </div>
                  ))}
                </div>
                <p>
                  <strong id="heroTrustCount">{stats.trustCount}</strong> <span id="heroTrustText">{stats.trustText}</span>
                </p>
              </div>
            </div>
            <div className="hero-right">
              <div className="hero-card-stack">
                <div className="hcard hcard1">
                  <div className="hcard-label">Totaal opgehaald</div>
                  <div className="hcard-val">{card1Val}</div>
                  <div className="hcard-sub">{card1Sub}</div>
                  <div className="hcard-progress mt12">
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${progressPct}%` }} />
                    </div>
                  </div>
                </div>
                <div className="hcard hcard2">
                  <div className="hcard-label">Top donateurs</div>
                  {topDonorRows.map((row, idx) => (
                    <div className="hcard-row" key={row.rank}>
                      <div className="hcard-ava" style={{ background: topDonorRowStyle(idx) }}>
                        {row.initial}
                      </div>
                      <div className="hcard-name">{row.label}</div>
                      <div className="hcard-pts">{row.points.toLocaleString('nl-NL')} pts</div>
                    </div>
                  ))}
                </div>
                <div className="hcard hcard3">
                  <div className="hcard-label">Jouw badges</div>
                  {shell?.source === 'session' && shell.user ? (
                    earnedHeroBadges.length > 0 ? (
                      <div className="hcard-badge-row">
                        {earnedHeroBadges.slice(0, 3).map((b, i) => (
                          <span key={b.id} className={`chip ${badgeChipClass(i)}`}>
                            {b.icon} {b.name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="hcard-sub" style={{ marginTop: 10 }}>
                        Nog geen badges —{' '}
                        <Link to="/goede-doelen" style={{ color: 'inherit', fontWeight: 700 }}>
                          doneer mee
                        </Link>
                        .
                      </p>
                    )
                  ) : (
                    <p className="hcard-sub" style={{ marginTop: 10 }}>
                      <Link to="/auth" style={{ color: 'inherit', fontWeight: 700 }}>
                        Log in
                      </Link>{' '}
                      om je badges te ontdekken.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="stats-bar" id="homeStatsBar">
          <div className="container">
            <div className="stats-row">
              <div className="stat-item">
                <div className="stat-num" id="statOpgehaald">
                  {stats.statOpgehaald}
                </div>
                <div className="stat-lbl" id="statOpgehaaldLbl">
                  {stats.statOpgehaaldLbl}
                </div>
              </div>
              <div className="stat-item">
                <div className="stat-num" id="statDonateurs">
                  {stats.statDonateurs}
                </div>
                <div className="stat-lbl" id="statDonateurLbl">
                  Actieve donateurs
                </div>
              </div>
              <div className="stat-item">
                <div className="stat-num" id="statDoelen">
                  {stats.statDoelen}
                </div>
                <div className="stat-lbl" id="statDoelenLbl">
                  ANBI-gecertificeerde doelen
                </div>
              </div>
              <div className="stat-item">
                <div className="stat-num" id="statStickers">
                  {stats.statStickers}
                </div>
                <div className="stat-lbl" id="statStickerLbl">
                  Stickers geplaatst
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="section" id="homeFeaturedCausesSection" style={{ background: '#fff' }}>
          <div className="container">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-end',
                flexWrap: 'wrap',
                gap: 16,
                marginBottom: 48,
              }}
            >
              <div>
                <div className="eyebrow">Uitgelichte goede doelen</div>
                <h2 className="section-title">
                  Kies waar jij
                  <br />
                  het verschil maakt
                </h2>
              </div>
              <Link to="/goede-doelen" className="btn btn-outline">
                Alle doelen bekijken →
              </Link>
            </div>
            <FeaturedCausesGrid />
          </div>
        </div>

        <div className="section" id="homeGamificationSection">
          <div className="container">
            <div className="game-split">
              <div className="features-col">
                <div>
                  <div className="eyebrow">Punten, ranglijst & betrokkenheid</div>
                  <h2 className="section-title">
                    Geven was
                    <br />
                    nooit zo leuk
                  </h2>
                  <p className="section-sub">
                    Verdien punten, klim op de ranglijst en win badges. Maak doneren competitief — voor jezelf én je bedrijf.
                  </p>
                </div>
                <div className="feat-item">
                  <div className="feat-icon b">⭐</div>
                  <div>
                    <h4>Puntensysteem</h4>
                    <p>
                      Per €1 doneer je 0,5 punt. Terugkerende donaties ×1.2, campagnebonussen tot ×1.5. Streakbonus na 3 maanden.
                    </p>
                  </div>
                </div>
                <div className="feat-item">
                  <div className="feat-icon p">🏆</div>
                  <div>
                    <h4>Badges & Levels</h4>
                    <p>&quot;Top Donateur van de Maand&quot;, &quot;Sticker Ambassadeur&quot;, &quot;CSR Champion&quot; en veel meer.</p>
                  </div>
                </div>
                <div className="feat-item">
                  <div className="feat-icon g">🎯</div>
                  <div>
                    <h4>Seizoens challenges</h4>
                    <p>Tijdgebonden acties zoals &quot;Dierenweek&quot; of &quot;Kerstcampagne&quot; met bonus multipliers.</p>
                  </div>
                </div>
                <div className="feat-item">
                  <div className="feat-icon y">🏢</div>
                  <div>
                    <h4>Bedrijfscompetitie</h4>
                    <p>Bedrijven strijden op hun eigen ranglijst. Afdelingen en vestigingen tegen elkaar.</p>
                  </div>
                </div>
                <Link to="/ranglijst" className="btn btn-dark mt8">
                  Bekijk ranglijst →
                </Link>
              </div>
              <div id="homeLeaderboardWrap">
                <div className="leaderboard-widget">
                  <HomeLiveLeaderboardWidget />
                </div>
              </div>
            </div>
          </div>
        </div>

        <HomeNewsSection />

        <div
          id="homeFeaturedProject"
          style={{ display: 'none', background: 'linear-gradient(135deg,#1e1b4b,#4c1d95)', padding: '48px 0' }}
        >
          <div className="container">
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div
                style={{
                  display: 'inline-block',
                  background: 'rgba(255,255,255,.12)',
                  borderRadius: 20,
                  padding: '4px 14px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: 'rgba(255,255,255,.8)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  marginBottom: 10,
                }}
              >
                🏆 Best lopend project
              </div>
              <h2
                style={{
                  fontFamily: 'Fraunces,serif',
                  fontSize: 'clamp(1.4rem, 2.5vw, 2rem)',
                  fontWeight: 900,
                  color: '#fff',
                  margin: 0,
                }}
              >
                Meest ondersteund door de community
              </h2>
            </div>
            <div
              id="homeFeaturedCard"
              style={{
                maxWidth: 640,
                margin: '0 auto',
                background: '#fff',
                borderRadius: 20,
                overflow: 'hidden',
                boxShadow: '0 8px 40px rgba(0,0,0,.3)',
              }}
            />
          </div>
        </div>

        <HomeBlogPreviewBlock />

        <div className="section" id="homeFinalCtaSection" style={{ background: 'var(--off)', textAlign: 'center' }}>
          <div className="container-sm">
            <div className="eyebrow">Klaar om te beginnen?</div>
            <h2 className="section-title">
              Maak vandaag
              <br />
              het verschil
            </h2>
            <p className="section-sub" style={{ margin: '14px auto 36px' }}>
              Doe mee met duizenden donateurs. Transparant, leuk en community-gedreven geven — voor een betere wereld.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link to="/auth" className="btn btn-dark btn-lg">
                Account aanmaken
              </Link>
              <Link to="/goede-doelen" className="btn btn-outline btn-lg">
                Goede doelen bekijken
              </Link>
            </div>
          </div>
        </div>

        <section id="homeStickerSection" aria-label="Sticker programma" className="section-sm" style={{ background: '#fff' }}>
          <div className="container">
            <div className="sticker-promo">
              <div>
                <div className="eyebrow" style={{ color: 'rgba(255,255,255,.7)' }}>
                  Sticker programma
                </div>
                <h2>
                  Zichtbaar geven,
                  <br />
                  offline én online
                </h2>
                <p>Bestel een &quot;Ik doneer via Donatie.eu&quot; sticker. Collectantes aan de deur weten meteen: hier wordt al digitaal gegeven.</p>
                <ul>
                  <li>+50 punten bij aanschaf (zakelijk: +100)</li>
                  <li>Collectantes weten dat jij al geeft</li>
                  <li>Zichtbare deelname aan bedrijfsranglijst</li>
                  <li>Deel op sociale media voor viraliteit</li>
                </ul>
                <button
                  type="button"
                  className="btn btn-full"
                  style={{ background: '#fff', color: 'var(--blue-dark)', marginTop: 28, fontWeight: 700 }}
                  onClick={() => navigate('/sticker-bestellen')}
                >
                  Bestel jouw sticker →
                </button>
              </div>
              <div className="sticker-visual">
                <div style={{ display: 'inline-block', width: 160, height: 160, filter: 'drop-shadow(0 6px 22px rgba(0,0,0,.32))' }}>
                  <div
                    style={{
                      clipPath:
                        "path('M80,28 C80,14 58,0 36,0 C10,0 0,22 0,42 C0,62 12,78 28,92 L80,150 L132,92 C148,78 160,62 160,42 C160,22 150,0 124,0 C102,0 80,14 80,28 Z')",
                      width: 160,
                      height: 160,
                      background: '#3a98f8',
                      position: 'relative',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'flex-start',
                      paddingTop: 36,
                      boxSizing: 'border-box',
                    }}
                  >
                    <div
                      style={{
                        fontFamily: 'Fraunces,serif',
                        fontSize: '1.4rem',
                        fontWeight: 900,
                        color: '#e81c1c',
                        lineHeight: 1,
                        letterSpacing: '0.02em',
                        position: 'relative',
                        zIndex: 3,
                        textShadow: '0 1px 4px rgba(0,0,0,.18)',
                      }}
                    >
                      NEE
                    </div>
                    <div style={{ position: 'relative', marginTop: 6, zIndex: 1 }}>
                      <img
                        src="/donatie-logo.svg"
                        alt="Donatie.eu - donatie platform voor goede doelen"
                        style={{
                          width: 64,
                          height: 64,
                          objectFit: 'cover',
                          borderRadius: '50%',
                          display: 'block',
                        }}
                      />
                      <div
                        style={{
                          fontFamily: 'Fraunces,serif',
                          fontSize: '0.66rem',
                          fontWeight: 900,
                          color: '#fff',
                          textAlign: 'center',
                          letterSpacing: '0.04em',
                          textTransform: 'uppercase',
                          position: 'absolute',
                          top: 10,
                          left: '50%',
                          transform: 'translateX(-50%)',
                          whiteSpace: 'nowrap',
                          zIndex: 2,
                          textShadow: '0 1px 3px rgba(0,0,0,.5)',
                        }}
                      >
                        ik doneer via:
                      </div>
                    </div>
                  </div>
                </div>
                <div className="sticker-pts" style={{ marginTop: 14 }}>
                  ⭐ +50 punten
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
