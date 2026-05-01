import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchVolunteerRequests,
  setVolunteerRequestStatus,
  subscribeToTableChanges,
  type VolunteerRequestWithProfile,
} from '../../../../features/admin/adminContentService'

export function AdminVolunteerSection() {
  const [rows, setRows] = useState<VolunteerRequestWithProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending')

  const load = useCallback(async () => {
    try {
      const list = await fetchVolunteerRequests(filter === 'all' ? undefined : filter)
      setRows(list)
      setErr(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Laden mislukt.')
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    void load()
    const unsub = subscribeToTableChanges('volunteer_requests', load)
    return () => unsub()
  }, [load])

  const counts = useMemo(() => {
    return {
      pending: rows.filter((r) => r.status === 'pending').length,
      approved: rows.filter((r) => r.status === 'approved').length,
      rejected: rows.filter((r) => r.status === 'rejected').length,
    }
  }, [rows])

  async function onApprove(id: string) {
    try {
      await setVolunteerRequestStatus(id, 'approved')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Goedkeuren mislukt.')
    }
  }

  async function onReject(id: string) {
    const note = window.prompt('Reden (optioneel):') ?? ''
    try {
      await setVolunteerRequestStatus(id, 'rejected', note || undefined)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Afwijzen mislukt.')
    }
  }

  return (
    <div>
      {err ? (
        <div className="admin-portal-card" style={{ borderLeft: '4px solid #dc2626' }}>
          <strong>Fout:</strong> {err}
        </div>
      ) : null}

      <div className="admin-portal-card">
        <h2 className="admin-portal-card-title">Vrijwilliger verzoeken</h2>
        <p className="admin-portal-card-sub">
          Goedkeuren zet automatisch <code>profiles.is_volunteer = true</code> (via DB-trigger).
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(['pending', 'approved', 'rejected', 'all'] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={`admin-portal-btn ${filter === f ? '' : 'is-ghost'}`}
              onClick={() => setFilter(f)}
            >
              {f === 'pending' && `Openstaand (${counts.pending})`}
              {f === 'approved' && `Goedgekeurd (${counts.approved})`}
              {f === 'rejected' && `Afgewezen (${counts.rejected})`}
              {f === 'all' && 'Alle'}
            </button>
          ))}
        </div>
      </div>

      <div className="admin-portal-card">
        {loading ? (
          <p>Laden…</p>
        ) : rows.length === 0 ? (
          <div className="admin-portal-empty">Geen verzoeken in deze categorie.</div>
        ) : (
          <div className="admin-portal-table-wrap">
            <table className="admin-portal-table">
            <thead>
              <tr>
                <th>Aangevraagd</th>
                <th>Gebruiker</th>
                <th>Motivatie</th>
                <th>Beschikbaarheid</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Acties</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap', fontSize: '.78rem', color: '#6b7280' }}>
                    {new Date(r.created_at).toLocaleString('nl-NL')}
                  </td>
                  <td>
                    <strong>{[r.first_name, r.last_name].filter(Boolean).join(' ') || '—'}</strong>
                    <div style={{ fontSize: '.78rem', color: '#6b7280' }}>{r.email ?? r.user_id}</div>
                    {r.phone ? <div style={{ fontSize: '.78rem', color: '#6b7280' }}>📞 {r.phone}</div> : null}
                  </td>
                  <td style={{ maxWidth: 360, whiteSpace: 'pre-wrap' }}>{r.motivation ?? '—'}</td>
                  <td style={{ fontSize: '.82rem' }}>{r.availability ?? '—'}</td>
                  <td>
                    <span
                      className={`admin-portal-badge ${
                        r.status === 'approved' ? 'ok' : r.status === 'rejected' ? 'err' : 'warn'
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {r.status === 'pending' ? (
                      <>
                        <button type="button" className="admin-portal-btn" onClick={() => void onApprove(r.id)}>
                          Goedkeuren
                        </button>
                        <button
                          type="button"
                          className="admin-portal-btn is-danger"
                          style={{ marginLeft: 6 }}
                          onClick={() => void onReject(r.id)}
                        >
                          Afwijzen
                        </button>
                      </>
                    ) : r.status === 'approved' ? (
                      <button
                        type="button"
                        className="admin-portal-btn is-danger"
                        onClick={() => void onReject(r.id)}
                      >
                        Intrekken
                      </button>
                    ) : (
                      <button type="button" className="admin-portal-btn" onClick={() => void onApprove(r.id)}>
                        Alsnog goedkeuren
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  )
}
