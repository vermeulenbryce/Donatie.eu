import { useCallback, useEffect, useState } from 'react'
import {
  fetchAdminDonations,
  subscribeToTableChanges,
  type DonationAdminRow,
} from '../../../../features/admin/adminContentService'

function euro(n: number | null | undefined): string {
  return `€ ${Number(n ?? 0).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function AdminPaymentsSection() {
  const [rows, setRows] = useState<DonationAdminRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setRows(await fetchAdminDonations(200, query))
      setErr(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Laden mislukt.')
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => {
    void load()
    const unsub = subscribeToTableChanges('donations', load)
    return () => unsub()
  }, [load])

  return (
    <div>
      {err ? (
        <div className="admin-portal-card" style={{ borderLeft: '4px solid #dc2626' }}>
          <strong>Fout:</strong> {err}
        </div>
      ) : null}

      <div className="admin-portal-card">
        <h2 className="admin-portal-card-title">Betalingen</h2>
        <p className="admin-portal-card-sub">
          Realtime — elk Mollie-webhook-update (paid / refunded / cancelled) verschijnt direct.
          <strong style={{ color: '#dc2626' }}> Refunds in rood.</strong>
        </p>
        <input
          className="admin-portal-input"
          placeholder="Zoek op donor-mail, naam of goed doel…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ maxWidth: 400 }}
        />
      </div>

      <div className="admin-portal-card">
        {loading ? (
          <p>Laden…</p>
        ) : rows.length === 0 ? (
          <div className="admin-portal-empty">Geen betalingen gevonden.</div>
        ) : (
          <div className="admin-portal-table-wrap">
            <table className="admin-portal-table">
            <thead>
              <tr>
                <th>Datum</th>
                <th>Donor</th>
                <th>Goed doel</th>
                <th style={{ textAlign: 'right' }}>Bedrag</th>
                <th>Status</th>
                <th>Methode</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const refunded = String(r.status).toLowerCase() === 'refunded'
                const cancelled = String(r.status).toLowerCase() === 'cancelled'
                const paid = String(r.status).toLowerCase() === 'paid'
                return (
                  <tr key={r.id} style={refunded ? { background: '#fef2f2' } : undefined}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '.78rem', color: '#6b7280' }}>
                      {new Date(r.paid_at ?? r.created_at).toLocaleString('nl-NL')}
                    </td>
                    <td>
                      <strong>{r.donor_name ?? '—'}</strong>
                      <div style={{ fontSize: '.76rem', color: '#6b7280' }}>{r.donor_email ?? r.donor_user_id ?? '—'}</div>
                    </td>
                    <td>{r.charity_name ?? '—'}</td>
                    <td
                      style={{
                        textAlign: 'right',
                        color: refunded ? '#dc2626' : '#111827',
                        fontWeight: 700,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {refunded ? `− ${euro(r.amount)}` : euro(r.amount)}
                    </td>
                    <td>
                      <span
                        className={`admin-portal-badge ${
                          paid ? 'ok' : refunded ? 'err' : cancelled ? 'warn' : 'info'
                        }`}
                        style={refunded ? { textTransform: 'uppercase', letterSpacing: '.05em' } : undefined}
                      >
                        {refunded ? 'Gerefund' : r.status}
                      </span>
                    </td>
                    <td style={{ fontSize: '.78rem', color: '#6b7280' }}>{r.payment_method ?? '—'}</td>
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
