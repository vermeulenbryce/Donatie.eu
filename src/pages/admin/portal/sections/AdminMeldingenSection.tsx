import { useCallback, useEffect, useState } from 'react'
import {
  deleteNotification,
  fetchNotifications,
  markNotificationRead,
  subscribeToTableChanges,
  type NotificationRow,
} from '../../../../features/admin/adminContentService'

export function AdminMeldingenSection() {
  const [rows, setRows] = useState<NotificationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setRows(await fetchNotifications('melding'))
      setErr(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Laden mislukt.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const unsub = subscribeToTableChanges('site_notifications', load)
    return () => unsub()
  }, [load])

  async function onRead(id: string) {
    try {
      await markNotificationRead(id)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Markeren mislukt.')
    }
  }

  async function onDelete(id: string) {
    if (!window.confirm('Melding verwijderen?')) return
    try {
      await deleteNotification(id)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Verwijderen mislukt.')
    }
  }

  const unread = rows.filter((r) => !r.read_at).length

  return (
    <div>
      {err ? (
        <div className="admin-portal-card" style={{ borderLeft: '4px solid #dc2626' }}>
          <strong>Fout:</strong> {err}
        </div>
      ) : null}

      <div className="admin-portal-card">
        <h2 className="admin-portal-card-title">Meldingen uit het platform</h2>
        <p className="admin-portal-card-sub">
          {unread > 0 ? `${unread} ongelezen` : 'Alles gelezen'} — realtime via{' '}
          <code>public.site_notifications</code> (type=<code>melding</code>).
        </p>
      </div>

      <div className="admin-portal-card">
        {loading ? (
          <p>Laden…</p>
        ) : rows.length === 0 ? (
          <div className="admin-portal-empty">Geen meldingen.</div>
        ) : (
          <div className="admin-portal-table-wrap">
            <table className="admin-portal-table">
            <thead>
              <tr>
                <th>Datum</th>
                <th>Van</th>
                <th>Onderwerp</th>
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
                  <td style={{ fontSize: '.8rem' }}>{r.from_user_id ?? 'systeem'}</td>
                  <td>
                    <strong>{r.title}</strong>
                    {r.body ? (
                      <div style={{ fontSize: '.82rem', color: '#6b7280', marginTop: 4, whiteSpace: 'pre-wrap' }}>
                        {r.body}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <span className={`admin-portal-badge ${r.read_at ? 'ok' : 'warn'}`}>
                      {r.read_at ? 'gelezen' : 'ongelezen'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {!r.read_at ? (
                      <button type="button" className="admin-portal-btn is-ghost" onClick={() => void onRead(r.id)}>
                        Markeer gelezen
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="admin-portal-btn is-danger"
                      style={{ marginLeft: 6 }}
                      onClick={() => void onDelete(r.id)}
                    >
                      Verwijder
                    </button>
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
