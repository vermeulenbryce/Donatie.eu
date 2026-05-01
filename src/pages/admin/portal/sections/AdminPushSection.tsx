import { useCallback, useEffect, useState } from 'react'
import {
  adminSearchUsers,
  createPushNotification,
  deleteNotification,
  fetchNotifications,
  subscribeToTableChanges,
  type AdminSearchUserRow,
  type NotificationRow,
} from '../../../../features/admin/adminContentService'

export function AdminPushSection() {
  const [rows, setRows] = useState<NotificationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const [target, setTarget] = useState<AdminSearchUserRow | null>(null)
  const [broadcast, setBroadcast] = useState(true)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<AdminSearchUserRow[]>([])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [icon, setIcon] = useState('📣')
  const [sending, setSending] = useState(false)

  const load = useCallback(async () => {
    try {
      setRows(await fetchNotifications('push'))
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

  useEffect(() => {
    if (broadcast || !search.trim()) {
      setSearchResults([])
      return
    }
    let cancelled = false
    const t = window.setTimeout(async () => {
      try {
        const list = await adminSearchUsers(search, 10)
        if (!cancelled) setSearchResults(list)
      } catch {
        if (!cancelled) setSearchResults([])
      }
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [broadcast, search])

  async function onSend() {
    setErr(null)
    setOk(null)
    if (!title.trim()) {
      setErr('Titel is verplicht.')
      return
    }
    if (!broadcast && !target) {
      setErr('Kies een gebruiker of schakel broadcast in.')
      return
    }
    setSending(true)
    try {
      await createPushNotification({
        targetUserId: broadcast ? null : target!.user_id,
        title: title.trim(),
        body: body.trim() || undefined,
        icon: icon.trim() || undefined,
      })
      setOk(broadcast ? 'Broadcast verzonden naar alle gebruikers.' : 'Push verzonden.')
      setTitle('')
      setBody('')
      setTarget(null)
      setSearch('')
      setSearchResults([])
      setTimeout(() => setOk(null), 3000)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Versturen mislukt.')
    } finally {
      setSending(false)
    }
  }

  async function onDelete(id: string) {
    if (!window.confirm('Pushbericht definitief verwijderen?')) return
    try {
      await deleteNotification(id)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Verwijderen mislukt.')
    }
  }

  return (
    <div>
      {err ? (
        <div className="admin-portal-card" style={{ borderLeft: '4px solid #dc2626' }}>
          <strong>Fout:</strong> {err}
        </div>
      ) : null}
      {ok ? (
        <div className="admin-portal-card" style={{ borderLeft: '4px solid #16a34a' }}>
          {ok}
        </div>
      ) : null}

      <div className="admin-portal-card">
        <h2 className="admin-portal-card-title">Nieuw pushbericht</h2>
        <p className="admin-portal-card-sub">
          Broadcast = zichtbaar voor elke ingelogde gebruiker. Individueel = alleen voor de geselecteerde gebruiker.
        </p>

        <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.88rem' }}>
            <input type="radio" checked={broadcast} onChange={() => setBroadcast(true)} />
            Broadcast (iedereen)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.88rem' }}>
            <input type="radio" checked={!broadcast} onChange={() => setBroadcast(false)} />
            Individuele gebruiker
          </label>
        </div>

        {!broadcast ? (
          <div style={{ marginBottom: 12 }}>
            {target ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 12px',
                  background: '#eff6ff',
                  borderRadius: 8,
                  border: '1.5px solid #bfdbfe',
                }}
              >
                <span style={{ fontSize: '.88rem' }}>
                  <strong>
                    {[target.first_name, target.last_name].filter(Boolean).join(' ') || 'Onbekend'}
                  </strong>{' '}
                  <span style={{ color: '#6b7280' }}>· {target.email ?? target.user_id}</span>
                </span>
                <button
                  type="button"
                  className="admin-portal-btn is-ghost"
                  style={{ marginLeft: 'auto' }}
                  onClick={() => setTarget(null)}
                >
                  Wijzig
                </button>
              </div>
            ) : (
              <>
                <input
                  className="admin-portal-input"
                  placeholder="Zoek gebruiker op naam, e-mail of bedrijfsnaam…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {searchResults.length > 0 ? (
                  <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
                    {searchResults.map((u) => (
                      <button
                        key={u.user_id}
                        type="button"
                        className="admin-portal-btn is-ghost"
                        style={{ justifyContent: 'flex-start', textAlign: 'left' }}
                        onClick={() => setTarget(u)}
                      >
                        <strong>{[u.first_name, u.last_name].filter(Boolean).join(' ') || 'Onbekend'}</strong>
                        &nbsp;·&nbsp;
                        <span style={{ color: '#6b7280', fontWeight: 400 }}>{u.email ?? u.user_id}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : null}

        <div className="admin-portal-row">
          <input
            className="admin-portal-input"
            placeholder="Titel *"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            className="admin-portal-input"
            placeholder="Icon (emoji)"
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
          />
        </div>
        <div style={{ marginTop: 12 }}>
          <textarea
            className="admin-portal-textarea"
            placeholder="Bericht (optioneel)"
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>
        <div style={{ marginTop: 12 }}>
          <button type="button" className="admin-portal-btn" onClick={() => void onSend()} disabled={sending}>
            {sending ? 'Versturen…' : broadcast ? 'Verstuur broadcast' : 'Verstuur push'}
          </button>
        </div>
      </div>

      <div className="admin-portal-card">
        <h2 className="admin-portal-card-title">Verstuurde pushberichten</h2>
        {loading ? (
          <p>Laden…</p>
        ) : rows.length === 0 ? (
          <div className="admin-portal-empty">Nog geen pushberichten verstuurd.</div>
        ) : (
          <div className="admin-portal-table-wrap">
            <table className="admin-portal-table">
            <thead>
              <tr>
                <th>Datum</th>
                <th>Ontvanger</th>
                <th>Bericht</th>
                <th style={{ textAlign: 'right' }}>Acties</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap', fontSize: '.78rem', color: '#6b7280' }}>
                    {new Date(r.created_at).toLocaleString('nl-NL')}
                  </td>
                  <td style={{ fontSize: '.82rem' }}>
                    {r.target_user_id ? r.target_user_id : <span className="admin-portal-badge info">broadcast</span>}
                  </td>
                  <td>
                    <strong>
                      {r.icon ? `${r.icon} ` : ''}
                      {r.title}
                    </strong>
                    {r.body ? (
                      <div style={{ fontSize: '.82rem', color: '#6b7280', marginTop: 4, whiteSpace: 'pre-wrap' }}>
                        {r.body}
                      </div>
                    ) : null}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button type="button" className="admin-portal-btn is-danger" onClick={() => void onDelete(r.id)}>
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
