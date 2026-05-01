import { createPortal } from 'react-dom'
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom'
import { BottomNavIcon, type BottomNavIconId } from './BottomNavIcon'
import { PublicSiteFooter } from './PublicSiteFooter'
import { DonnieChatbot } from './DonnieChatbot'
import { PushInbox } from './PushInbox'
import { useLegacyUiSession, type LegacyShellUser } from '../../context/LegacyUiSessionContext'
import { fetchMyMembershipCommunities } from '../../features/community/communityProjectsService'
import { isSupabaseConfigured } from '../../lib/supabase'
import { startSessionHeartbeat } from '../../features/public/sessionHeartbeat'
import { useLiveBrandingSettings } from '../../features/public/brandingLive'
import '../../styles/donatie-shell-bridge.css'
import { RouteOutletFallback } from '../RouteOutletFallback'

const LEGACY_CSS_ID = 'donatie-legacy-index-css'
const LEGACY_CSS_HREF = '/donatie-legacy-index.css'

const BASE_NAV: { to: string; label: string; end?: boolean }[] = [
  { to: '/', label: 'Home', end: true },
  { to: '/goede-doelen', label: 'Goede doelen' },
  { to: '/ranglijst', label: 'Ranglijst' },
  { to: '/start-project', label: 'Start project' },
  { to: '/sticker-bestellen', label: 'Sticker bestellen' },
  { to: '/denk-mee', label: 'Denk mee' },
  { to: '/puntensysteem', label: 'Puntensysteem' },
  { to: '/faq', label: 'FAQ' },
  { to: '/nieuws', label: 'Nieuws' },
]

const COMMUNITIES_NAV_ITEM = { to: '/communities', label: 'Communities' }

const BASE_BOTTOM_NAV: { to: string; label: string; icon: BottomNavIconId; end?: boolean }[] = [
  { to: '/', label: 'Home', icon: 'home', end: true },
  { to: '/goede-doelen', label: 'Doelen', icon: 'doelen' },
  { to: '/ranglijst', label: 'Ranglijst', icon: 'ranglijst' },
  { to: '/nieuws', label: 'Nieuws', icon: 'nieuws' },
  { to: '/start-project', label: 'Project', icon: 'project' },
  { to: '/auth', label: 'Account', icon: 'account' },
]

function navClass({ isActive }: { isActive: boolean }) {
  return `nav-link${isActive ? ' active' : ''}`
}

/** Zelfde weergave als `setLoggedIn` / `updateNavPoints` in index.html */
function navBarDisplayName(shell: LegacyShellUser): string {
  if (shell.anonymous) return 'Anoniem'
  const ln = shell.lastName?.trim()
  return `${shell.firstName}${ln ? ` ${ln[0]}.` : ''}`.trim() || shell.displayName
}

function navBarAvatarLetter(shell: LegacyShellUser): string {
  if (shell.anonymous) return '🕵️'
  return shell.avatarLetter
}

export function PublicLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [navDdLayout, setNavDdLayout] = useState<{ top: number; right: number; width: number } | null>(null)
  const accountMenuRef = useRef<HTMLDivElement | null>(null)
  const navDropdownRef = useRef<HTMLDivElement | null>(null)
  const location = useLocation()
  const { shell, isPreview, logout, exitPreview } = useLegacyUiSession()
  const [hasCommunityAccess, setHasCommunityAccess] = useState(false)
  const branding = useLiveBrandingSettings()

  // Eigenaar-accounts hebben direct toegang; particulieren alleen als ze lid/sponsor zijn.
  useEffect(() => {
    let cancelled = false
    async function check() {
      if (!shell?.user?.id || !isSupabaseConfigured) {
        setHasCommunityAccess(false)
        return
      }
      if (shell.user.type === 'bedrijf' || shell.user.type === 'influencer') {
        setHasCommunityAccess(true)
        return
      }
      try {
        const memberships = await fetchMyMembershipCommunities()
        if (!cancelled) setHasCommunityAccess(memberships.length > 0)
      } catch {
        if (!cancelled) setHasCommunityAccess(false)
      }
    }
    void check()
    return () => {
      cancelled = true
    }
  }, [shell?.user?.id, shell?.user?.type])

  const mainNav = useMemo(() => {
    if (!hasCommunityAccess) return BASE_NAV
    // Voeg 'Communities' netjes tussen Ranglijst en Start project zodat de centrering zijn balans houdt
    const rankingIdx = BASE_NAV.findIndex((x) => x.to === '/ranglijst')
    const next = [...BASE_NAV]
    next.splice(rankingIdx + 1, 0, COMMUNITIES_NAV_ITEM)
    return next
  }, [hasCommunityAccess])

  const bottomNavItems = useMemo(() => {
    if (!hasCommunityAccess) return BASE_BOTTOM_NAV
    const rankingIdx = BASE_BOTTOM_NAV.findIndex((x) => x.to === '/ranglijst')
    const next = [...BASE_BOTTOM_NAV]
    next.splice(rankingIdx + 1, 0, {
      to: '/communities',
      label: 'Community',
      icon: 'communities',
    })
    return next
  }, [hasCommunityAccess])

  useEffect(() => {
    document.body.classList.add('has-public-nav', 'js-ready')
    const stopHeartbeat = startSessionHeartbeat()
    return () => {
      document.body.classList.remove('has-public-nav', 'js-ready')
      stopHeartbeat()
    }
  }, [])

  /** Near-pixel parity with legacy index.html: load extracted stylesheet only on public shell routes. */
  useEffect(() => {
    let link = document.getElementById(LEGACY_CSS_ID) as HTMLLinkElement | null
    if (!link) {
      link = document.createElement('link')
      link.id = LEGACY_CSS_ID
      link.rel = 'stylesheet'
      link.href = LEGACY_CSS_HREF
      document.head.appendChild(link)
    }
    return () => {
      document.getElementById(LEGACY_CSS_ID)?.remove()
    }
  }, [])

  useEffect(() => {
    const t = window.setTimeout(() => setMobileOpen(false), 0)
    return () => window.clearTimeout(t)
  }, [location.pathname])

  useLayoutEffect(() => {
    window.scrollTo(0, 0)
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
  }, [location.pathname])

  const positionNavDropdown = () => {
    const btn = document.getElementById('navUserBtn')
    if (!btn) return
    const r = btn.getBoundingClientRect()
    setNavDdLayout({
      top: r.bottom + 8,
      right: window.innerWidth - r.right,
      width: Math.max(r.width, 160),
    })
  }

  useLayoutEffect(() => {
    if (!accountMenuOpen || !shell) {
      setNavDdLayout(null)
      return
    }
    positionNavDropdown()
  }, [accountMenuOpen, shell, location.pathname])

  useEffect(() => {
    if (!accountMenuOpen) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (accountMenuRef.current?.contains(t)) return
      if (navDropdownRef.current?.contains(t)) return
      setAccountMenuOpen(false)
    }
    const onWin = () => positionNavDropdown()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAccountMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onWin)
    window.addEventListener('scroll', onWin, true)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onWin)
      window.removeEventListener('scroll', onWin, true)
    }
  }, [accountMenuOpen, shell])

  const navBtnInlogStyle: CSSProperties = {
    background: 'rgba(255,255,255,.2)',
    color: '#fff',
    border: '1.5px solid rgba(255,255,255,.5)',
    borderRadius: 'var(--r-sm)',
    padding: '7px 16px',
    fontWeight: 600,
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  }

  const navBtnAccountStyle: CSSProperties = {
    background: '#1a237e',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--r-sm)',
    padding: '7px 16px',
    fontWeight: 600,
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  }

  return (
    <div className="public-site donatie-legacy-spa">
      <a href="#mainContent" className="skip-link">
        Naar hoofdinhoud
      </a>

      <nav id="mainNav" role="navigation" aria-label="Hoofdnavigatie">
        <div className="nav-inner">
          <NavLink to="/" className="nav-logo" end aria-label="Donatie.eu - Terug naar home">
            <div className="logo-heart" aria-hidden>
              <img
                src={branding.logoNavUrl || '/logo-nav.jpg'}
                alt=""
                width={52}
                height={52}
                onError={(e) => {
                  const el = e.currentTarget
                  if (el.dataset.fallback === '1') return
                  el.dataset.fallback = '1'
                  el.src = '/donatie-logo.svg'
                }}
              />
            </div>
            <span style={{ fontWeight: 900 }}>Donatie.eu</span>
          </NavLink>

          <nav className="nav-links" aria-label="Hoofdmenu">
            {mainNav.map((item) => (
              <NavLink key={item.to} to={item.to} className={navClass} end={item.end === true}>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className={`nav-right${shell ? ' hidden' : ''}`} id="navRight">
            <Link to="/auth" className="btn btn-sm" style={navBtnInlogStyle}>
              Inloggen
            </Link>
            <Link to="/auth" className="btn btn-sm" style={navBtnAccountStyle}>
              Account aanmaken
            </Link>
          </div>

          <div className={`nav-right${shell ? '' : ' hidden'}`} id="navLoggedIn">
            <div className="nav-pts" id="navPts">
              {shell ? `${shell.points.toLocaleString('nl-NL')} pt` : '0 pt'}
            </div>
            <PushInbox />
            <div id="navUserBtnWrap" ref={accountMenuRef} style={{ position: 'relative' }}>
              <div
                role="button"
                tabIndex={0}
                id="navUserBtn"
                onClick={() => setAccountMenuOpen((o) => !o)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setAccountMenuOpen((o) => !o)
                  }
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,.22)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,.12)'
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  background: 'rgba(255,255,255,.12)',
                  borderRadius: 30,
                  padding: '4px 12px 4px 4px',
                  border: '1.5px solid rgba(255,255,255,.2)',
                  color: '#fff',
                  font: 'inherit',
                  transition: 'background .15s',
                }}
              >
                <div
                  className="nav-avatar"
                  id="navAvatar"
                  style={{
                    flexShrink: 0,
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {shell && !shell.anonymous && shell.avatarUrl ? (
                    <img
                      src={shell.avatarUrl}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                    />
                  ) : shell ? (
                    navBarAvatarLetter(shell)
                  ) : (
                    '?'
                  )}
                </div>
                <span
                  id="navUserName"
                  style={{
                    fontSize: '.82rem',
                    fontWeight: 700,
                    color: '#fff',
                    whiteSpace: 'nowrap',
                    maxWidth: 100,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: shell ? 'block' : 'none',
                  }}
                >
                  {shell ? navBarDisplayName(shell) : ''}
                </span>
                <span
                  id="navMenuChevron"
                  style={{
                    transition: 'transform .2s',
                    color: '#fff',
                    display: shell ? 'inline' : 'none',
                    transform: accountMenuOpen ? 'rotate(180deg)' : 'none',
                  }}
                >
                  ▾
                </span>
              </div>
              {accountMenuOpen && shell && navDdLayout
                ? createPortal(
                    <div
                      ref={navDropdownRef}
                      id="navDropdown"
                      style={{
                        display: 'block',
                        position: 'fixed',
                        top: navDdLayout.top,
                        right: navDdLayout.right,
                        width: navDdLayout.width,
                        background: '#fff',
                        borderRadius: 14,
                        boxShadow: '0 8px 28px rgba(0,0,0,.18)',
                        border: '1px solid #e5e7eb',
                        overflow: 'hidden',
                        zIndex: 99999,
                        minWidth: 160,
                      }}
                    >
                      <Link
                        to="/account"
                        onClick={() => setAccountMenuOpen(false)}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#f0f4ff'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent'
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          width: '100%',
                          padding: '13px 16px',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontFamily: 'Outfit, sans-serif',
                          fontSize: '.88rem',
                          fontWeight: 600,
                          color: '#1a237e',
                          textAlign: 'left',
                          textDecoration: 'none',
                        }}
                      >
                        <span>👤</span> Mijn profiel
                      </Link>
                      <Link
                        to="/account/admin-toegang"
                        onClick={() => setAccountMenuOpen(false)}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#f0f4ff'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent'
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          width: '100%',
                          padding: '13px 16px',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontFamily: 'Outfit, sans-serif',
                          fontSize: '.88rem',
                          fontWeight: 600,
                          color: '#1a237e',
                          textAlign: 'left',
                          textDecoration: 'none',
                        }}
                      >
                        <span>🔍</span> Admin meekijken
                      </Link>
                      <div style={{ height: 1, background: '#f3f4f6', margin: '0 12px' }} />
                      <button
                        type="button"
                        onClick={() => {
                          setAccountMenuOpen(false)
                          void logout()
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#fff5f5'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent'
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          width: '100%',
                          padding: '13px 16px',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontFamily: 'Outfit, sans-serif',
                          fontSize: '.88rem',
                          fontWeight: 600,
                          color: '#dc2626',
                          textAlign: 'left',
                        }}
                      >
                        <span>🚪</span> Uitloggen
                      </button>
                    </div>,
                    document.body,
                  )
                : null}
            </div>
          </div>

          <button
            type="button"
            className="nav-hamburger"
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? 'Menu sluiten' : 'Menu openen'}
            onClick={() => setMobileOpen((o) => !o)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </nav>

      {isPreview ? (
        <div
          id="previewBanner"
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 500,
            background: 'linear-gradient(90deg,#f59e0b,#d97706)',
            color: '#fff',
            padding: '8px 16px',
            textAlign: 'center',
            fontSize: '.82rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
          }}
        >
          Voorbeeldprofiel — alleen ter illustratie
          <button
            type="button"
            onClick={() => exitPreview()}
            style={{
              background: 'rgba(255,255,255,.25)',
              border: '1.5px solid rgba(255,255,255,.5)',
              color: '#fff',
              borderRadius: 6,
              padding: '3px 10px',
              fontSize: '.75rem',
              fontWeight: 700,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            Sluiten ×
          </button>
        </div>
      ) : null}

      <div className={`nav-mobile${mobileOpen ? ' open' : ''}`} id="mobileNav">
        {shell ? (
          <div
            style={{
              display: 'block',
              background: 'linear-gradient(135deg,#1a237e,#3a98f8)',
              borderRadius: 16,
              padding: 16,
              marginBottom: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,.25)',
                  color: '#fff',
                  fontWeight: 900,
                  fontSize: '1.2rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  border: '2px solid rgba(255,255,255,.4)',
                  overflow: 'hidden',
                }}
              >
                {!shell.anonymous && shell.avatarUrl ? (
                  <img src={shell.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  shell.avatarLetter
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, color: '#fff', fontSize: '1rem' }}>{shell.displayName}</div>
                <div style={{ fontSize: '.73rem', color: 'rgba(255,255,255,.75)' }}>{shell.email}</div>
              </div>
              <div style={{ fontSize: '.73rem', fontWeight: 800, color: '#fff', background: 'rgba(255,255,255,.2)', borderRadius: 20, padding: '4px 10px', flexShrink: 0 }}>
                ⭐ {shell.points}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <Link
                to="/account"
                onClick={() => setMobileOpen(false)}
                style={{
                  flex: 1,
                  minWidth: 120,
                  textAlign: 'center',
                  background: 'rgba(255,255,255,.2)',
                  color: '#fff',
                  borderRadius: 10,
                  padding: '10px 12px',
                  fontWeight: 700,
                  textDecoration: 'none',
                  fontSize: '.85rem',
                }}
              >
                Mijn profiel
              </Link>
              <Link
                to="/account/admin-toegang"
                onClick={() => setMobileOpen(false)}
                style={{
                  flex: 1,
                  minWidth: 120,
                  textAlign: 'center',
                  background: 'rgba(255,255,255,.14)',
                  color: '#fff',
                  borderRadius: 10,
                  padding: '10px 12px',
                  fontWeight: 700,
                  textDecoration: 'none',
                  fontSize: '.85rem',
                  border: '1px solid rgba(255,255,255,.28)',
                }}
              >
                Admin meekijken
              </Link>
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false)
                  void logout()
                }}
                style={{
                  flex: 1,
                  minWidth: 120,
                  background: 'rgba(220,38,38,.25)',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,.35)',
                  borderRadius: 10,
                  padding: '10px 12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: '.85rem',
                }}
              >
                Uitloggen
              </button>
            </div>
          </div>
        ) : (
          <Link
            to="/auth"
            style={{
              width: '100%',
              background: 'linear-gradient(135deg,#1a237e,#3a98f8)',
              color: '#fff',
              border: 'none',
              borderRadius: 12,
              padding: '14px 16px',
              fontWeight: 800,
              fontSize: '.93rem',
              textAlign: 'center',
              textDecoration: 'none',
              display: 'block',
              marginBottom: 8,
            }}
          >
            👤 Inloggen / Account aanmaken →
          </Link>
        )}
        <div style={{ height: 1, background: '#e5e7eb', margin: '4px 0 8px' }} />
        {mainNav.map((item) => (
          <NavLink key={item.to} to={item.to} className="nav-link" end={item.end === true}>
            {item.label}
          </NavLink>
        ))}
      </div>

      <Suspense fallback={<RouteOutletFallback />}>
        <Outlet />
      </Suspense>

      <nav className="bottom-nav" role="navigation" aria-label="Mobiele navigatie">
        <div
          className={`bottom-nav-inner${bottomNavItems.length > 6 ? ' bottom-nav-inner--7' : ''}`}
        >
          {bottomNavItems.map((item) => {
            const to = item.icon === 'account' && shell ? '/account' : item.to
            return (
              <NavLink
                key={`${item.label}-${to}`}
                to={to}
                className={({ isActive }) => `bnav-btn${isActive ? ' active' : ''}`}
                end={item.end === true}
              >
                <span className="bnav-icon">
                  <BottomNavIcon name={item.icon} />
                </span>
                <span className="bnav-lbl">{item.label}</span>
              </NavLink>
            )
          })}
        </div>
      </nav>

      <PublicSiteFooter shell={shell} />

      <DonnieChatbot shell={shell} />

      <style>{`
        .skip-link {
          position: absolute;
          top: -999px;
          left: -999px;
          z-index: 99999;
          background: var(--blue, #3a98f8);
          color: #fff;
          padding: 10px 18px;
          border-radius: 0 0 8px 0;
          font-weight: 700;
          font-size: 0.9rem;
        }
        .skip-link:focus {
          top: 0;
          left: 0;
        }
      `}</style>
    </div>
  )
}
