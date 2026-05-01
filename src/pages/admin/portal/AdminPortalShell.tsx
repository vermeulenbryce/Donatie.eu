import { Suspense, useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ADMIN_SECTION_GROUPS, ADMIN_SECTIONS, type AdminSectionId } from './adminNav'
import { clearAdminSession, isAdminSessionOk } from '../adminSession'
import { fetchIsPlatformAdmin, signOutAdminSupabase } from '../../../features/admin/adminAccess'
import { useLiveBrandingSettings } from '../../../features/public/brandingLive'
import '../../../styles/donatie-admin-portal.css'
import { RouteOutletFallback } from '../../../components/RouteOutletFallback'

function sectionIdFromPath(pathname: string): AdminSectionId {
  const last = pathname.split('/').filter(Boolean).pop() ?? 'dashboard'
  const found = ADMIN_SECTIONS.find((s) => s.id === last)
  return found?.id ?? 'dashboard'
}

export function AdminPortalShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [supabaseAdmin, setSupabaseAdmin] = useState<boolean | null>(null)
  const branding = useLiveBrandingSettings()

  useEffect(() => {
    if (!isAdminSessionOk()) {
      navigate('/admin/login', { replace: true })
      return
    }
    let cancelled = false
    void fetchIsPlatformAdmin().then((ok) => {
      if (!cancelled) setSupabaseAdmin(ok)
    })
    return () => {
      cancelled = true
    }
  }, [navigate])

  const activeSectionId = useMemo(() => sectionIdFromPath(location.pathname), [location.pathname])
  const activeSection = ADMIN_SECTIONS.find((s) => s.id === activeSectionId) ?? ADMIN_SECTIONS[0]

  useEffect(() => {
    setMobileOpen(false)
  }, [activeSectionId])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 719px)')
    const syncBody = () => {
      if (!mq.matches || !mobileOpen) {
        document.body.style.overflow = ''
        return
      }
      document.body.style.overflow = 'hidden'
    }
    syncBody()
    mq.addEventListener('change', syncBody)
    return () => {
      mq.removeEventListener('change', syncBody)
      document.body.style.overflow = ''
    }
  }, [mobileOpen])

  async function onLogout() {
    await signOutAdminSupabase()
    clearAdminSession()
    navigate('/admin/login', { replace: true })
  }

  /** Ook bij tweede klik op de actieve link is er geen route-change; menu moet wél dicht. */
  function closeMobileNav() {
    setMobileOpen(false)
  }

  return (
    <div className="admin-portal-shell">
      <div className="admin-portal-mobilebar">
        <strong style={{ fontFamily: 'Fraunces,serif' }}>Donatie.eu • Admin</strong>
        <button type="button" onClick={() => setMobileOpen((v) => !v)}>
          {mobileOpen ? 'Sluit menu' : 'Menu'}
        </button>
      </div>

      <aside className={`admin-portal-sidebar${mobileOpen ? ' is-mobile-open' : ''}`}>
        <div className="admin-portal-sidebar-head">
          <Link
            to="/admin"
            style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}
            onClick={closeMobileNav}
          >
            <img src={branding.logoAdminUrl || branding.logoNavUrl || '/logo-nav.jpg'} alt="" />
            <strong>Donatie.eu</strong>
            <span className="badge">Admin</span>
          </Link>
        </div>

        <nav className="admin-portal-nav" aria-label="Admin navigatie">
          {ADMIN_SECTION_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="admin-portal-nav-section">{group.label}</div>
              {group.items.map((item) => (
                <NavLink
                  key={item.id}
                  to={`/admin/${item.id}`}
                  className={({ isActive }) =>
                    `admin-portal-nav-item${isActive ? ' is-active' : ''}${item.livePhase1 ? '' : ' is-wip'}`
                  }
                  end={item.id === 'dashboard'}
                  onClick={closeMobileNav}
                >
                  <span className="icon" aria-hidden>
                    {item.icon}
                  </span>
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="admin-portal-sidebar-foot">
          <div className="avatar">A</div>
          <div className="who">
            <strong>Admin</strong>
            {supabaseAdmin === false ? (
              <span style={{ color: '#fde68a' }}>Geen Supabase-rol</span>
            ) : supabaseAdmin === true ? (
              <span>Supabase verbonden</span>
            ) : (
              <span>Verbinden…</span>
            )}
          </div>
          <button type="button" className="logout" onClick={() => void onLogout()}>
            Uitloggen
          </button>
        </div>
      </aside>

      <main className="admin-portal-main">
        <div className="admin-portal-main-inner">
          <div className="admin-portal-topbar">
            <div>
              <h1>{activeSection.label}</h1>
              <p>{activeSection.group}</p>
            </div>
            {supabaseAdmin === false ? (
              <span className="admin-portal-badge warn">
                Deze admin heeft geen <code>raw_app_meta_data.role = 'admin'</code> in Supabase. Read-only.
              </span>
            ) : null}
          </div>

          <Suspense fallback={<RouteOutletFallback />}>
            <Outlet />
          </Suspense>
        </div>
      </main>
    </div>
  )
}
