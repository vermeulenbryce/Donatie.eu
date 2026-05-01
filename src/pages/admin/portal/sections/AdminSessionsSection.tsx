import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchAdminActiveSessions,
  subscribeToTableChanges,
  type AdminActiveSessionRow,
} from '../../../../features/admin/adminContentService'

function minutesAgo(ts: string): number {
  const ms = Date.now() - new Date(ts).getTime()
  return Math.max(0, Math.floor(ms / 60000))
}

export function AdminSessionsSection() {
  const [rows, setRows] = useState<AdminActiveSessionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const load = useCallback(async () => {
    try {
      /** Alleen RPC: `admin_list_active_sessions` join al `admin_shadow_grants`.
       * Een tweede client-fetch + merge met `??` gaf verouderde `false` in de map door — dan bleef
       * “niet toegestaan” staan terwijl de database (en RPC) al `true` hadden. */
      const sessions = await fetchAdminActiveSessions(15)
      setRows(sessions)
      setErr(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Laden mislukt.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const unsubs = [
      subscribeToTableChanges('active_sessions', load),
      subscribeToTableChanges('admin_shadow_grants', load),
      subscribeToTableChanges('profiles', load),
    ]
    const poll = window.setInterval(load, 5_000)
    return () => {
      unsubs.forEach((u) => u())
      window.clearInterval(poll)
    }
  }, [load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const name = `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim().toLowerCase()
      return (
        name.includes(q) ||
        (r.email ?? '').toLowerCase().includes(q) ||
        (r.route ?? '').toLowerCase().includes(q)
      )
    })
  }, [rows, query])

  return (
    <div>
      {err ? (
        <div className="admin-portal-card" style={{ borderLeft: '4px solid #dc2626' }}>
          <strong>Fout:</strong> {err}
        </div>
      ) : null}

      <div className="admin-portal-card">
        <h2 className="admin-portal-card-title">Actieve sessies</h2>
        <p className="admin-portal-card-sub">
          Toont gebruikers met recente heartbeat. Zoek op naam, e-mail of route.
        </p>
        <input
          className="admin-portal-input"
          placeholder="Zoek gebruiker..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ maxWidth: 380 }}
        />
      </div>

      <div className="admin-portal-card">
        {loading ? (
          <p>Laden…</p>
        ) : filtered.length === 0 ? (
          <div className="admin-portal-empty">Geen actieve sessies gevonden.</div>
        ) : (
          <div className="admin-portal-table-wrap">
            <table className="admin-portal-table">
            <thead>
              <tr>
                <th>Gebruiker</th>
                <th>Type</th>
                <th>Route</th>
                <th>Laatst gezien</th>
                <th>Meekijken</th>
                <th style={{ textAlign: 'right' }}>Actie</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const mins = minutesAgo(r.last_heartbeat)
                return (
                  <tr key={r.user_id}>
                    <td>
                      <strong>{[r.first_name, r.last_name].filter(Boolean).join(' ') || 'Onbekend'}</strong>
                      <div style={{ fontSize: '.78rem', color: '#6b7280' }}>{r.email ?? r.user_id}</div>
                    </td>
                    <td>{r.account_type ?? 'individu'}</td>
                    <td style={{ fontSize: '.8rem', color: '#4b5563' }}>{r.route ?? '—'}</td>
                    <td style={{ fontSize: '.8rem', color: '#4b5563' }}>
                      {mins <= 1 ? 'zojuist' : `${mins} min geleden`}
                    </td>
                    <td>
                      <span className={`admin-portal-badge ${r.shadow_granted ? 'ok' : 'warn'}`}>
                        {r.shadow_granted ? 'toegestaan' : 'niet toegestaan'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Link
                        to={`/admin/shadow/${r.user_id}`}
                        className={`admin-portal-btn${r.shadow_granted ? '' : ' is-ghost'}`}
                        title={r.shadow_granted ? 'Open shadow view' : 'Geen toestemming: pagina toont waarschuwing'}
                      >
                        Bekijk
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  )
}
