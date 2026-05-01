import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchAdminDashboardStats,
  subscribeToTableChanges,
  type AdminDashboardStats,
} from '../../../../features/admin/adminContentService'

function euro(n: number | null | undefined) {
  return `€ ${Number(n ?? 0).toLocaleString('nl-NL', { maximumFractionDigits: 0 })}`
}
function int(n: number | null | undefined) {
  return Number(n ?? 0).toLocaleString('nl-NL')
}

/** Totaal profielen; max met som types vangt randgevallen waarin RPC-afwijkend is. */
function totalAccountsDisplayed(s: AdminDashboardStats | null): number {
  if (!s) return 0
  const alle = Number(s.users_total) || 0
  const somTypes =
    (Number(s.users_individu) || 0) + (Number(s.users_bedrijf) || 0) + (Number(s.users_influencer) || 0)
  return Math.max(alle, somTypes)
}

export function AdminDashboardSection() {
  const [stats, setStats] = useState<AdminDashboardStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const s = await fetchAdminDashboardStats()
      setStats(s)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Stats laden mislukt.')
    }
  }, [])

  useEffect(() => {
    void load()
    const unsubs = [
      subscribeToTableChanges('donations', load),
      subscribeToTableChanges('profiles', load),
      subscribeToTableChanges('communities', load),
      subscribeToTableChanges('active_sessions', load),
      subscribeToTableChanges('volunteer_requests', load),
      subscribeToTableChanges('collectant_requests', load),
    ]
    const interval = window.setInterval(load, 30_000)
    return () => {
      unsubs.forEach((u) => u())
      window.clearInterval(interval)
    }
  }, [load])

  return (
    <div>
      {error ? (
        <div className="admin-portal-card" style={{ borderLeft: '4px solid #dc2626' }}>
          <strong>Fout:</strong> {error}
        </div>
      ) : null}

      <div className="admin-portal-stats">
        <div className="admin-portal-stat">
          <div className="num">{int(totalAccountsDisplayed(stats))}</div>
          <div className="lbl">Totaal accounts</div>
          <div className="lbl" style={{ fontSize: '0.72rem', opacity: 0.85, marginTop: 4, fontWeight: 500 }}>
            Incl. particulier, bedrijf & influencer
          </div>
        </div>
        <div className="admin-portal-stat">
          <div className="num">{int(stats?.users_individu)}</div>
          <div className="lbl">Particulieren</div>
        </div>
        <div className="admin-portal-stat">
          <div className="num">{int(stats?.users_bedrijf)}</div>
          <div className="lbl">Bedrijven</div>
        </div>
        <div className="admin-portal-stat">
          <div className="num">{int(stats?.users_influencer)}</div>
          <div className="lbl">Influencers</div>
        </div>
        <div className="admin-portal-stat">
          <div className="num">{int(stats?.communities_total)}</div>
          <div className="lbl">Communities</div>
        </div>
        <div className="admin-portal-stat">
          <div className="num">{euro(stats?.total_donated_paid)}</div>
          <div className="lbl">Totaal gedoneerd (paid)</div>
        </div>
        <div className="admin-portal-stat">
          <div className="num">{int(stats?.total_points_distributed)}</div>
          <div className="lbl">Punten uitgedeeld</div>
        </div>
        <div className="admin-portal-stat">
          <div className="num">{int(stats?.active_sessions_5min)}</div>
          <div className="lbl">Online (laatste 5 min)</div>
        </div>
        <div className="admin-portal-stat">
          <div className="num">{int(stats?.volunteer_requests_open)}</div>
          <div className="lbl">Open vrijwilligerverzoeken</div>
        </div>
        <div className="admin-portal-stat">
          <div className="num">{int(stats?.collectant_requests_open ?? 0)}</div>
          <div className="lbl">Open collectantverzoeken</div>
        </div>
      </div>

      <div className="admin-portal-card">
        <h2 className="admin-portal-card-title">Snelle acties</h2>
        <p className="admin-portal-card-sub">Realtime gekoppeld. Wijzigingen verschijnen direct op de publieke site.</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link to="/admin/featured" className="admin-portal-btn">★ Uitgelichte doelen</Link>
          <Link to="/admin/nieuws" className="admin-portal-btn is-blue">▤ Nieuwsbericht plaatsen</Link>
          <Link to="/admin/faq" className="admin-portal-btn is-ghost">? FAQ bewerken</Link>
        </div>
      </div>

    </div>
  )
}
