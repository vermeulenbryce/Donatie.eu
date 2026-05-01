import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchAdminFinanceOverview,
  subscribeToTableChanges,
  type AdminFinanceOverview,
} from '../../../../features/admin/adminContentService'

const PERIODS = [7, 30, 90] as const

function euro(n: number) {
  return `€ ${Number(n ?? 0).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function int(n: number) {
  return Number(n ?? 0).toLocaleString('nl-NL')
}

export function AdminFinanceSection() {
  const [days, setDays] = useState<number>(30)
  const [stats, setStats] = useState<AdminFinanceOverview | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const s = await fetchAdminFinanceOverview(days)
      setStats(s)
      setErr(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Laden mislukt.')
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => {
    setLoading(true)
    void load()
  }, [load])

  useEffect(() => {
    const unsub = subscribeToTableChanges('donations', load)
    return () => unsub()
  }, [load])

  const payFlex = stats ? Math.max(0, Number(stats.paid_total)) : 0
  const refFlex = stats ? Math.max(0, Number(stats.refunded_total)) : 0
  const barTotal = payFlex + refFlex

  return (
    <div>
      {err ? (
        <div className="admin-portal-card" style={{ borderLeft: '4px solid #dc2626' }}>
          <strong>Fout:</strong> {err}
        </div>
      ) : null}

      <div className="admin-portal-card">
        <h2 className="admin-portal-card-title">Financieel overzicht</h2>
        <p className="admin-portal-card-sub">
          Totalen binnen de gekozen periode (vanaf vandaag terug), op basis van Mollie-donaties. Realtime: nieuwe
          betalingen verschijnen automatisch.
        </p>
        <div className="admin-portal-period-toolbar">
          {PERIODS.map((d) => (
            <button
              key={d}
              type="button"
              className={`admin-portal-btn${days === d ? ' is-blue' : ' is-ghost'}`}
              onClick={() => setDays(d)}
            >
              {d} dagen
            </button>
          ))}
          <Link to="/admin/betalingen" className="admin-portal-btn is-ghost admin-portal-period-toolbar-link">
            → Naar betalingen
          </Link>
        </div>
      </div>

      {loading && !stats ? (
        <div className="admin-portal-card">
          <p>Laden…</p>
        </div>
      ) : stats ? (
        <>
          <div className="admin-portal-stats">
            <div className="admin-portal-stat">
              <div className="num">{euro(stats.paid_total)}</div>
              <div className="lbl">Betaald (periode)</div>
            </div>
            <div className="admin-portal-stat">
              <div className="num">{int(stats.paid_count)}</div>
              <div className="lbl">Betaalde transacties</div>
            </div>
            <div className="admin-portal-stat">
              <div className="num">{euro(stats.refunded_total)}</div>
              <div className="lbl">Terugbetaald (totaal bedrag)</div>
            </div>
            <div className="admin-portal-stat">
              <div className="num">{int(stats.refunded_count)}</div>
              <div className="lbl">Terugboekingen (aantal)</div>
            </div>
            <div className="admin-portal-stat">
              <div className="num">{int(stats.pending_count)}</div>
              <div className="lbl">Open (pending)</div>
            </div>
            <div className="admin-portal-stat">
              <div className="num">{int(stats.cancelled_count)}</div>
              <div className="lbl">Geannuleerd</div>
            </div>
          </div>

          <div className="admin-portal-card">
            <h3 className="admin-portal-card-title" style={{ fontSize: '1rem' }}>
              Verhouding betaald t.o.v. terugbetaald (bedrag, in periode)
            </h3>
            <div
              style={{
                display: 'flex',
                height: 14,
                borderRadius: 7,
                overflow: 'hidden',
                background: '#e5e7eb',
                marginTop: 10,
              }}
              title={`Betaald: ${euro(stats.paid_total)} · Terugbetaald: ${euro(stats.refunded_total)}`}
            >
              {barTotal === 0 ? (
                <div style={{ flex: 1, background: '#e5e7eb' }} />
              ) : (
                <>
                  <div
                    style={{
                      flex: payFlex,
                      minWidth: payFlex > 0 ? 4 : 0,
                      background: 'linear-gradient(90deg, #059669, #10b981)',
                    }}
                  />
                  <div
                    style={{
                      flex: refFlex,
                      minWidth: refFlex > 0 ? 4 : 0,
                      background: 'linear-gradient(90deg, #b45309, #d97706)',
                    }}
                  />
                </>
              )}
            </div>
            <p className="admin-portal-card-sub" style={{ marginTop: 10, marginBottom: 0 }}>
              Periode: <strong>{stats.period_days}</strong> dagen. Statussen komen rechtstreeks uit de donatietabel; zie
              betalingen voor detailregels.
            </p>
          </div>
        </>
      ) : null}
    </div>
  )
}
