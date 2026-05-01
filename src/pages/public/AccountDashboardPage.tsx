import { useCallback, useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { CBF_CAUSES } from '../../features/legacy/cbfCauses.generated'
import { FeaturedCausesGrid } from '../../components/public/FeaturedCausesGrid'
import { useLegacyUiSession, type LegacyShellUser } from '../../context/LegacyUiSessionContext'
import { dnlStickerOrdersUpdatedEvent } from './StickerPage'
import {
  BADGES_ALL,
  buildDashboardSnapshot,
  REFERRAL_REWARD_INVITE_CAP,
  checkBadgeEarned,
  computeLevel,
  dnlAccountsUpdatedEvent,
  deleteDnlAccountProfile,
  downloadDonationsPdf,
  readDnlAccounts,
  upsertDnlAccountProfile,
  type DashboardSnapshot,
} from '../../features/account/legacyDashboardModel'
import { buildHomeLiveLeaderboard, type LiveLbRow } from '../../features/public/homeLiveLeaderboard'
import { mapPublicLeaderboardToLiveLbRows } from '../../features/public/liveLeaderboardUi'
import { fetchPublicLeaderboard } from '../../features/public/liveLeaderboardService'
import {
  dnlCommunitiesUpdatedEvent,
  dnlProjectsUpdatedEvent,
  readLegacyProjects,
  writeLegacyProjects,
} from '../../features/public/legacyStorage'
import { DashMijnCommunitySection } from './DashMijnCommunitySection'
import { CommunityShopViewPanel } from './CommunityPanels'
import {
  fetchMyMembershipCommunities,
  fetchMyPendingCommunityPoints,
  updateMyProfileAddress,
  updateMyProfileDisplay,
  type CommunityMembershipRow,
} from '../../features/community/communityProjectsService'
import { fetchMyPendingPoints } from '../../features/shop/siteShopService'
import { fetchProjectsByOwner } from '../../features/projects/projectsService'
import { fetchMyAdminShadowGrant, setMyAdminShadowGrant } from '../../features/admin/adminContentService'
import { fetchMyReferralInviteStats, type MyReferralInviteStats } from '../../features/referral/referralSignup'
import { SiteShopAdminPanel, SiteShopPanel, usePendingPoints } from './SiteShopPanels'
import { fileToResizedDataUrl, updateMyAvatar } from '../../features/profile/profileImageService'
import { assertUserImagePassesAzureModeration } from '../../features/safety/azureImageModeration'
import { useMyCauseQuiz } from '../../features/causeQuiz/causeQuizService'
import {
  fetchUserSiteNotifications,
  markUserNotificationReadServer,
  readLocalUserNotifReadIds,
  SITE_INBOX_NOTIFICATION_TYPES,
  type UserSiteNotificationRow,
  writeLocalUserNotifReadIds,
} from '../../features/public/userSiteNotifications'
import { isSupabaseConfigured } from '../../lib/supabase'
import { FondsenwerverMeldModal } from '../../components/public/FondsenwerverMeldModal'
import { SiteNotificationDetailModal } from '../../components/public/SiteNotificationDetailModal'
import type { Project as DbProject } from '../../types/domain'

const INTEREST_LABELS = ['🐾 Dieren', '💊 Gezondheid', '🌱 Milieu', '👶 Kinderen', '🤝 Humanitair', '📍 Lokaal', '📚 Onderwijs']

type DashSection =
  | 'overzicht'
  | 'inbox'
  | 'donaties'
  | 'badges'
  | 'ranglijst'
  | 'puntenwinkel'
  | 'mijn-community'
  | 'mijn-projecten'
  | 'goeddoel'
  | 'profiel'

const DASH_SECTION_DOM_IDS: Record<DashSection, string> = {
  overzicht: 'dash-overzicht',
  inbox: 'dash-inbox',
  donaties: 'dash-donaties',
  badges: 'dash-badges',
  ranglijst: 'dash-ranglijst',
  puntenwinkel: 'dash-puntenwinkel',
  'mijn-community': 'dash-mijn-community',
  'mijn-projecten': 'dash-mijn-projecten',
  goeddoel: 'dash-goeddoel',
  profiel: 'dash-profiel',
}

function parseCssPx(raw: string, fallback: number): number {
  const n = parseFloat(String(raw).trim())
  return Number.isFinite(n) ? n : fallback
}

/**
 * Onderkant vaste site-nav + (alleen ≤1024px) onderkant gestapelde dashboard-sidebar.
 * Gebruikt viewport-metingen — géén `offsetHeight` van de sidebar (dat trok de scroll naar boven).
 */
function getViewportTopInsetForAccountChrome(): number {
  if (typeof document === 'undefined') return 72
  const pad = 12
  const mainNav = document.getElementById('mainNav')
  const navBottom = mainNav
    ? mainNav.getBoundingClientRect().bottom
    : parseCssPx(getComputedStyle(document.documentElement).getPropertyValue('--nav-h'), 64)
  let inset = navBottom + pad
  if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1024px)').matches) {
    const sidebar = document.querySelector<HTMLElement>('#page-dashboard.account-dashboard-v2 .sidebar')
    if (sidebar) {
      inset = Math.max(inset, sidebar.getBoundingClientRect().bottom + pad)
    }
  }
  return inset
}

function scrollWindowToElementTopBelowChrome(el: HTMLElement): void {
  const inset = getViewportTopInsetForAccountChrome()
  const y = el.getBoundingClientRect().top + window.scrollY - inset
  window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' })
}

function scrollToDashSection(s: DashSection): void {
  const id = DASH_SECTION_DOM_IDS[s]
  const el = document.getElementById(id)
  if (!(el instanceof HTMLElement)) return
  scrollWindowToElementTopBelowChrome(el)
}

function scrollToDashSectionAfterPaint(s: DashSection): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => scrollToDashSection(s))
  })
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  }
}

export function AccountDashboardPage() {
  const { shell, logout, updateShellProfile, refreshSession } = useLegacyUiSession()
  const sessionUid = shell?.source === 'session' && shell.user?.id ? (shell.user.id as string) : null
  const { row: myCauseQuiz, completed: causeQuizDone, loading: causeQuizLoading } = useMyCauseQuiz(sessionUid)
  const navigate = useNavigate()
  const location = useLocation()
  const [active, setActive] = useState<DashSection>('overzicht')
  const [meldModalOpen, setMeldModalOpen] = useState(false)
  const [storageTick, setStorageTick] = useState(0)
  const [pendingPts, setPendingPts] = useState({ platform: 0, community: 0 })

  const selectDashSection = useCallback((s: DashSection) => {
    setActive(s)
    scrollToDashSectionAfterPaint(s)
  }, [])

  // Laat een externe link (zoals de header-knop 'Communities') een tab activeren via ?tab= of #hash
  useEffect(() => {
    const allowed: DashSection[] = [
      'overzicht',
      'inbox',
      'donaties',
      'badges',
      'ranglijst',
      'puntenwinkel',
      'mijn-community',
      'mijn-projecten',
      'goeddoel',
      'profiel',
    ]
    const params = new URLSearchParams(location.search)
    const fromQuery = params.get('tab')
    const fromHash = location.hash.replace(/^#/, '').trim()
    const targetRaw = (fromQuery || fromHash) as DashSection | ''
    const target =
      targetRaw === ('project-beheer' as DashSection) ? ('mijn-projecten' as const) : targetRaw
    if (target && allowed.includes(target as DashSection)) {
      const t = target as DashSection
      setActive(t)
      scrollToDashSectionAfterPaint(t)
    }
  }, [location.search, location.hash])

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'dnl_accounts' || e.key === 'dnl_referrals') setStorageTick((n) => n + 1)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => {
    const bump = () => setStorageTick((n) => n + 1)
    window.addEventListener(dnlAccountsUpdatedEvent, bump)
    window.addEventListener(dnlProjectsUpdatedEvent, bump)
    window.addEventListener(dnlCommunitiesUpdatedEvent, bump)
    return () => {
      window.removeEventListener(dnlAccountsUpdatedEvent, bump)
      window.removeEventListener(dnlProjectsUpdatedEvent, bump)
      window.removeEventListener(dnlCommunitiesUpdatedEvent, bump)
    }
  }, [])

  useEffect(() => {
    if (!shell || !isSupabaseConfigured) {
      setPendingPts({ platform: 0, community: 0 })
      return
    }
    let cancelled = false
    void (async () => {
      const [platform, community] = await Promise.all([fetchMyPendingPoints(), fetchMyPendingCommunityPoints()])
      if (!cancelled) setPendingPts({ platform, community })
    })()
    return () => {
      cancelled = true
    }
  }, [shell?.email, shell?.points, shell?.communityPoints, storageTick])

  const [referralDb, setReferralDb] = useState<MyReferralInviteStats | null>(null)
  useEffect(() => {
    if (!sessionUid || !isSupabaseConfigured) {
      setReferralDb(null)
      return
    }
    let cancelled = false
    void fetchMyReferralInviteStats().then((row) => {
      if (!cancelled && row) setReferralDb(row)
    })
    return () => {
      cancelled = true
    }
  }, [sessionUid, storageTick, shell?.points])

  const snapshot = useMemo(() => (shell ? buildDashboardSnapshot(shell) : null), [shell, storageTick])

  const dash = useMemo(() => {
    if (!shell) return null
    const s = snapshot ?? buildDashboardSnapshot(shell)
    if (isSupabaseConfigured && referralDb != null && shell.source === 'session') {
      return {
        ...s,
        referralCount: referralDb.inviteCount,
        referralPtsEarned: referralDb.pointsFromInvites,
      }
    }
    return s
  }, [snapshot, shell, referralDb])

  const greet = shell?.firstName ?? 'daar'
  const pts = dash?.points ?? shell?.points ?? 0
  const totalDonated = dash?.totalDonated ?? shell?.totalDonated ?? 0
  const yearTotal = dash?.yearTotal ?? 0
  const recIds = useMemo(() => CBF_CAUSES.slice(0, 3).map((c) => c.id), [])

  if (!shell) {
    return (
      <main className="page" id="page-dashboard" role="main">
        <div className="container" style={{ padding: '48px 0', textAlign: 'center' }}>
          <p style={{ color: 'var(--mid)' }}>Je bent niet ingelogd.</p>
          <Link to="/auth" className="btn btn-dark" style={{ marginTop: 16, display: 'inline-block' }}>
            Naar inloggen
          </Link>
        </div>
      </main>
    )
  }

  if (!dash) {
    return null
  }

  const accountTypeText =
    shell.user?.type === 'bedrijf'
      ? '🏢 Bedrijfsaccount'
      : shell.user?.type === 'influencer'
        ? '⭐ Influencer account'
        : '👤 Particulier account'
  const accountTypeGradient =
    shell.user?.type === 'bedrijf'
      ? 'linear-gradient(135deg,#0f766e,#14b8a6)'
      : shell.user?.type === 'influencer'
        ? 'linear-gradient(135deg,#7c3aed,#8b5cf6)'
        : 'linear-gradient(135deg,#1a237e,#3a98f8)'
  return (
    <main className="page account-dashboard-v2" id="page-dashboard" role="main">
      <div className="container">
        <div className="dashboard-layout">
          <aside className="sidebar">
            <div className="sidebar-card">
              <div
                style={{
                  background: accountTypeGradient,
                  padding: '8px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span
                  style={{
                    fontSize: '.65rem',
                    fontWeight: 800,
                    color: 'rgba(255,255,255,.8)',
                    letterSpacing: '.1em',
                    textTransform: 'uppercase',
                  }}
                >
                  {accountTypeText}
                </span>
              </div>
              <div className="sidebar-profile">
                <div className="sidebar-ava" id="dashAva" style={{ overflow: 'hidden' }}>
                  {!shell.anonymous && shell.avatarUrl ? (
                    <img
                      src={shell.avatarUrl}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                    />
                  ) : (
                    shell.avatarLetter
                  )}
                </div>
                <div className="sidebar-name" id="dashName">
                  {shell.displayName}
                </div>
                <div className="sidebar-email" id="dashEmail">
                  {shell.email}
                </div>
                <div
                  id="dashAnonBadge"
                  style={{
                    display: dash.anonymous ? 'block' : 'none',
                    margin: '8px auto 0',
                    background: 'linear-gradient(135deg,#334155,#1e293b)',
                    color: '#e2e8f0',
                    fontSize: '.72rem',
                    fontWeight: 800,
                    letterSpacing: '.07em',
                    padding: '5px 13px',
                    borderRadius: 20,
                    border: '1px solid #475569',
                    textAlign: 'center',
                  }}
                >
                  🕵️ ANONIEM
                </div>
                <DashboardPointsSummary
                  variant="sidebar"
                  summary={
                    isSupabaseConfigured
                      ? {
                          supabaseMode: true,
                          platformActive: pts,
                          platformPending: pendingPts.platform,
                          communityActive: shell.communityPoints,
                          communityPending: pendingPts.community,
                        }
                      : { supabaseMode: false, fallbackPts: pts }
                  }
                />
              </div>
              <DashNav
                active={active}
                onSelect={selectDashSection}
                onLogout={() => void logout()}
                onOpenMeldFondsenwerver={() => setMeldModalOpen(true)}
                showMijnCommunity
                showVolunteerLink={isSupabaseConfigured && shell.source === 'session' && Boolean(shell.user?.id)}
                showCollectantLink={isSupabaseConfigured && shell.source === 'session' && Boolean(shell.user?.id)}
              />
            </div>
          </aside>

          <div className="dash-content">
            <section className={`dash-section${active === 'overzicht' ? ' active' : ''}`} id="dash-overzicht">
              <h2 className="dash-title">
                Goedemorgen, <span id="dashGreetName">{greet}</span>
              </h2>
              <div
                style={{
                  background: 'linear-gradient(135deg,#3a98f8,#6c47ff)',
                  borderRadius: 16,
                  padding: '24px 28px',
                  color: '#fff',
                  marginBottom: 24,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 12,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: '.72rem',
                      fontWeight: 700,
                      letterSpacing: '.12em',
                      textTransform: 'uppercase',
                      color: 'rgba(255,255,255,.6)',
                      marginBottom: 4,
                    }}
                  >
                    Jouw donatie impact
                  </div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 900, fontFamily: 'Fraunces,serif' }}>
                    Dit jaar gedoneerd: <span id="dsYearTotal">€{yearTotal.toFixed(2)}</span>
                  </div>
                  <div style={{ fontSize: '.85rem', color: 'rgba(255,255,255,.8)', marginTop: 4 }}>
                    <span id="dsOneTime">{dash.oneTimeCount}</span> eenmalig ·{' '}
                    <span id="dsMonthly">{dash.monthlyCount}</span> maandelijks actief
                  </div>
                </div>
                <div
                  style={{
                    textAlign: 'center',
                    background: 'rgba(255,255,255,.15)',
                    borderRadius: 14,
                    padding: '16px 22px',
                  }}
                >
                  <div style={{ fontSize: '2rem', fontWeight: 900 }}>
                    ⭐ <span id="dsTotalPts">{dash.points}</span>
                  </div>
                  <div style={{ fontSize: '.78rem', color: 'rgba(255,255,255,.8)' }}>spaarpunten (actief)</div>
                  {isSupabaseConfigured && pendingPts.platform > 0 ? (
                    <div style={{ fontSize: '.72rem', color: 'rgba(254,243,199,.95)', marginTop: 4 }}>
                      +{pendingPts.platform} in behandeling (72u / 60 dagen)
                    </div>
                  ) : null}
                  {isSupabaseConfigured && pendingPts.community > 0 ? (
                    <div style={{ fontSize: '.72rem', color: 'rgba(254,243,199,.95)', marginTop: 2 }}>
                      +{pendingPts.community} community in behandeling
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{
                      background: 'rgba(255,255,255,.25)',
                      border: 'none',
                      color: '#fff',
                      borderRadius: 8,
                      padding: '5px 14px',
                      fontSize: '.75rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      marginTop: 6,
                    }}
                    onClick={() => selectDashSection('puntenwinkel')}
                  >
                    Inwisselen →
                  </button>
                </div>
              </div>

              <div className="dash-stat-grid" id="dashStatGrid4">
                <div className="dash-stat">
                  <div className="dash-stat-icon">💳</div>
                  <div className="dash-stat-num" id="dsTotalDonated">
                    €{totalDonated.toFixed(2)}
                  </div>
                  <div className="dash-stat-lbl">Totaal gedoneerd</div>
                </div>
                <button
                  type="button"
                  className="dash-stat"
                  style={{
                    cursor: 'pointer',
                    width: '100%',
                    textAlign: 'left',
                    background: '#fff',
                    border: '1.5px solid var(--border)',
                    borderRadius: 'var(--r)',
                    padding: '20px 22px',
                    font: 'inherit',
                    color: 'inherit',
                  }}
                  onClick={() => selectDashSection('donaties')}
                >
                  <div className="dash-stat-icon">🔁</div>
                  <div className="dash-stat-num" id="dsMonthlyCount">
                    {dash.dsMonthlyCountLabel}
                  </div>
                  <div className="dash-stat-lbl">Maandelijks gedoneerd</div>
                </button>
                <div className="dash-stat">
                  <div className="dash-stat-icon">📍</div>
                  <div className="dash-stat-num" id="dsRankPos">
                    {dash.rankPos}
                  </div>
                  <div className="dash-stat-lbl">Ranglijst positie</div>
                </div>
                <div className="dash-stat">
                  <div className="dash-stat-icon" style={{ color: '#6b7280', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    {svgTrophy}
                  </div>
                  <div className="dash-stat-num" id="dsBadgeCount">
                    {dash.earnedBadgeCount}
                  </div>
                  <div className="dash-stat-lbl">Badges verdiend</div>
                </div>
              </div>

              {sessionUid && causeQuizLoading ? (
                <div
                  style={{
                    background: 'var(--dark)',
                    borderRadius: 'var(--r)',
                    padding: 24,
                    color: 'rgba(255,255,255,.7)',
                    marginBottom: 24,
                    fontSize: '0.9rem',
                  }}
                >
                  Quiz-status laden…
                </div>
              ) : sessionUid && causeQuizDone && myCauseQuiz ? (
                <div
                  style={{
                    background: 'linear-gradient(135deg, #0f1c5e, #1a237e)',
                    borderRadius: 'var(--r)',
                    padding: 24,
                    color: '#fff',
                    marginBottom: 24,
                    border: '1px solid rgba(255,255,255,.12)',
                  }}
                >
                  <div
                    style={{
                      fontSize: '.72rem',
                      fontWeight: 700,
                      letterSpacing: '.12em',
                      textTransform: 'uppercase',
                      color: 'rgba(255,255,255,.5)',
                      marginBottom: 6,
                    }}
                  >
                    Persoonlijkheidsquiz voltooid
                  </div>
                  <p style={{ fontSize: '0.9rem', lineHeight: 1.5, marginBottom: 14, color: 'rgba(255,255,255,.88)' }}>
                    Opgeslagen op{' '}
                    {new Date(myCauseQuiz.completed_at).toLocaleString('nl-NL', { dateStyle: 'medium' })}. Je hebt de quiz
                    één keer gedaan; marketing-team kan geanonimiseerde uitslaggroepen zien. Je top 10 staat in je account.
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {myCauseQuiz.ranked_cause_ids[0] != null ? (
                      <Link
                        to={`/goede-doelen?causeId=${myCauseQuiz.ranked_cause_ids[0]}`}
                        className="btn btn-green btn-sm"
                        style={{ fontWeight: 800 }}
                      >
                        Open #1 aanbeveling
                      </Link>
                    ) : null}
                    <Link to="/goede-doelen" className="btn btn-outline btn-sm" style={{ borderColor: 'rgba(255,255,255,.4)', color: '#fff' }}>
                      Goede doelen
                    </Link>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    background: 'var(--dark)',
                    borderRadius: 'var(--r)',
                    padding: 24,
                    color: '#fff',
                    marginBottom: 24,
                  }}
                >
                  <div
                    style={{
                      fontSize: '.72rem',
                      fontWeight: 700,
                      letterSpacing: '.12em',
                      textTransform: 'uppercase',
                      color: 'rgba(255,255,255,.4)',
                      marginBottom: 6,
                    }}
                  >
                    Doe de persoonlijkheidsquiz
                  </div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: 8 }}>
                    Welke goede doelen passen bij jou? 🎯
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,.65)', lineHeight: 1.5, marginBottom: 12 }}>
                    Vier korte stappen, daarna <strong>top 10</strong> in volgorde. Eén keer per account. Met ingelogd account
                    slaan we je uitslag op.
                  </p>
                  <button
                    type="button"
                    className="btn btn-green btn-sm"
                    onClick={() => navigate('/goede-doelen?quiz=1')}
                  >
                    Start quiz
                  </button>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
                <Link
                  to="/goede-doelen"
                  className="btn btn-dark"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    borderRadius: 12,
                    padding: '11px 18px',
                    fontWeight: 700,
                    fontSize: '.88rem',
                    flex: 1,
                    minWidth: 140,
                    justifyContent: 'center',
                    textDecoration: 'none',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                  Doneer nu
                </Link>
                <button
                  type="button"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    background: '#fff',
                    color: '#1a237e',
                    border: '2px solid #1a237e',
                    borderRadius: 12,
                    padding: '11px 18px',
                    fontWeight: 700,
                    fontSize: '.88rem',
                    cursor: 'pointer',
                    flex: 1,
                    minWidth: 140,
                    justifyContent: 'center',
                  }}
                  onClick={() => document.getElementById('qrCodeParticulier')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  Nodig vrienden uit
                </button>
              </div>

              <h3 className="ff" style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: 14 }}>
                Aanbevolen voor jou
              </h3>
              <FeaturedCausesGrid
                featuredIds={recIds}
                rootId="dashRecommended"
                rootStyle={{ gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))' }}
              />

              <div
                style={{
                  background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)',
                  border: '1.5px solid #bbf7d0',
                  borderRadius: 16,
                  padding: 24,
                  marginTop: 24,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: '.72rem', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#15803d', marginBottom: 6 }}>
                      🎁 Verwijzingsprogramma
                    </div>
                    <h3 style={{ fontFamily: 'Fraunces,serif', fontSize: '1.15rem', fontWeight: 900, color: '#1f2937', marginBottom: 8 }}>
                      Nodig vrienden uit en verdien punten!
                    </h3>
                    <p style={{ fontSize: '.85rem', color: '#374151', lineHeight: 1.55, marginBottom: 14 }}>
                      Scan jouw persoonlijke QR-code of deel de link. Je uitgenodigde vriend ontvangt{' '}
                      <strong>+100 welkomstpunten</strong>; jij verdient{' '}
                      <strong>+100 punten per aanmelding</strong>, maximaal voor de{' '}
                      <strong>eerste {REFERRAL_REWARD_INVITE_CAP}</strong> via jouw code.
                    </p>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        background: '#fff',
                        borderRadius: 10,
                        padding: '8px 12px',
                        border: '1.5px solid #bbf7d0',
                        marginBottom: 12,
                      }}
                    >
                      <span
                        id="referralLinkText"
                        style={{
                          fontSize: '.78rem',
                          color: '#374151',
                          flex: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {dash.referralLink}
                      </span>
                      <button
                        type="button"
                        style={{
                          background: '#15803d',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 7,
                          padding: '5px 12px',
                          fontSize: '.75rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                        onClick={() => void copyToClipboard(dash.referralLink)}
                      >
                        Kopiëren
                      </button>
                    </div>
                    <div style={{ fontSize: '.78rem', color: '#6b7280' }}>
                      <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '.75rem', color: '#6b7280', fontWeight: 600 }}>Jouw code:</span>
                        <span
                          id="referralCodeDisplay"
                          style={{
                            fontFamily: 'monospace',
                            fontSize: '1.1rem',
                            fontWeight: 900,
                            color: '#1a237e',
                            letterSpacing: '.18em',
                            background: '#eff6ff',
                            padding: '4px 14px',
                            borderRadius: 8,
                            border: '1.5px solid #bfdbfe',
                          }}
                        >
                          {dash.refCode}
                        </span>
                        <button
                          type="button"
                          style={{
                            background: '#1a237e',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 8,
                            padding: '5px 12px',
                            fontSize: '.75rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                          onClick={() => {
                            if (!dash.refCode) return
                            void copyToClipboard(dash.refCode)
                          }}
                        >
                          Kopiëren
                        </button>
                      </div>
                      <span id="referralStats">
                        ⭐ <strong id="referralCount">{dash.referralCount}</strong> vrienden via jou aangemeld ·{' '}
                        <strong id="referralPtsEarned">{dash.referralPtsEarned}</strong> punten verdiend
                        {dash.referralCount > REFERRAL_REWARD_INVITE_CAP ? (
                          <span
                            style={{
                              display: 'block',
                              marginTop: 6,
                              fontSize: '.72rem',
                              color: '#92400e',
                              fontWeight: 500,
                              lineHeight: 1.4,
                            }}
                          >
                            Je bonus gaat naar maximaal {REFERRAL_REWARD_INVITE_CAP} uitnodigingen; extra aanmeldingen tellen nog
                            mee in dit totaal maar leveren voor jou geen punten meer.
                          </span>
                        ) : null}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <div
                      id="qrCodeParticulier"
                      style={{
                        background: '#fff',
                        padding: 10,
                        borderRadius: 12,
                        border: '1.5px solid #bbf7d0',
                      }}
                    >
                      <ReferralQr url={dash.referralLink} />
                    </div>
                    <span style={{ fontSize: '.7rem', color: '#6b7280', fontWeight: 600 }}>Jouw QR-code</span>
                  </div>
                </div>
              </div>

              {shell.user?.type === 'influencer' || shell.user?.type === 'bedrijf' ? (
                <DashCommunitiesSection onOpenMijnCommunity={() => selectDashSection('mijn-community')} />
              ) : null}
            </section>

            <DashInboxSection active={active} shell={shell} />
            <DashDonatiesSection active={active} shell={shell} dash={dash} />
            <DashBadgesSection active={active} dash={dash} shell={shell} />
            <DashRanglijstSection active={active} dash={dash} shell={shell} />
            <DashPuntenwinkelSection active={active} shell={shell} />
            <DashMijnCommunitySection
              visible={active === 'mijn-community'}
              shell={shell}
              onSessionReload={refreshSession}
            />
            <DashProjectBeheerSection active={active} shell={shell} />
            <DashGoeddoelStub active={active} shell={shell} />
            <DashProfielSection
              active={active}
              shell={shell}
              dash={dash}
              pointsSummary={
                isSupabaseConfigured
                  ? {
                      supabaseMode: true,
                      platformActive: pts,
                      platformPending: pendingPts.platform,
                      communityActive: shell.communityPoints,
                      communityPending: pendingPts.community,
                    }
                  : { supabaseMode: false, fallbackPts: pts }
              }
              onUpdateShellProfile={updateShellProfile}
              onRefreshSession={refreshSession}
              onDeleteAccount={async () => {
                const ok = window.confirm('Weet je zeker dat je je lokale accountdata wilt verwijderen en uitloggen?')
                if (!ok) return
                deleteDnlAccountProfile(shell.email)
                await logout()
                navigate('/auth')
              }}
            />
          </div>
        </div>
      </div>
      <FondsenwerverMeldModal open={meldModalOpen} onClose={() => setMeldModalOpen(false)} shell={shell} />
    </main>
  )
}

const svgOverzicht = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
)
const svgInbox = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <polyline points="22,6 12,13 2,6" />
  </svg>
)
const svgCard = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <rect x="1" y="4" width="22" height="16" rx="2" />
    <line x1="1" y1="10" x2="23" y2="10" />
  </svg>
)
const svgChart = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
)
const svgBadge = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <circle cx="12" cy="8" r="6" />
    <path d="M8.21 13.89L7 23l5-3 5 3-1.21-9.12" />
  </svg>
)
const svgShop = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
    <line x1="3" y1="6" x2="21" y2="6" />
    <path d="M16 10a4 4 0 0 1-8 0" />
  </svg>
)
const svgGoeddoel = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <polyline points="1 4 1 10 7 10" />
    <path d="M3.51 15a9 9 0 1 0 .49-3.38" />
  </svg>
)
const svgCollectant = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
)
const svgVolunteer = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.33l-1.06-1.72a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
)
const svgProfiel = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)
const svgLogout = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
)
const svgUsers = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
)
const svgRocket = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M4.5 16.5 3 21l4.5-1.5" />
    <path d="M15 3c3.5 0 6 2.5 6 6 0 4-2.5 8-11 11C7 18 5 16 4 13c3-8.5 7-10 11-10z" />
    <circle cx="14" cy="10" r="1.2" />
  </svg>
)
const svgTrophy = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M8 21h8" />
    <path d="M12 17v4" />
    <path d="M7 4h10v4a5 5 0 0 1-10 0z" />
    <path d="M7 6H5a2 2 0 0 0 0 4h2" />
    <path d="M17 6h2a2 2 0 0 1 0 4h-2" />
  </svg>
)

function DashNav({
  active,
  onSelect,
  onLogout,
  onOpenMeldFondsenwerver,
  showMijnCommunity,
  showVolunteerLink,
  showCollectantLink,
}: {
  active: DashSection
  onSelect: (s: DashSection) => void
  onLogout: () => void
  onOpenMeldFondsenwerver: () => void
  showMijnCommunity?: boolean
  showVolunteerLink?: boolean
  showCollectantLink?: boolean
}) {
  const iconStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', color: '#6b7280' }
  const item = (s: DashSection, icon: ReactNode, label: ReactNode, extra?: ReactNode) => (
    <button
      type="button"
      className={`sidebar-nav-item${active === s ? ' active' : ''}`}
      onClick={() => onSelect(s)}
      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', boxSizing: 'border-box' }}
    >
      <span style={iconStyle}>{icon}</span>
      {label}
      {extra}
    </button>
  )

  const inboxBadge = (
    <span
      id="inboxBadge"
      style={{
        display: 'none',
        background: '#dc2626',
        color: '#fff',
        borderRadius: '50%',
        width: 18,
        height: 18,
        fontSize: '.65rem',
        fontWeight: 800,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 'auto',
      }}
    >
      0
    </span>
  )

  return (
    <nav className="sidebar-nav" aria-label="Accountmenu">
      {item('overzicht', svgOverzicht, 'Overzicht')}
      {item('inbox', svgInbox, 'Inbox', inboxBadge)}
      {item('donaties', svgCard, 'Donatiegeschiedenis')}
      {item('badges', svgBadge, 'Badges & Levels')}
      {item('ranglijst', svgChart, 'Mijn ranglijst')}
      <button
        type="button"
        className={`sidebar-nav-item${active === 'puntenwinkel' ? ' active' : ''}`}
        data-dash="puntenwinkel"
        onClick={() => onSelect('puntenwinkel')}
        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', boxSizing: 'border-box' }}
      >
        <span style={iconStyle}>{svgShop}</span>
        Puntenwinkel
      </button>
      {showMijnCommunity ? item('mijn-community', svgUsers, 'Mijn community') : null}
      {item('mijn-projecten', svgRocket, 'Mijn projecten')}
      {item('goeddoel', svgGoeddoel, 'Goed doel beheer')}
      {showCollectantLink ? (
        <Link
          to="/account/collectant"
          className="sidebar-nav-item"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: '100%',
            boxSizing: 'border-box',
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          <span style={iconStyle}>{svgCollectant}</span>
          Word collectant
        </Link>
      ) : null}
      {showVolunteerLink ? (
        <Link
          to="/account/vrijwilliger"
          className="sidebar-nav-item"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: '100%',
            boxSizing: 'border-box',
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          <span style={iconStyle}>{svgVolunteer}</span>
          Word vrijwilliger
        </Link>
      ) : null}
      {item('profiel', svgProfiel, 'Profiel instellingen')}
      <div className="divider" />
      <button type="button" className="sidebar-nav-item" onClick={onLogout} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={iconStyle}>{svgLogout}</span>
        Uitloggen
      </button>
      <div className="sidebar-nav-meld-wrap" style={{ padding: '10px 6px 4px', display: 'flex', justifyContent: 'center' }}>
        <button
          type="button"
          onClick={onOpenMeldFondsenwerver}
          style={{
            width: '100%',
            maxWidth: 320,
            background: 'linear-gradient(135deg,#dc2626,#b91c1c)',
            color: '#fff',
            border: 'none',
            borderRadius: 12,
            padding: '12px 10px',
            fontSize: '.82rem',
            fontWeight: 800,
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(220,38,38,.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 7,
            margin: '0 auto',
            textDecoration: 'none',
            boxSizing: 'border-box',
          }}
        >
          🚨 Meld fondsenwerver
        </button>
      </div>
    </nav>
  )
}

function DashInboxSection({ active, shell }: { active: DashSection; shell: LegacyShellUser }) {
  const userId = shell?.source === 'session' && shell.user?.id ? (shell.user.id as string) : null
  const [rows, setRows] = useState<UserSiteNotificationRow[]>([])
  const [loading, setLoading] = useState(false)
  const [readIds, setReadIds] = useState<Set<string>>(() => readLocalUserNotifReadIds())
  const [detailRow, setDetailRow] = useState<UserSiteNotificationRow | null>(null)

  const load = useCallback(async () => {
    if (!userId) {
      setRows([])
      return
    }
    setLoading(true)
    const list = await fetchUserSiteNotifications(userId, SITE_INBOX_NOTIFICATION_TYPES)
    setRows(list ?? [])
    setLoading(false)
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (active !== 'inbox' || !userId) return
    const t = window.setInterval(() => void load(), 20_000)
    return () => window.clearInterval(t)
  }, [active, userId, load])

  const markRead = (id: string) => {
    setReadIds((prev) => {
      const next = new Set(prev)
      next.add(id)
      writeLocalUserNotifReadIds(next)
      return next
    })
    void markUserNotificationReadServer(id)
  }

  const markAllRead = () => {
    const next = new Set(readIds)
    for (const r of rows) {
      next.add(r.id)
      void markUserNotificationReadServer(r.id)
    }
    setReadIds(next)
    writeLocalUserNotifReadIds(next)
  }

  if (!isSupabaseConfigured) {
    return (
      <section className={`dash-section${active === 'inbox' ? ' active' : ''}`} id="dash-inbox">
        <h2 className="dash-title" style={{ margin: '0 0 12px 0' }}>
          Inbox & Berichten
        </h2>
        <p style={{ color: '#6b7280' }}>Berichten vereisen een gekoppelde database (Supabase).</p>
      </section>
    )
  }

  if (!userId) {
    return (
      <section className={`dash-section${active === 'inbox' ? ' active' : ''}`} id="dash-inbox">
        <h2 className="dash-title" style={{ margin: '0 0 12px 0' }}>
          Inbox & Berichten
        </h2>
        <p style={{ color: '#6b7280' }}>Log in om je pushberichten en meldingen te zien (zelfde lijst als de bel in de site-header).</p>
      </section>
    )
  }

  return (
    <section className={`dash-section${active === 'inbox' ? ' active' : ''}`} id="dash-inbox">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <h2 className="dash-title" style={{ margin: 0 }}>
          Inbox & Berichten
        </h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <span style={{ fontSize: '0.78rem', color: '#6b7280', alignSelf: 'center' }}>
            Zelfde lijst als Meldingen (🔔) — push, meldingen en acties
          </span>
          <button
            type="button"
            onClick={markAllRead}
            disabled={rows.length === 0}
            style={{
              background: '#f3f4f6',
              border: 'none',
              borderRadius: 8,
              padding: '7px 14px',
              fontSize: '.82rem',
              fontWeight: 600,
              cursor: rows.length ? 'pointer' : 'not-allowed',
              color: '#6b7280',
              opacity: rows.length ? 1 : 0.5,
            }}
          >
            Alles gelezen
          </button>
        </div>
      </div>
      <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 14px', lineHeight: 1.45 }}>
        Tik of klik op een bericht om het volledig te lezen in een groter venster (ook op mobiel en tablet).
      </p>
      <div
        style={{ background: '#fff', borderRadius: 16, border: '1.5px solid #e5e7eb', overflow: 'hidden' }}
        id="inboxList"
      >
        {loading && rows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Laden…</div>
        ) : rows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>📭</div>
            <div>
              Geen berichten. Je ziet hier dezelfde berichten als onder 🔔 Meldingen (push, meldingen, acties).
            </div>
          </div>
        ) : (
          rows.map((r) => {
            const isUnread = !r.read_at && !readIds.has(r.id)
            const typeLabel =
              r.type === 'melding' ? 'Melding' : r.type === 'push' ? 'Push' : r.type === 'actie' ? 'Actie' : r.type
            return (
              <button
                key={r.id}
                type="button"
                aria-label={`Bericht openen: ${r.title}`}
                onClick={() => {
                  markRead(r.id)
                  setDetailRow(r)
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '14px 16px',
                  border: 'none',
                  borderBottom: '1px solid #f3f4f6',
                  background: isUnread ? '#eff6ff' : '#f3f4f6',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  opacity: isUnread ? 1 : 0.96,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div
                    style={{
                      fontSize: '1.25rem',
                      flexShrink: 0,
                      filter: isUnread ? undefined : 'grayscale(0.35)',
                      opacity: isUnread ? 1 : 0.85,
                    }}
                  >
                    {r.icon ?? (r.type === 'melding' ? '📋' : '📣')}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2, flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          color: isUnread ? '#64748b' : '#94a3b8',
                          letterSpacing: '0.03em',
                        }}
                      >
                        {typeLabel}
                        {!isUnread ? ' · gelezen' : ''}
                      </span>
                      {r.target_user_id == null ? (
                        <span style={{ fontSize: '0.65rem', color: '#3b82f6' }}>iedereen</span>
                      ) : null}
                    </div>
                    <div
                      style={{
                        fontWeight: isUnread ? 800 : 500,
                        fontSize: '0.9rem',
                        color: isUnread ? '#1a237e' : '#6b7280',
                      }}
                    >
                      {r.title}
                    </div>
                    {r.body ? (
                      <div
                        className="site-notif-list-body-preview"
                        style={{
                          fontSize: '0.85rem',
                          color: isUnread ? '#4b5563' : '#94a3b8',
                          marginTop: 4,
                        }}
                      >
                        {r.body}
                      </div>
                    ) : null}
                    <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 6 }}>
                      {new Date(r.created_at).toLocaleString('nl-NL')}
                    </div>
                  </div>
                </div>
              </button>
            )
          })
        )}
      </div>
      <SiteNotificationDetailModal notification={detailRow} onClose={() => setDetailRow(null)} />
    </section>
  )
}

function DashCommunitiesSection({ onOpenMijnCommunity }: { onOpenMijnCommunity: () => void }) {
  return (
    <div
      style={{
        background: '#fff',
        border: '1.5px solid #e5e7eb',
        borderRadius: 16,
        padding: 18,
        marginTop: 24,
      }}
    >
      <div
        style={{ fontSize: '.75rem', fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: '#7c3aed', marginBottom: 10 }}
      >
        Communities
      </div>
      <div style={{ fontSize: '.85rem', color: '#6b7280', marginBottom: 12 }}>
        Beheer community, unieke code en projecten in het tabblad <strong>Mijn community</strong>. Daar wordt alles live uit Supabase geladen.
      </div>
      <button type="button" className="btn btn-dark btn-sm" onClick={onOpenMijnCommunity}>
        Open Mijn community
      </button>
    </div>
  )
}

function DashDonatiesSection({
  active,
  shell,
  dash,
}: {
  active: DashSection
  shell: LegacyShellUser
  dash: DashboardSnapshot
}) {
  const allDons = dash.donations
  const yearOpts = useMemo(() => {
    const ys = new Set<string>()
    for (const d of allDons) {
      const parts = (d.date || '').split('-')
      if (parts.length === 3) ys.add(parts[2])
    }
    for (const y of ['2026', '2025', '2024', '2023']) ys.add(y)
    return ['all', ...[...ys].filter((y) => y !== 'all').sort().reverse()]
  }, [allDons])

  const [year, setYear] = useState(String(new Date().getFullYear()))

  const list = useMemo(() => {
    let out = [...allDons].reverse()
    if (year !== 'all') out = out.filter((d) => d.date && d.date.includes(year))
    return out
  }, [allDons, year])

  const total = list.reduce((s, d) => s + (d.amount || 0), 0)
  const orgs = new Set(list.map((d) => d.org)).size
  const lifetimePts = allDons.reduce((s, d) => s + (d.pts || 0), 0) + (dash.shopSpent || 0)

  return (
    <section className={`dash-section${active === 'donaties' ? ' active' : ''}`} id="dash-donaties">
      <div style={{ marginBottom: 24 }}>
        <h2 className="dash-title" style={{ margin: '0 0 16px 0' }}>
          Donatiegeschiedenis
        </h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            id="donationYearFilter"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            style={{
              border: '1.5px solid #e5e7eb',
              borderRadius: 9,
              padding: '8px 14px',
              fontSize: '.85rem',
              background: '#fff',
              cursor: 'pointer',
            }}
          >
            {yearOpts.map((y) => (
              <option key={y} value={y}>
                {y === 'all' ? 'Alle jaren' : y}
              </option>
            ))}
          </select>
          <button
            type="button"
            style={{
              background: '#1a237e',
              color: '#fff',
              border: 'none',
              borderRadius: 9,
              padding: '9px 18px',
              fontSize: '.88rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
            onClick={() => downloadDonationsPdf(shell, allDons, year)}
          >
            📄 Download PDF <span style={{ fontSize: '.76rem', opacity: 0.85 }}>(belastingaangifte)</span>
          </button>
          <Link
            to="/goede-doelen"
            style={{
              background: '#eff6ff',
              color: '#1d4ed8',
              border: '1.5px solid #bfdbfe',
              borderRadius: 9,
              padding: '9px 16px',
              fontSize: '.85rem',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            + Nieuwe donatie
          </Link>
        </div>
      </div>
      <div
        id="donationYearSummary"
        style={{
          background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)',
          border: '1.5px solid #86efac',
          borderRadius: 14,
          padding: '20px 24px',
          marginBottom: 20,
          display: 'flex',
          gap: 24,
          flexWrap: 'wrap',
        }}
      >
        {[
          { id: 'sumTotal', v: `€${total.toFixed(2)}`, l: 'Totaal gedoneerd' },
          { id: 'sumCount', v: String(list.length), l: 'Donaties' },
          { id: 'sumOrgs', v: String(orgs), l: 'Organisaties' },
          { id: 'sumPts', v: String(lifetimePts), l: 'Totaal punten ooit verdiend' },
        ].map((x) => (
          <div key={x.id} style={{ textAlign: 'center', flex: 1, minWidth: 80 }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#15803d' }} id={x.id}>
              {x.v}
            </div>
            <div className={x.id === 'sumPts' ? 'pts-lbl' : undefined} style={{ fontSize: '.75rem', color: '#6b7280', fontWeight: 600, marginTop: 2 }}>
              {x.l}
            </div>
          </div>
        ))}
      </div>
      <div className="donation-history">
        <div className="dh-header" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr' }}>
          <div>Doel & Organisatie</div>
          <div>Type</div>
          <div>Datum</div>
          <div>Bedrag</div>
          <div>Punten</div>
        </div>
        <div id="donationHistoryList">
          {list.map((d) => (
            <div
              key={d.date + d.cause + d.org}
              className="dh-row"
              style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', padding: '12px 16px', borderBottom: '1px solid #f3f4f6' }}
            >
              <div>
                <div className="dh-cause">{d.cause}</div>
                <div className="dh-org" style={{ fontSize: '.78rem', color: '#6b7280' }}>
                  {d.org}
                </div>
              </div>
              <div>
                <span
                  style={{
                    background: d.monthly ? '#dbeafe' : '#f3f4f6',
                    color: d.monthly ? '#1d4ed8' : '#6b7280',
                    borderRadius: 6,
                    padding: '2px 8px',
                    fontSize: '.75rem',
                    fontWeight: 600,
                  }}
                >
                  {d.monthly ? '🔁 Maandelijks' : '1× Eenmalig'}
                </span>
              </div>
              <div style={{ color: '#6b7280', fontSize: '.85rem' }}>{d.date}</div>
              <div className="fw600">€{(d.amount || 0).toFixed(2)}</div>
              <div className="dh-pts">+{d.pts || 0} pts</div>
            </div>
          ))}
          {!list.length ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--mid)', fontSize: '.9rem' }}>
              Geen donaties in deze periode.{' '}
              <Link to="/goede-doelen" className="btn btn-blue btn-sm" style={{ marginLeft: 8 }}>
                Doneer nu
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function DashBadgesSection({ active, dash, shell }: { active: DashSection; dash: DashboardSnapshot; shell: LegacyShellUser }) {
  const { lv, pct } = computeLevel(dash.points)
  const [claimedBadges, setClaimedBadges] = useState<string[]>([])
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const badgeUser = {
    donations: dash.donations,
    totalDonated: dash.totalDonated,
    sticker: dash.sticker,
    monthlyDonations: dash.monthlyDonations,
    email: dash.email,
  }

  useEffect(() => {
    const stored = readDnlAccounts()[shell.email] || {}
    setClaimedBadges(Array.isArray(stored.claimedBadges) ? stored.claimedBadges : [])
  }, [shell.email, dash.earnedBadgeCount])

  function claimBadge(id: string, name: string) {
    if (claimedBadges.includes(id)) return
    const next = [...claimedBadges, id]
    setClaimedBadges(next)
    upsertDnlAccountProfile(shell.email, { claimedBadges: next })
    setMsg({ ok: true, text: `Badge geclaimd: ${name}.` })
  }

  async function shareBadge(name: string) {
    const text = `Ik heb de badge "${name}" verdiend op Donatie.eu!`
    await copyToClipboard(text)
    setMsg({ ok: true, text: 'Badge-tekst gekopieerd om te delen.' })
  }

  return (
    <section className={`dash-section${active === 'badges' ? ' active' : ''}`} id="dash-badges">
      <h2 className="dash-title">Badges & Levels</h2>
      <div className="rank-position-card">
        <div className="rank-pos-label">JOUW LEVEL</div>
        <div className="rank-pos-num">
          <span id="dashLevel">{lv.name}</span>
        </div>
        <div className="level-progress">
          <div className="level-row">
            <span className="level-name" id="levelName">
              Niveau — {lv.name}
            </span>
            <span className="level-pts" id="levelPts">
              {dash.points} / {lv.max} punten
            </span>
          </div>
          <div className="progress-track" style={{ background: 'rgba(255,255,255,.15)' }}>
            <div className="progress-fill" id="levelProgressFill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
      <h3 className="ff" style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: 14, marginTop: 28 }}>
        Jouw badges
      </h3>
      <div className="badge-grid" id="badgeGrid">
        {BADGES_ALL.map((b) => {
          const earned = checkBadgeEarned(b, badgeUser)
          const claimed = claimedBadges.includes(b.id)
          return (
            <div key={b.id} className={`badge-item${earned ? '' : ' locked'}`} title={earned ? 'Verdiend!' : 'Nog niet verdiend'}>
              <span className="badge-icon">{b.icon}</span>
              <div className="badge-name">{b.name}</div>
              <div className="badge-desc">{b.desc}</div>
              {earned ? (
                <>
                  <div style={{ marginTop: 6, fontSize: '.68rem', fontWeight: 700, color: 'var(--green-dark)' }}>
                    {claimed ? '✓ Geclaimd' : '✓ Verdiend'}
                  </div>
                  <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={claimed}
                      onClick={() => claimBadge(b.id, b.name)}
                      style={{ padding: '6px 10px', fontSize: '.72rem', background: claimed ? '#e5e7eb' : '#dcfce7', color: claimed ? '#6b7280' : '#166534' }}
                    >
                      {claimed ? 'Geclaimd' : 'Claim'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      onClick={() => void shareBadge(b.name)}
                      style={{ padding: '6px 10px', fontSize: '.72rem' }}
                    >
                      Deel
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          )
        })}
      </div>
      {msg ? <div style={{ marginTop: 10, fontSize: '.82rem', color: msg.ok ? '#166534' : '#991b1b' }}>{msg.text}</div> : null}
    </section>
  )
}

function DashRanglijstSection({
  active,
  dash,
  shell,
}: {
  active: DashSection
  dash: DashboardSnapshot
  shell: LegacyShellUser
}) {
  const [liveLb, setLiveLb] = useState<LiveLbRow[] | undefined>(undefined)

  const loadLive = useCallback(async () => {
    if (!isSupabaseConfigured) return
    try {
      const rows = await fetchPublicLeaderboard('individuen', 500)
      setLiveLb(mapPublicLeaderboardToLiveLbRows(rows))
    } catch (e) {
      console.warn('[dash ranglijst] get_public_leaderboard', e)
      setLiveLb([])
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
  }, [loadLive, shell?.points, shell?.totalDonated])

  const lb = useMemo(() => {
    if (isSupabaseConfigured) return liveLb ?? []
    return buildHomeLiveLeaderboard(dash.email)
  }, [dash.email, dash.points, dash.totalDonated, dash.donations.length, liveLb])

  const totalDeelnemers = lb.length ? Math.max(...lb.map((r) => r.rank), lb.length) : 0

  const me = lb.find((r) => r.isCurrentUser)
  const prev = me ? lb.find((r) => r.rank === me.rank - 1) : undefined
  let gapText = '— punten'
  if (me) {
    if (me.rank === 1) gapText = 'Jij staat op #1! 🥇'
    else if (prev) gapText = `${Math.max(0, (prev.pts || 0) - (me.pts || 0))} punten achter positie #${me.rank - 1}`
    else gapText = '—'
  } else {
    gapText = 'Doe een donatie om mee te doen'
  }

  const myIdx = me ? lb.indexOf(me) : -1
  const slice = me && lb.length ? lb.slice(Math.max(0, myIdx - 2), Math.min(lb.length, myIdx + 3)) : []
  const rankColors = ['#FFD700', '#C0C0C0', '#CD7F32']

  return (
    <section className={`dash-section${active === 'ranglijst' ? ' active' : ''}`} id="dash-ranglijst">
      <h2 className="dash-title">Mijn ranglijst positie</h2>
      <div className="rank-position-card" id="myRankCard">
        <div className="rank-pos-label">HUIDIGE POSITIE</div>
        <div className="rank-pos-num">
          #<span id="myRankNum">{me ? me.rank : '—'}</span>
          <sup>van {totalDeelnemers > 0 ? totalDeelnemers.toLocaleString('nl-NL') : '—'}</sup>
        </div>
        <div className="rank-bar-row">
          <span>
            Je staat <strong id="myRankGap">{gapText}</strong> achter positie hierboven
          </span>
        </div>
        <div style={{ marginTop: 14, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          <div style={{ fontSize: '.78rem', color: 'rgba(255,255,255,.6)' }}>
            ⭐ Punten:{' '}
            <strong id="myRankPts" style={{ color: '#fff' }}>
              {me ? `${me.pts || 0} punten` : '—'}
            </strong>
          </div>
          <div style={{ fontSize: '.78rem', color: 'rgba(255,255,255,.6)' }}>
            💳 Gedoneerd:{' '}
            <strong id="myRankAmt" style={{ color: '#fff' }}>
              {me ? `€${(me.amt || 0).toFixed(2)}` : '—'}
            </strong>
          </div>
        </div>
      </div>
      <div style={{ marginTop: 20 }}>
        <div style={{ fontSize: '.75rem', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--mid)', marginBottom: 10 }}>
          Jouw omgeving op de ranglijst
        </div>
        <div id="myRankNeighbors" style={{ background: '#fff', borderRadius: 16, border: '1.5px solid var(--border)', overflow: 'hidden' }}>
          {!me || !lb.length ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--mid)', fontSize: '.88rem' }}>Doneer om in de ranglijst te verschijnen.</div>
          ) : (
            slice.map((r) => {
              const isMe = r.isCurrentUser
              const numColor = r.rank <= 3 ? rankColors[r.rank - 1] : 'rgba(15,15,26,.18)'
              const bg = isMe ? 'linear-gradient(90deg,#eff6ff,#fff)' : ''
              const borderLeft = isMe ? '3px solid #3a98f8' : ''
              return (
                <div
                  key={r.rank + r.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '13px 18px',
                    borderBottom: '1px solid #f3f4f6',
                    background: bg,
                    borderLeft,
                  }}
                >
                  <div style={{ fontFamily: 'Fraunces,serif', fontSize: '1.15rem', fontWeight: 900, width: 28, textAlign: 'center', color: numColor }}>
                    {r.rank}
                  </div>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      background: r.color || '#3a98f8',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '.82rem',
                      fontWeight: 700,
                      color: '#fff',
                      flexShrink: 0,
                    }}
                  >
                    {r.ava || r.name.charAt(0)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '.9rem', fontWeight: 700, color: '#1f2937' }}>
                      {r.name}
                      {isMe ? (
                        <span style={{ fontSize: '.68rem', background: '#dbeafe', color: '#1d4ed8', borderRadius: 5, padding: '1px 6px', fontWeight: 800, marginLeft: 6 }}>
                          jij
                        </span>
                      ) : null}
                    </div>
                    <div style={{ fontSize: '.72rem', color: 'var(--mid)' }}>{r.pts || 0} punten</div>
                  </div>
                  <div style={{ fontSize: '.88rem', fontWeight: 700, color: '#15803d' }}>€{(r.amt || 0).toFixed(2)}</div>
                </div>
              )
            })
          )}
        </div>
      </div>
      <Link to="/ranglijst" className="btn btn-outline mt16">
        Volledige ranglijst bekijken →
      </Link>
    </section>
  )
}

const svgPuntenwinkelTitle = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
    <line x1="3" y1="6" x2="21" y2="6" />
    <path d="M16 10a4 4 0 0 1-8 0" />
  </svg>
)

function DashPuntenwinkelSection({ active, shell }: { active: DashSection; shell: LegacyShellUser }) {
  const [tab, setTab] = useState<'algemeen' | 'community'>('algemeen')
  const visibleAlg = active === 'puntenwinkel' && tab === 'algemeen'
  const pendingPts = usePendingPoints(visibleAlg)

  return (
    <section className={`dash-section${active === 'puntenwinkel' ? ' active' : ''}`} id="dash-puntenwinkel">
      <h2 className="dash-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {svgPuntenwinkelTitle}
        Puntenwinkel
      </h2>

      <div
        role="tablist"
        style={{
          display: 'inline-flex',
          background: '#eef2ff',
          borderRadius: 999,
          padding: 4,
          gap: 4,
          marginBottom: 20,
          flexWrap: 'wrap',
        }}
      >
        {(
          [
            { id: 'algemeen', label: 'Puntenwinkel', sub: `${shell.points.toLocaleString('nl-NL')} pt` },
            { id: 'community', label: 'Community puntenwinkel', sub: `${(shell.communityPoints ?? 0).toLocaleString('nl-NL')} pt` },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            style={{
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '.85rem',
              padding: '8px 16px',
              borderRadius: 999,
              background: tab === t.id ? '#1a237e' : 'transparent',
              color: tab === t.id ? '#fff' : '#3730a3',
              display: 'inline-flex',
              gap: 8,
              alignItems: 'center',
            }}
          >
            <span>{t.label}</span>
            <span
              style={{
                fontSize: '.72rem',
                background: tab === t.id ? 'rgba(255,255,255,.2)' : '#c7d2fe',
                color: tab === t.id ? '#fff' : '#3730a3',
                padding: '2px 8px',
                borderRadius: 999,
              }}
            >
              {t.sub}
            </span>
          </button>
        ))}
      </div>

      {tab === 'algemeen' ? (
        <>
          <SiteShopPanel
            visible={visibleAlg}
            userPoints={shell.points}
            pendingPoints={pendingPts}
          />
          <div style={{ marginTop: 28, padding: 20, background: '#f8f9ff', borderRadius: 14, border: '1.5px solid #e8edff' }}>
            <div style={{ fontWeight: 700, fontSize: '.9rem', color: '#1a237e', marginBottom: 6 }}>
              💡 Hoe werkt de puntenwinkel?
            </div>
            <div style={{ fontSize: '.83rem', color: '#6b7280', lineHeight: 1.7 }}>
              Verdien punten met elke donatie (€1 = 0,5 punt). Na 72 uur worden ze actief — zo kunnen we Mollie-refunds
              netjes verrekenen. Wissel punten in voor vouchers, merchandise of extra donaties.
            </div>
          </div>
          <SiteShopAdminPanel visible={visibleAlg} />
        </>
      ) : (
        <DashCommunityShopTab visible={active === 'puntenwinkel' && tab === 'community'} shell={shell} />
      )}
    </section>
  )
}

function DashCommunityShopTab({ visible, shell }: { visible: boolean; shell: LegacyShellUser }) {
  const [memberships, setMemberships] = useState<CommunityMembershipRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [pendingPts, setPendingPts] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setErr(null)
      try {
        const [rows, pending] = await Promise.all([
          fetchMyMembershipCommunities(),
          fetchMyPendingCommunityPoints(),
        ])
        if (!cancelled) {
          setMemberships(rows)
          setPendingPts(pending)
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Kon lidmaatschappen niet laden.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    if (visible) void load()
    return () => {
      cancelled = true
    }
  }, [visible, shell.user?.id])

  if (loading) {
    return <p style={{ color: '#6b7280' }}>Laden…</p>
  }
  if (err) {
    return <p style={{ color: '#991b1b' }}>{err}</p>
  }
  if (memberships.length === 0) {
    return (
      <div
        style={{
          background: '#faf5ff',
          border: '1.5px solid #e9d5ff',
          borderRadius: 14,
          padding: 18,
          color: '#6b21a8',
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 4 }}>Nog geen community-puntenwinkels</div>
        <p style={{ fontSize: '.88rem', margin: 0 }}>
          Sluit je aan bij een community via je dashboard om community-puntenwinkels te ontgrendelen. Je verdient
          community-punten door te doneren aan projecten van die communities.
        </p>
      </div>
    )
  }

  return (
    <>
      <div
        style={{
          background: 'linear-gradient(135deg,#faf5ff,#f3e8ff)',
          borderRadius: 16,
          padding: 20,
          color: '#6b21a8',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ fontSize: '2rem' }}>💜</div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: '1.4rem', fontWeight: 900 }}>
            {(shell.communityPoints ?? 0).toLocaleString('nl-NL')} community-punten
          </div>
          <div style={{ fontSize: '.82rem' }}>
            Verdiend door te doneren aan community-projecten · alleen geldig in de puntenwinkels hieronder.
          </div>
        </div>
        {pendingPts > 0 ? (
          <div
            style={{
              background: 'rgba(255,255,255,.6)',
              border: '1.5px solid rgba(107,33,168,.2)',
              borderRadius: 12,
              padding: '8px 14px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
            }}
          >
            <div style={{ fontSize: '.72rem', color: '#7e22ce', fontWeight: 800, letterSpacing: '.04em' }}>
              IN AFWACHTING
            </div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>{pendingPts.toLocaleString('nl-NL')} pt</div>
            <div style={{ fontSize: '.7rem', color: '#7e22ce' }}>
              Actief na 72u refund-periode
            </div>
          </div>
        ) : null}
      </div>

      <div style={{ display: 'grid', gap: 16 }}>
        {memberships.map((m) => (
          <CommunityShopViewPanel
            key={m.id}
            communityId={m.id}
            communityName={m.name}
            visible={visible}
            userCommunityPoints={shell.communityPoints ?? 0}
          />
        ))}
      </div>
    </>
  )
}

function dbProjectStatusNl(status: DbProject['status']): string {
  switch (status) {
    case 'draft':
      return 'Concept'
    case 'active':
    case 'actief':
      return 'Gaande'
    case 'verlopen':
      return 'Beëindigd'
    case 'cancelled':
      return 'Geannuleerd'
    default:
      return String(status ?? '—')
  }
}

function dashLegacyStatusLabel(p: { status?: 'actief' | 'verlopen' }): string {
  return p.status === 'verlopen' ? 'Beëindigd' : 'Gaande'
}

function DashProjectBeheerSection({ active, shell }: { active: DashSection; shell: LegacyShellUser }) {
  type ProjectWithStatus = {
    id: string
    title: string
    raised: number
    goal: number
    donors: number
    ownerEmail?: string
    status?: 'actief' | 'verlopen'
    createdAt?: string
  }

  const [dbProjects, setDbProjects] = useState<DbProject[]>([])
  const [loadingDb, setLoadingDb] = useState(false)
  const [legacyMine, setLegacyMine] = useState<ProjectWithStatus[]>([])
  const [legacyFocus, setLegacyFocus] = useState<ProjectWithStatus | null>(null)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  const refreshLegacy = useCallback(() => {
    const emailLc = shell.email.toLowerCase()
    const mine = (
      readLegacyProjects() as Array<
        ProjectWithStatus & { name?: string; createdAt?: string }
      >
    )
      .filter((p) => (p.ownerEmail || '').toLowerCase() === emailLc)
      .map((raw) => ({
        ...raw,
        title: raw.title || raw.name || 'Project',
        donors: Number(raw.donors) || 0,
      }))
    setLegacyMine(mine)
    setLegacyFocus((prev) => {
      if (!mine.length) return null
      const still = prev && mine.some((x) => x.id === prev.id)
      const nextPick = still ? mine.find((x) => x.id === prev!.id)! : mine.find((p) => (p.status || 'actief') !== 'verlopen') ?? mine[0]
      return nextPick
    })
  }, [shell.email])

  useEffect(() => {
    refreshLegacy()
    window.addEventListener(dnlProjectsUpdatedEvent, refreshLegacy)
    return () => window.removeEventListener(dnlProjectsUpdatedEvent, refreshLegacy)
  }, [refreshLegacy])

  useEffect(() => {
    if (shell.source !== 'session' || !shell.user?.id || !isSupabaseConfigured) {
      setDbProjects([])
      return
    }
    let cancelled = false
    setLoadingDb(true)
    void fetchProjectsByOwner(shell.user.id as string)
      .then((rows) => {
        if (!cancelled) setDbProjects(rows)
      })
      .catch(() => {
        if (!cancelled) setDbProjects([])
      })
      .finally(() => {
        if (!cancelled) setLoadingDb(false)
      })
    return () => {
      cancelled = true
    }
  }, [shell.source, shell.user?.id])

  const geschiedenis = useMemo(() => {
    const dbIds = new Set(dbProjects.map((p) => p.id))
    type Row =
      | { kind: 'db'; id: string; title: string; statusLabel: string; goal: number | null; raised: number | null; sortAt: string }
      | {
          kind: 'legacy'
          id: string
          title: string
          statusLabel: string
          goal: number
          raised: number
          donors: number
          sortAt: string
          legacy: ProjectWithStatus
        }
    const out: Row[] = []
    for (const p of dbProjects) {
      out.push({
        kind: 'db',
        id: p.id,
        title: p.title,
        statusLabel: dbProjectStatusNl(p.status),
        goal: p.target_amount ?? 0,
        raised: null,
        sortAt: p.created_at,
      })
    }
    for (const p of legacyMine) {
      if (dbIds.has(p.id)) continue
      const createdAt = typeof p.createdAt === 'string' ? p.createdAt : ''
      out.push({
        kind: 'legacy',
        id: p.id,
        title: p.title,
        statusLabel: dashLegacyStatusLabel(p),
        goal: p.goal,
        raised: p.raised,
        donors: p.donors,
        sortAt: createdAt || `1970-01-01T00:00:00.${p.id}`,
        legacy: p,
      })
    }
    out.sort((a, b) => b.sortAt.localeCompare(a.sortAt))
    return out
  }, [dbProjects, legacyMine])

  function saveLegacyRow(next: ProjectWithStatus) {
    const rows = readLegacyProjects() as ProjectWithStatus[]
    const idx = rows.findIndex((r) => r.id === next.id)
    if (idx === -1) return
    rows[idx] = { ...rows[idx], ...next }
    writeLegacyProjects(rows)
    refreshLegacy()
  }

  function requestPayout() {
    if (!legacyFocus) return
    if (legacyFocus.raised <= 0) {
      setMsg({ ok: false, text: 'Geen saldo beschikbaar om uit te betalen.' })
      return
    }
    const ok = window.confirm(`Uitbetaling van EUR ${legacyFocus.raised.toFixed(2)} aanvragen? (lokale demo-flow)`)
    if (!ok) return
    saveLegacyRow({ ...legacyFocus, raised: 0 })
    setMsg({ ok: true, text: 'Uitbetaling aangevraagd (lokaal). Opgehaald bedrag is op 0 gezet.' })
  }

  function finishProject() {
    if (!legacyFocus) return
    const ok = window.confirm('Project markeren als verlopen en doneren uitschakelen?')
    if (!ok) return
    saveLegacyRow({ ...legacyFocus, status: 'verlopen' })
    setMsg({ ok: true, text: 'Project is gemarkeerd als beëindigd.' })
  }

  function editProjectQuick() {
    if (!legacyFocus) return
    const nextTitle = window.prompt('Nieuwe projecttitel', legacyFocus.title)?.trim()
    if (!nextTitle) return
    const goalInput = window.prompt('Nieuw doelbedrag (EUR)', String(legacyFocus.goal))?.trim()
    if (!goalInput) return
    const nextGoal = Number(goalInput.replace(',', '.'))
    if (!Number.isFinite(nextGoal) || nextGoal <= 0) {
      setMsg({ ok: false, text: 'Doelbedrag moet een geldig getal groter dan 0 zijn.' })
      return
    }
    saveLegacyRow({ ...legacyFocus, title: nextTitle, goal: nextGoal })
    setMsg({ ok: true, text: 'Projectgegevens lokaal bijgewerkt.' })
  }

  return (
    <section className={`dash-section${active === 'mijn-projecten' ? ' active' : ''}`} id="dash-mijn-projecten">
      <div style={{ marginBottom: 24 }}>
        <h2 className="dash-title" style={{ margin: '0 0 12px 0' }}>
          Mijn projecten
        </h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <Link
            to="/start-project"
            className="btn btn-dark btn-sm"
            style={{
              padding: '9px 18px',
              fontWeight: 700,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            Start een project
          </Link>
          <Link
            to="/start-project"
            style={{
              background: '#eff6ff',
              color: '#1d4ed8',
              border: '1.5px solid #bfdbfe',
              borderRadius: 9,
              padding: '9px 16px',
              fontSize: '.85rem',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Bekijk startpagina projecten →
          </Link>
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: '.9rem', fontWeight: 700, color: '#1a237e', marginBottom: 8 }}>Projectgeschiedenis</div>
        <p style={{ fontSize: '.82rem', color: '#6b7280', margin: '0 0 14px', lineHeight: 1.5 }}>
          Alle projecten die aan jouw account gekoppeld zijn — gaande, beëindigd en concept — plus lokaal opgeslagen projecten (offline demo).
        </p>

        {loadingDb && geschiedenis.length === 0 ? (
          <div style={{ fontSize: '.85rem', color: '#6b7280', padding: '12px 0' }}>Projecten laden…</div>
        ) : geschiedenis.length === 0 ? (
          <div
            style={{
              background: '#f9fafb',
              border: '1.5px dashed #d1d5db',
              borderRadius: 14,
              padding: 22,
              textAlign: 'center',
              fontSize: '.88rem',
              color: '#6b7280',
            }}
          >
            Je hebt nog geen projectgeschiedenis. Start hierboven een nieuw project of maak er een aan op de projectpagina.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {geschiedenis.map((row) =>
              row.kind === 'db' ? (
                <div
                  key={`db-${row.id}`}
                  style={{
                    border: '1.5px solid #e5e7eb',
                    borderRadius: 12,
                    padding: '14px 16px',
                    background: '#fff',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 800, color: '#111827', marginBottom: 4 }}>{row.title}</div>
                      <div style={{ fontSize: '.78rem', color: '#6b7280' }}>
                        <strong style={{ fontWeight: 700, color: '#374151' }}>{row.statusLabel}</strong>
                        {' · '}
                        Doel €{(row.goal ?? 0).toLocaleString('nl-NL')}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      <Link
                        to={`/community-project/${encodeURIComponent(row.id)}`}
                        className="btn btn-blue btn-sm"
                        style={{ textDecoration: 'none', whiteSpace: 'nowrap' }}
                      >
                        Open projectpagina
                      </Link>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  key={`leg-${row.id}`}
                  style={{
                    border: '1.5px solid #e5e7eb',
                    borderRadius: 12,
                    padding: '14px 16px',
                    background: '#fff',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 800, color: '#111827', marginBottom: 4 }}>{row.title}</div>
                      <div style={{ fontSize: '.78rem', color: '#6b7280' }}>
                        <strong style={{ fontWeight: 700, color: '#374151' }}>{row.statusLabel}</strong>
                        {' · '}
                        Doel €{row.goal.toLocaleString('nl-NL')} · Opgehaald €{row.raised.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}
                        {' · '}
                        {row.donors} donateurs · <em style={{ color: '#9ca3af' }}>lokaal (demo)</em>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      <Link
                        to={`/start-project?edit=${encodeURIComponent(row.id)}`}
                        className="btn btn-outline btn-sm"
                        style={{ textDecoration: 'none', whiteSpace: 'nowrap' }}
                      >
                        Bewerken op projectpagina
                      </Link>
                    </div>
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </div>

      {legacyMine.length > 0 ? (
        <div style={{ marginTop: 28, paddingTop: 22, borderTop: '1.5px solid #e5e7eb' }}>
          <div style={{ fontSize: '.9rem', fontWeight: 700, marginBottom: 10, color: '#1a237e' }}>Lokaal project (demo-beheer)</div>
          <p style={{ fontSize: '.8rem', color: '#6b7280', margin: '0 0 14px', lineHeight: 1.5 }}>
            Snel-acties voor projecten die in je browser staan — niet gekoppeld aan de online database. Volledige bewerking vind je via &quot;Bewerken op projectpagina&quot;.
          </p>
          <div style={{ marginBottom: 14 }}>
            <label htmlFor="dashLegacyProjectPick" style={{ fontSize: '.78rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
              Kies een lokaal project
            </label>
            <select
              id="dashLegacyProjectPick"
              value={legacyFocus?.id ?? ''}
              onChange={(e) => {
                const id = e.target.value
                setLegacyFocus(legacyMine.find((x) => x.id === id) ?? null)
              }}
              style={{
                width: '100%',
                maxWidth: 440,
                border: '1.5px solid #e5e7eb',
                borderRadius: 9,
                padding: '8px 14px',
                fontSize: '.85rem',
                background: '#fff',
                cursor: 'pointer',
              }}
            >
              {legacyMine.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} ({dashLegacyStatusLabel(p)})
                </option>
              ))}
            </select>
          </div>
          <div style={{ marginBottom: 16, fontSize: '.82rem', color: '#374151' }}>
            <strong>EUR {legacyFocus?.goal?.toLocaleString('nl-NL') ?? '—'}</strong> doel · <strong>EUR {(legacyFocus?.raised ?? 0).toFixed(2)}</strong>{' '}
            opgehaald
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))',
              gap: 12,
              marginBottom: 8,
            }}
          >
            <button type="button" className="btn btn-sm" disabled={!legacyFocus || (legacyFocus?.raised ?? 0) <= 0} onClick={requestPayout} style={{ width: '100%', justifyContent: 'center', background: '#15803d', color: '#fff', borderColor: '#15803d' }}>
              Uitbetaling aanvragen
            </button>
            <button type="button" className="btn btn-outline btn-sm" disabled={!legacyFocus} onClick={finishProject} style={{ width: '100%', justifyContent: 'center' }}>
              Markeer beëindigd
            </button>
            <button type="button" className="btn btn-outline btn-sm" disabled={!legacyFocus} onClick={editProjectQuick} style={{ width: '100%', justifyContent: 'center' }}>
              Titel / doel wijzigen
            </button>
          </div>
        </div>
      ) : null}

      {msg ? <div style={{ marginTop: 12, fontSize: '.82rem', color: msg.ok ? '#166534' : '#991b1b' }}>{msg.text}</div> : null}
    </section>
  )
}

function DashGoeddoelStub({ active, shell }: { active: DashSection; shell: LegacyShellUser }) {
  const [monthly, setMonthly] = useState(false)
  const [newsletter, setNewsletter] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  useEffect(() => {
    const stored = readDnlAccounts()[shell.email] || {}
    setMonthly(Boolean((stored as { monthlyDonor?: boolean }).monthlyDonor))
    setNewsletter(Boolean((stored as { charitySubscribed?: boolean }).charitySubscribed))
  }, [shell.email])

  function saveGoeddoelPrefs() {
    upsertDnlAccountProfile(shell.email, {
      charitySubscribed: newsletter,
      monthlyDonor: monthly,
    })
    setMsg({ ok: true, text: 'Voorkeuren opgeslagen (lokaal).' })
  }

  return (
    <section className={`dash-section${active === 'goeddoel' ? ' active' : ''}`} id="dash-goeddoel">
      <h2 className="dash-title">Goed doel beheer</h2>
      <div style={{ background: '#f8faff', border: '1.5px solid #dde6ff', borderRadius: 14, padding: 18 }}>
        <div style={{ fontSize: '.9rem', fontWeight: 700, marginBottom: 10, color: '#1a237e' }}>Abonnementen en voorkeuren</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <input type="checkbox" checked={monthly} onChange={(e) => setMonthly(e.target.checked)} />
          <span style={{ fontSize: '.86rem', color: '#374151' }}>Maandelijkse steun ingeschakeld</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <input type="checkbox" checked={newsletter} onChange={(e) => setNewsletter(e.target.checked)} />
          <span style={{ fontSize: '.86rem', color: '#374151' }}>Nieuws over goede doelen ontvangen</span>
        </label>
        <button type="button" className="btn btn-dark btn-sm" onClick={saveGoeddoelPrefs}>
          💾 Voorkeuren opslaan
        </button>
        {msg ? <div style={{ marginTop: 10, fontSize: '.82rem', color: msg.ok ? '#166534' : '#991b1b' }}>{msg.text}</div> : null}
      </div>
    </section>
  )
}

type PointsSummaryProps =
  | {
      supabaseMode: true
      platformActive: number
      platformPending: number
      communityActive: number
      communityPending: number
    }
  | { supabaseMode: false; fallbackPts: number }

function DashboardPointsSummary({
  variant,
  summary,
}: {
  variant: 'sidebar' | 'profile'
  summary: PointsSummaryProps
}) {
  if (!summary.supabaseMode) {
    const n = summary.fallbackPts
    if (variant === 'sidebar') {
      return (
        <div className="sidebar-pts" id="dashPts">
          ⭐ {n} punten
        </div>
      )
    }
    return (
      <div
        style={{
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: 14,
          padding: '14px 18px',
          marginBottom: 20,
          fontSize: '.92rem',
          fontWeight: 600,
        }}
      >
        ⭐ {n} spaarpunten
      </div>
    )
  }

  const { platformActive, platformPending, communityActive, communityPending } = summary
  const isSidebar = variant === 'sidebar'
  const pad = isSidebar ? '10px 10px' : '18px 20px'
  const marginTop = isSidebar ? 10 : 0
  const marginBottom = variant === 'profile' ? 20 : 0

  const metricRow = (title: string, emoji: string, active: number, pending: number) => (
    <div style={{ marginBottom: variant === 'profile' ? 16 : 10, minWidth: 0 }}>
      <div
        style={{
          fontSize: isSidebar ? '.72rem' : '.78rem',
          fontWeight: 700,
          color: '#0c4a6e',
          marginBottom: 6,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 6,
          flexWrap: 'wrap',
          lineHeight: 1.3,
          textAlign: 'left',
        }}
      >
        <span aria-hidden style={{ flexShrink: 0 }}>
          {emoji}
        </span>
        <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{title}</span>
      </div>
      <div
        style={
          isSidebar
            ? { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }
            : {
                display: 'grid',
                gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)',
                gap: 8,
                minWidth: 0,
              }
        }
      >
        <div
          style={{
            background: '#fff',
            borderRadius: 10,
            padding: isSidebar ? '8px 10px' : '10px 12px',
            border: '1px solid #bae6fd',
            minWidth: 0,
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              fontSize: isSidebar ? '.6rem' : '.65rem',
              color: '#64748b',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '.04em',
              lineHeight: 1.2,
            }}
          >
            Actief
          </div>
          <div
            style={{
              fontSize: isSidebar ? '1.02rem' : '1.15rem',
              fontWeight: 800,
              color: '#0f172a',
              lineHeight: 1.2,
              overflowWrap: 'anywhere',
            }}
          >
            {active.toLocaleString('nl-NL')}
          </div>
        </div>
        <div
          style={{
            background: pending > 0 ? '#fffbeb' : '#f8fafc',
            borderRadius: 10,
            padding: isSidebar ? '8px 10px' : '10px 12px',
            border: `1px solid ${pending > 0 ? '#fcd34d' : '#e2e8f0'}`,
            minWidth: 0,
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              fontSize: isSidebar ? '.6rem' : '.65rem',
              color: '#64748b',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '.04em',
              lineHeight: 1.2,
            }}
          >
            In behandeling
          </div>
          <div
            style={{
              fontSize: isSidebar ? '1.02rem' : '1.15rem',
              fontWeight: 800,
              color: pending > 0 ? '#b45309' : '#64748b',
              lineHeight: 1.2,
              overflowWrap: 'anywhere',
            }}
          >
            {pending.toLocaleString('nl-NL')}
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div
      className={isSidebar ? 'sidebar-pts-card' : undefined}
      id={isSidebar ? 'dashPts' : undefined}
      style={{
        marginTop,
        marginBottom,
        width: '100%',
        maxWidth: '100%',
        minWidth: 0,
        boxSizing: 'border-box',
        background: 'linear-gradient(165deg,#f0f9ff 0%,#ffffff 55%)',
        border: '1.5px solid #7dd3fc',
        borderRadius: 14,
        padding: pad,
        lineHeight: 1.45,
        textAlign: 'left',
        overflowWrap: 'anywhere',
      }}
    >
      <div
        style={{
          fontSize: isSidebar ? '.62rem' : '.72rem',
          fontWeight: 800,
          color: '#0369a1',
          letterSpacing: isSidebar ? '.06em' : '.07em',
          textTransform: 'uppercase',
          marginBottom: isSidebar ? 8 : 14,
          lineHeight: 1.3,
        }}
      >
        {variant === 'profile' ? '⭐ Puntenoverzicht' : 'Punten'}
      </div>
      {metricRow(isSidebar ? 'Spaarpunten' : 'Spaarpunten (site & winkel)', '⭐', platformActive, platformPending)}
      {metricRow('Communitypunten', '🤝', communityActive, communityPending)}
      <div
        style={{
          fontSize: isSidebar ? '.66rem' : '.74rem',
          color: '#475569',
          lineHeight: 1.55,
          paddingTop: isSidebar ? 8 : 12,
          marginTop: 2,
          borderTop: '1px solid #bae6fd',
          minWidth: 0,
        }}
      >
        <strong style={{ color: '#334155', display: 'block', marginBottom: 4, fontSize: isSidebar ? '.68rem' : undefined }}>
          Wanneer actief?
        </strong>
        <ul style={{ margin: 0, paddingLeft: '1rem' }}>
          <li style={{ marginBottom: 3 }}>Eenmalig: <strong>72 uur</strong> na betaling (controle).</li>
          <li>
            Maandelijks: <strong>60 dagen</strong> na betaling.
          </li>
        </ul>
      </div>
    </div>
  )
}

function DashProfielSection({
  active,
  shell,
  dash,
  pointsSummary,
  onUpdateShellProfile,
  onRefreshSession,
  onDeleteAccount,
}: {
  active: DashSection
  shell: LegacyShellUser
  dash: DashboardSnapshot
  pointsSummary: PointsSummaryProps
  onUpdateShellProfile: (input: { firstName?: string; lastName?: string; anonymous?: boolean }) => void
  onRefreshSession?: () => Promise<void>
  onDeleteAccount: () => Promise<void>
}) {
  const [pfFirst, setPfFirst] = useState(shell.firstName)
  const [pfLast, setPfLast] = useState(shell.lastName)
  const [pfEmail, setPfEmail] = useState(shell.email)
  const [anon, setAnon] = useState(dash.anonymous)
  const [bedrijfCode, setBedrijfCode] = useState('')
  const [saveMsg, setSaveMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [adminAccess, setAdminAccess] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState(shell.avatarUrl ?? '')
  const [savingAvatar, setSavingAvatar] = useState(false)
  const [phone, setPhone] = useState('')
  const [street, setStreet] = useState('')
  const [houseNumber, setHouseNumber] = useState('')
  const [postcode, setPostcode] = useState('')
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('')
  const [newPass, setNewPass] = useState('')
  const [newPass2, setNewPass2] = useState('')
  const [stickerOrdersCount, setStickerOrdersCount] = useState(0)
  const [myProjectsCount, setMyProjectsCount] = useState(0)

  /** Mobiel/tablet: tik op sectiekop → scroll naar begin van dat blok (onder nav + puntenbalk). */
  const scrollProfielSegmentFromHeading = useCallback((e: MouseEvent<HTMLHeadingElement> | KeyboardEvent<HTMLHeadingElement>) => {
    if (typeof window === 'undefined' || !window.matchMedia('(max-width: 1024px)').matches) return
    if ('key' in e && e.type === 'keydown') {
      if (e.key !== 'Enter' && e.key !== ' ') return
      e.preventDefault()
    }
    const seg = e.currentTarget.closest('[data-profiel-segment]') as HTMLElement | null
    if (!seg) return
    requestAnimationFrame(() => {
      requestAnimationFrame(() => scrollWindowToElementTopBelowChrome(seg))
    })
  }, [])

  useEffect(() => {
    setAnon(dash.anonymous)
  }, [dash.anonymous])

  useEffect(() => {
    if (!isSupabaseConfigured || shell.source !== 'session' || !shell.user?.id) return
    let cancelled = false
    void (async () => {
      try {
        const grant = await fetchMyAdminShadowGrant(shell.user!.id)
        if (!cancelled) setAdminAccess(grant?.granted === true)
      } catch {
        /* lokale legacy-waarde blijft staan */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [shell.source, shell.user?.id])

  useEffect(() => {
    const refreshStickerOrders = () => {
      try {
        const rawOrders = localStorage.getItem('dnl_sticker_orders')
        const parsed = rawOrders ? (JSON.parse(rawOrders) as Array<{ id?: string; ownerEmail?: string }>) : []
        if (!Array.isArray(parsed)) {
          setStickerOrdersCount(0)
          return
        }
        const mine = parsed.filter((o) => (o.ownerEmail || '').toLowerCase() === shell.email.toLowerCase())
        setStickerOrdersCount(mine.length)
      } catch {
        setStickerOrdersCount(0)
      }
    }
    const refreshMyProjects = () => {
      const projects = readLegacyProjects()
      const mine = projects.filter((p) => (p.ownerEmail || '').toLowerCase() === shell.email.toLowerCase())
      setMyProjectsCount(mine.length)
    }
    setPfFirst(shell.firstName)
    setPfLast(shell.lastName)
    setPfEmail(shell.email)
    const stored = readDnlAccounts()[shell.email] || {}
    setBedrijfCode(String((stored as { bedrijfCode?: string }).bedrijfCode || ''))
    if (!isSupabaseConfigured || shell.source !== 'session' || !shell.user?.id) {
      setAdminAccess(Boolean((stored as { adminAccess?: boolean }).adminAccess))
    }
    setAvatarUrl(shell.avatarUrl || String((stored as { avatarUrl?: string }).avatarUrl || ''))
    setPhone(String((stored as { phone?: string }).phone || ''))
    // Supabase profiel prefereert (betrouwbare bron), fallback op lokale opslag
    const remoteAddress = shell.user?.address ?? ''
    const remotePostcode = shell.user?.postalCode ?? ''
    const remoteCity = shell.user?.city ?? ''
    const remoteCountry = shell.user?.country ?? ''
    setStreet(remoteAddress || String((stored as { street?: string }).street || ''))
    setHouseNumber(String((stored as { houseNumber?: string }).houseNumber || ''))
    setPostcode(remotePostcode || String((stored as { postcode?: string }).postcode || ''))
    setCity(remoteCity || String((stored as { city?: string }).city || ''))
    setCountry(remoteCountry || 'Nederland')
    refreshStickerOrders()
    refreshMyProjects()
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'dnl_sticker_orders') refreshStickerOrders()
      if (e.key === 'dnl_projects') refreshMyProjects()
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener(dnlStickerOrdersUpdatedEvent, refreshStickerOrders)
    window.addEventListener(dnlProjectsUpdatedEvent, refreshMyProjects)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(dnlStickerOrdersUpdatedEvent, refreshStickerOrders)
      window.removeEventListener(dnlProjectsUpdatedEvent, refreshMyProjects)
    }
  }, [shell.firstName, shell.lastName, shell.email, shell.avatarUrl])

  function saveProfile() {
    const firstName = pfFirst.trim()
    if (!firstName) {
      setSaveMsg({ ok: false, text: 'Voornaam mag niet leeg zijn.' })
      return
    }
    const lastName = pfLast.trim()
    onUpdateShellProfile({
      firstName,
      lastName,
      anonymous: anon,
    })
    upsertDnlAccountProfile(shell.email, {
      firstName,
      lastName,
      anonymous: anon,
      adminAccess,
      phone: phone.trim(),
      street: street.trim(),
      houseNumber: houseNumber.trim(),
      postcode: postcode.trim(),
      city: city.trim(),
      ...(avatarUrl ? { avatarUrl } : {}),
      ...(bedrijfCode.trim() ? { bedrijfCode: bedrijfCode.trim() } : {}),
    })
    const fullAddress = [street.trim(), houseNumber.trim()].filter(Boolean).join(' ').trim()
    void (async () => {
      if (isSupabaseConfigured) {
        try {
          await updateMyProfileDisplay({ firstName, lastName, anonymous: anon })
        } catch (e) {
          setSaveMsg({
            ok: false,
            text:
              e instanceof Error
                ? e.message
                : 'Supabase: profiel kon niet worden opgeslagen. Controleer of update_my_profile_display bestaat.',
          })
          return
        }
      }
      try {
        await updateMyProfileAddress({
          address: fullAddress || null,
          postalCode: postcode.trim() || null,
          city: city.trim() || null,
          country: country.trim() || null,
        })
      } catch {
        /* niet-fataal */
      }
      await onRefreshSession?.()
      setSaveMsg({ ok: true, text: 'Profielwijzigingen opgeslagen.' })
    })()
  }

  async function toggleAdminMeekijken() {
    const next = !adminAccess
    setAdminAccess(next)
    upsertDnlAccountProfile(shell.email, { adminAccess: next })

    if (isSupabaseConfigured && shell.source === 'session' && shell.user?.id) {
      try {
        await setMyAdminShadowGrant(shell.user.id, next)
        setSaveMsg({
          ok: true,
          text: next
            ? 'Admin meekijken ingeschakeld (ook op de server; actieve sessies updaten automatisch).'
            : 'Admin meekijken uitgeschakeld.',
        })
      } catch (e) {
        setAdminAccess(!next)
        upsertDnlAccountProfile(shell.email, { adminAccess: !next })
        setSaveMsg({
          ok: false,
          text: e instanceof Error ? e.message : 'Meekijktoestemming kon niet worden opgeslagen in Supabase.',
        })
      }
      return
    }

    setSaveMsg({
      ok: true,
      text: next ? 'Admin meekijken ingeschakeld.' : 'Admin meekijken uitgeschakeld.',
    })
  }

  function koppelBedrijfCode() {
    const code = bedrijfCode.trim().toUpperCase()
    if (!code) {
      setSaveMsg({ ok: false, text: 'Vul eerst een bedrijfscode in.' })
      return
    }
    upsertDnlAccountProfile(shell.email, { bedrijfCode: code })
    setBedrijfCode(code)
    setSaveMsg({ ok: true, text: `Bedrijfscode ${code} gekoppeld.` })
  }

  async function onAvatarPicked(file: File | null) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setSaveMsg({ ok: false, text: 'Kies een geldige afbeelding.' })
      return
    }
    setSavingAvatar(true)
    try {
      const dataUrl = await fileToResizedDataUrl(file, { maxSide: 512, quality: 0.85 })
      await assertUserImagePassesAzureModeration(dataUrl)
      setAvatarUrl(dataUrl)
      upsertDnlAccountProfile(shell.email, { avatarUrl: dataUrl })
      await updateMyAvatar(dataUrl)
      await onRefreshSession?.()
      setSaveMsg({ ok: true, text: 'Profielfoto live opgeslagen.' })
    } catch (e) {
      setSaveMsg({ ok: false, text: e instanceof Error ? e.message : 'Opslaan mislukt.' })
    } finally {
      setSavingAvatar(false)
    }
  }

  async function onAvatarRemoved() {
    if (!avatarUrl) return
    if (!window.confirm('Profielfoto verwijderen?')) return
    setSavingAvatar(true)
    try {
      setAvatarUrl('')
      upsertDnlAccountProfile(shell.email, { avatarUrl: '' })
      await updateMyAvatar(null)
      await onRefreshSession?.()
      setSaveMsg({ ok: true, text: 'Profielfoto verwijderd.' })
    } catch (e) {
      setSaveMsg({ ok: false, text: e instanceof Error ? e.message : 'Verwijderen mislukt.' })
    } finally {
      setSavingAvatar(false)
    }
  }

  function savePasswordStub() {
    if (newPass.length < 8) {
      setSaveMsg({ ok: false, text: 'Nieuw wachtwoord moet minimaal 8 tekens hebben.' })
      return
    }
    if (newPass !== newPass2) {
      setSaveMsg({ ok: false, text: 'Wachtwoorden komen niet overeen.' })
      return
    }
    upsertDnlAccountProfile(shell.email, { passwordUpdatedAt: new Date().toISOString() })
    setNewPass('')
    setNewPass2('')
    setSaveMsg({ ok: true, text: 'Wachtwoord lokaal bijgewerkt.' })
  }

  return (
    <section className={`dash-section${active === 'profiel' ? ' active' : ''}`} id="dash-profiel">
      <h2 className="dash-title">Profiel instellingen</h2>
      <DashboardPointsSummary variant="profile" summary={pointsSummary} />
      <div className="profile-form">
        <div className="profile-ava-section" style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20, flexWrap: 'wrap' }}>
          <div className="profile-ava-big" id="profileAvaBig">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
            ) : (
              <span id="profileAvaInitial">{shell.avatarLetter}</span>
            )}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div className="ff" style={{ fontSize: '1.1rem', fontWeight: 800 }} id="profileFullName">
                {shell.displayName}
              </div>
            </div>
            <div style={{ fontSize: '.83rem', color: 'var(--mid)', marginBottom: 8 }} id="profileEmailDisplay">
              {shell.email}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-dark btn-sm"
                disabled={savingAvatar}
                onClick={() => {
                  const input = document.getElementById('pfAvatarInput') as HTMLInputElement | null
                  input?.click()
                }}
              >
                {savingAvatar ? 'Bezig…' : avatarUrl ? 'Foto wijzigen' : 'Foto uploaden'}
              </button>
              {avatarUrl ? (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={savingAvatar}
                  onClick={() => void onAvatarRemoved()}
                  style={{ color: '#991b1b', borderColor: '#fecaca' }}
                >
                  Verwijderen
                </button>
              ) : null}
              <input
                id="pfAvatarInput"
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => void onAvatarPicked(e.target.files?.[0] ?? null)}
              />
            </div>
            <div style={{ fontSize: '.73rem', color: '#9ca3af', marginTop: 6 }}>
              JPG, PNG of WebP · automatisch verkleind naar 512px · zichtbaar op ranglijst (verborgen als je anoniem bent).
            </div>
          </div>
        </div>

        <div data-profiel-segment style={{ background: '#f8faff', border: '1.5px solid #dde6ff', borderRadius: 14, padding: 18, marginBottom: 16 }}>
          <h3
            className="dash-profiel-section-title dash-profiel-section-title--blue"
            tabIndex={0}
            onClick={scrollProfielSegmentFromHeading}
            onKeyDown={scrollProfielSegmentFromHeading}
          >
            👤 Persoonlijke gegevens
          </h3>
          <div className="input-row">
            <div className="input-group">
              <label htmlFor="pfFirst">Voornaam</label>
              <input id="pfFirst" className="input" type="text" value={pfFirst} onChange={(e) => setPfFirst(e.target.value)} />
            </div>
            <div className="input-group">
              <label htmlFor="pfLast">Achternaam</label>
              <input id="pfLast" className="input" type="text" value={pfLast} onChange={(e) => setPfLast(e.target.value)} />
            </div>
          </div>
          <div className="input-group">
            <label htmlFor="pfEmail">E-mailadres</label>
            <div className="input-icon">
              <span className="icon">📧</span>
              <input id="pfEmail" className="input" type="email" value={pfEmail} onChange={(e) => setPfEmail(e.target.value)} />
            </div>
          </div>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label htmlFor="pfTel">Telefoonnummer</label>
            <div className="input-icon">
              <span className="icon">📱</span>
              <input id="pfTel" className="input" type="tel" placeholder="06 12345678" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
        </div>

        <div data-profiel-segment style={{ background: '#fff7ed', border: '1.5px solid #fed7aa', borderRadius: 14, padding: 18, marginBottom: 16 }}>
          <h3
            className="dash-profiel-section-title dash-profiel-section-title--orange"
            tabIndex={0}
            onClick={scrollProfielSegmentFromHeading}
            onKeyDown={scrollProfielSegmentFromHeading}
          >
            📍 Adresgegevens
          </h3>
          <p style={{ fontSize: '.78rem', color: '#9a3412', marginTop: 0, marginBottom: 14 }}>
            Deze gegevens zijn nodig voor levering als je community-beloningen inwisselt. De community-eigenaar ziet
            alleen je naam, e-mail en adres als je iets in zijn puntenwinkel inwisselt.
          </p>
          <div className="input-group">
            <label htmlFor="pfStraat">Straat</label>
            <input id="pfStraat" className="input" type="text" placeholder="Keizersgracht" value={street} onChange={(e) => setStreet(e.target.value)} />
          </div>
          <div className="input-row">
            <div className="input-group">
              <label htmlFor="pfHuisnr">Huisnummer</label>
              <input id="pfHuisnr" className="input" type="text" placeholder="123A" value={houseNumber} onChange={(e) => setHouseNumber(e.target.value)} />
            </div>
            <div className="input-group">
              <label htmlFor="pfPostcode">Postcode</label>
              <input id="pfPostcode" className="input" type="text" placeholder="1234 AB" value={postcode} onChange={(e) => setPostcode(e.target.value.toUpperCase())} />
            </div>
          </div>
          <div className="input-row">
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label htmlFor="pfStad">Stad</label>
              <input id="pfStad" className="input" type="text" placeholder="Amsterdam" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label htmlFor="pfLand">Land</label>
              <input id="pfLand" className="input" type="text" placeholder="Nederland" value={country} onChange={(e) => setCountry(e.target.value)} />
            </div>
          </div>
        </div>

        <div data-profiel-segment style={{ background: '#f8f9ff', border: '1.5px solid #e8edff', borderRadius: 14, padding: 18, marginBottom: 16 }}>
          <h3
            className="dash-profiel-section-title dash-profiel-section-title--blue"
            tabIndex={0}
            onClick={scrollProfielSegmentFromHeading}
            onKeyDown={scrollProfielSegmentFromHeading}
          >
            🔐 Wachtwoord wijzigen
          </h3>
          <div className="input-group">
            <label htmlFor="pfNewPass">Nieuw wachtwoord</label>
            <div className="input-icon">
              <span className="icon">🔒</span>
              <input id="pfNewPass" className="input" type="password" placeholder="Nieuw wachtwoord (min. 8 tekens)" value={newPass} onChange={(e) => setNewPass(e.target.value)} />
            </div>
          </div>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label htmlFor="pfNewPass2">Bevestig wachtwoord</label>
            <div className="input-icon">
              <span className="icon">🔒</span>
              <input id="pfNewPass2" className="input" type="password" placeholder="Herhaal wachtwoord" value={newPass2} onChange={(e) => setNewPass2(e.target.value)} />
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <button type="button" className="btn btn-outline btn-sm" onClick={savePasswordStub}>
              🔐 Wachtwoord opslaan
            </button>
          </div>
        </div>

        <div data-profiel-segment style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 14, padding: 18, marginBottom: 16 }}>
          <h3
            className="dash-profiel-section-title dash-profiel-section-title--slate"
            tabIndex={0}
            onClick={scrollProfielSegmentFromHeading}
            onKeyDown={scrollProfielSegmentFromHeading}
          >
            🕵️ Anonimiteit op ranglijst
          </h3>
          <div className="anon-toggle" id="anonToggleWrap" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 0, padding: '18px 20px', borderRadius: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 12 }}>
              <div>
                <div style={{ fontSize: '.78rem', color: 'var(--mid)', lineHeight: 1.5 }}>
                  Je naam en profielfoto worden verborgen voor anderen.
                  <br />
                  Punten en gedoneerd bedrag blijven zichtbaar.
                </div>
              </div>
              <label className="toggle-switch" style={{ flexShrink: 0 }}>
                <input type="checkbox" id="anonToggle" checked={anon} onChange={(e) => setAnon(e.target.checked)} />
                <span className="toggle-slider" />
              </label>
            </div>
          </div>
        </div>

        <div data-profiel-segment style={{ background: '#fafbff', border: '1.5px solid #e5e7eb', borderRadius: 14, padding: 18, marginBottom: 16 }}>
          <h3
            className="dash-profiel-section-title dash-profiel-section-title--violet"
            tabIndex={0}
            onClick={scrollProfielSegmentFromHeading}
            onKeyDown={scrollProfielSegmentFromHeading}
          >
            🎯 Interesses (voor aanbevelingen)
          </h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 0 }} id="interestChips">
            {INTEREST_LABELS.map((c) => (
              <span key={c} className="chip chip-blue" style={{ cursor: 'pointer', padding: '6px 14px', fontSize: '.82rem' }}>
                {c}
              </span>
            ))}
          </div>
        </div>
        <div className="divider" />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-dark" style={{ flex: 1 }} onClick={saveProfile}>
            💾 Wijzigingen opslaan
          </button>
          <button
            type="button"
            className="btn btn-danger"
            style={{ background: '#fff', color: '#dc2626', border: '1.5px solid #fca5a5' }}
            onClick={() => void onDeleteAccount()}
          >
            🗑️ Account verwijderen
          </button>
        </div>
        {saveMsg ? (
          <div style={{ marginTop: 10, fontSize: '.82rem', color: saveMsg.ok ? '#166534' : '#991b1b' }}>{saveMsg.text}</div>
        ) : null}

        <div className="divider" style={{ margin: '24px 0 20px' }} />
        <div data-profiel-segment id="profileBedrijfSection" style={{ background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 14, padding: 18, marginBottom: 16 }}>
          <h3
            className="dash-profiel-section-title dash-profiel-section-title--compact dash-profiel-section-title--green"
            tabIndex={0}
            onClick={scrollProfielSegmentFromHeading}
            onKeyDown={scrollProfielSegmentFromHeading}
          >
            🏢 Bedrijfskoppeling
          </h3>
          <div id="profileBedrijfStatus" style={{ fontSize: '.82rem', color: '#6b7280', marginBottom: 12 }}>
            {bedrijfCode.trim() ? `Gekoppeld aan bedrijfscode: ${bedrijfCode.trim()}` : 'Je bent nog niet gekoppeld aan een bedrijf.'}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input id="profileBedrijfCode" className="input" type="text" placeholder="Bedrijfscode (bijv. AH-2025)" style={{ flex: 1, minWidth: 160, marginBottom: 0, fontSize: '.85rem' }} value={bedrijfCode} onChange={(e) => setBedrijfCode(e.target.value.toUpperCase())} />
            <button type="button" style={{ background: '#15803d', color: '#fff', border: 'none', borderRadius: 9, padding: '9px 16px', fontSize: '.85rem', fontWeight: 700, cursor: 'pointer' }} onClick={koppelBedrijfCode}>
              {bedrijfCode.trim() ? 'Bijwerken' : 'Koppelen'}
            </button>
          </div>
        </div>

        <div className="divider" style={{ margin: '24px 0 20px' }} />
        <div data-profiel-segment style={{ background: '#f8f9ff', border: '1.5px solid #dde6ff', borderRadius: 12, padding: 18 }}>
          <h3
            className="dash-profiel-section-title dash-profiel-section-title--compact dash-profiel-section-title--blue"
            tabIndex={0}
            onClick={scrollProfielSegmentFromHeading}
            onKeyDown={scrollProfielSegmentFromHeading}
          >
            🔍 Admin meekijken
          </h3>
          <div style={{ fontSize: '.82rem', color: '#6b7280', marginBottom: 14, lineHeight: 1.6 }}>
            Verleen een Donatie.eu beheerder tijdelijk toegang om jouw account te bekijken. Handig bij vragen of klachten.
          </div>
          <button
            id="adminAccessBtn"
            type="button"
            className="btn"
            data-granted={adminAccess ? 'true' : 'false'}
            style={{ background: '#eef2ff', color: '#1a237e', border: '1.5px solid #dde6ff', fontSize: '.85rem', padding: '9px 18px' }}
            onClick={() => void toggleAdminMeekijken()}
          >
            {adminAccess ? '✓ Admin meekijken ingeschakeld' : '🔍 Admin meekijken toestaan'}
          </button>
        </div>

        <div className="divider" style={{ margin: '24px 0 20px' }} />
        <div data-profiel-segment style={{ background: '#eef2ff', border: '1.5px solid #c7d2fe', borderRadius: 12, padding: 16 }}>
          <h3
            className="dash-profiel-section-title dash-profiel-section-title--compact dash-profiel-section-title--indigo"
            tabIndex={0}
            onClick={scrollProfielSegmentFromHeading}
            onKeyDown={scrollProfielSegmentFromHeading}
          >
            🏷️ Sticker bestellingen
          </h3>
          <div style={{ fontSize: '.82rem', color: '#6b7280', marginBottom: 10 }}>
            Totaal lokaal besteld: <strong>{stickerOrdersCount}</strong>
          </div>
          <Link to="/sticker-bestellen" className="btn btn-outline btn-sm">
            Stickerpagina openen
          </Link>
        </div>

        <div className="divider" style={{ margin: '24px 0 20px' }} />
        <div data-profiel-segment id="pfProjectSection">
          <h3
            className="dash-profiel-section-title dash-profiel-section-title--violet"
            tabIndex={0}
            onClick={scrollProfielSegmentFromHeading}
            onKeyDown={scrollProfielSegmentFromHeading}
          >
            🚀 Projecten
          </h3>
          {myProjectsCount <= 0 ? (
            <div id="pfNoProject" style={{ background: '#f9fafb', border: '1.5px dashed #d1d5db', borderRadius: 14, padding: 24, textAlign: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: '2rem', marginBottom: 8 }}>🚀</div>
              <div style={{ fontWeight: 700, color: '#374151', marginBottom: 6 }}>Nog geen actief project</div>
              <div style={{ fontSize: '.82rem', color: '#9ca3af', marginBottom: 14 }}>
                Start een project om donaties in te zamelen voor een goed doel.
              </div>
              <Link to="/start-project" style={{ background: 'linear-gradient(135deg,#7c3aed,#6d28d9)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 22px', fontSize: '.85rem', fontWeight: 700, textDecoration: 'none', display: 'inline-block' }}>
                🚀 Start een project
              </Link>
            </div>
          ) : (
            <div style={{ background: '#f5f3ff', border: '1.5px solid #ddd6fe', borderRadius: 14, padding: 18, marginBottom: 16 }}>
              <div style={{ fontSize: '.85rem', color: '#6d28d9', fontWeight: 700, marginBottom: 8 }}>
                Actieve projecten: {myProjectsCount}
              </div>
              <Link to="/start-project" className="btn btn-outline btn-sm">
                ✏️ Beheer mijn projecten
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function ReferralQr({ url }: { url: string }) {
  const [src, setSrc] = useState('')

  useEffect(() => {
    let cancelled = false
    void import('qrcode').then((QR) => {
      QR.default
        .toDataURL(url, {
          width: 120,
          margin: 1,
          color: { dark: '#1f2937', light: '#ffffff' },
          errorCorrectionLevel: 'M',
        })
        .then((dataUrl) => {
          if (!cancelled) setSrc(dataUrl)
        })
        .catch(() => {
          if (!cancelled) setSrc('')
        })
    })
    return () => {
      cancelled = true
    }
  }, [url])

  if (!src) {
    return <div style={{ width: 120, height: 120, background: '#f3f4f6', borderRadius: 8 }} />
  }
  return <img src={src} alt="" width={120} height={120} />
}
