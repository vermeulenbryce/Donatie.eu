import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchAdminDonationsForProject,
  fetchAdminProjectsList,
  subscribeToTableChanges,
  type AdminProjectListRow,
  type DonationAdminRow,
} from '../../../../features/admin/adminContentService'

function euro(n: number | null | undefined): string {
  return `€ ${Number(n ?? 0).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function donationFinancial(d: DonationAdminRow): { net: number; isRefund: boolean } {
  const st = String(d.status ?? '').toLowerCase()
  if (st === 'refunded') return { net: -Math.abs(Number(d.amount) || 0), isRefund: true }
  const paid = st === 'paid'
  if (!paid) return { net: 0, isRefund: false }
  const toCharity = d.amount_to_charity != null ? Number(d.amount_to_charity) : Number(d.amount) || 0
  return { net: toCharity, isRefund: false }
}

export function AdminProjectsSection() {
  const [projects, setProjects] = useState<AdminProjectListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [detailErr, setDetailErr] = useState<string | null>(null)
  const [donRows, setDonRows] = useState<DonationAdminRow[] | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setProjects(await fetchAdminProjectsList(search, 600))
      setErr(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Laden mislukt.')
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    void load()
    const u1 = subscribeToTableChanges('projects', load)
    const u2 = subscribeToTableChanges('donations', load)
    return () => {
      u1()
      u2()
    }
  }, [load])

  const loadDetail = useCallback(async (projectId: string) => {
    try {
      setDetailLoading(true)
      setDetailErr(null)
      setDonRows(await fetchAdminDonationsForProject(projectId))
    } catch (e) {
      setDetailErr(e instanceof Error ? e.message : 'Donaties ophalen mislukt.')
      setDonRows([])
    } finally {
      setDetailLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!openId) {
      setDonRows(null)
      return
    }
    void loadDetail(openId)
  }, [openId, loadDetail])

  const totalsByProject = useMemo(() => {
    const m = new Map<string, { paid: number; refunded: number; pending: number; countPaid: number }>()
    /** Wordt alleen gevuld bij open project; andere projecten gebruiken kolomhints. */
    if (!donRows?.length || !openId) return m
    let paid = 0
    let refunded = 0
    let pending = 0
    let countPaid = 0
    for (const d of donRows) {
      const st = String(d.status ?? '').toLowerCase()
      if (st === 'refunded') refunded += Number(d.amount) || 0
      else if (st === 'paid') {
        paid += donationFinancial(d).net
        countPaid += 1
      } else if (st === 'pending') pending += Number(d.amount) || 0
    }
    m.set(openId, { paid, refunded, pending, countPaid })
    return m
  }, [donRows, openId])

  return (
    <div>
      {err ? (
        <div className="admin-portal-card" style={{ borderLeft: '4px solid #dc2626' }}>
          <strong>Fout:</strong> {err}
        </div>
      ) : null}

      <div className="admin-portal-card">
        <h2 className="admin-portal-card-title">Projecten</h2>
        <p className="admin-portal-card-sub">
          Live uit <code>public.projects</code> met donateur- en bedragsoverzicht per project (
          <code>donations.project_id</code>). Zoek op titel of beschrijving. Inkomsten voor goede doelen lopen — net als
          andere donaties — via de reguliere doelenregistratie in Supabase.
        </p>
        <input
          className="admin-portal-input"
          placeholder="Zoek op projectnaam of beschrijving…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 420 }}
        />
      </div>

      <div className="admin-portal-card">
        {loading ? (
          <p>Laden…</p>
        ) : projects.length === 0 ? (
          <div className="admin-portal-empty">Geen projecten gevonden.</div>
        ) : (
          <div className="admin-portal-table-wrap">
            <table className="admin-portal-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Status</th>
                  <th>Zicht.</th>
                  <th style={{ textAlign: 'right' }}>Doel</th>
                  <th style={{ textAlign: 'right' }}>Opgehaald (snapshot)</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <Fragment key={p.id}>
                    <tr>
                      <td>
                        <strong>{p.title}</strong>
                        <div style={{ fontSize: '.72rem', color: '#6b7280', fontFamily: 'monospace', marginTop: 2 }}>
                          {p.id}
                        </div>
                      </td>
                      <td>{p.status}</td>
                      <td>{p.visibility ?? '—'}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{euro(p.target_amount)}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                        {euro(p.raised_hint)}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="admin-portal-badge info"
                          style={{ cursor: 'pointer', border: 'none' }}
                          onClick={() => setOpenId((prev) => (prev === p.id ? null : p.id))}
                        >
                          {openId === p.id ? 'Verberg ▲' : 'Detail ▼'}
                        </button>
                      </td>
                    </tr>
                    {openId === p.id ? (
                      <tr key={`${p.id}-detail`}>
                        <td colSpan={6} style={{ background: '#f8fafc', padding: '16px 18px', borderBottom: '1px solid #e2e8f0' }}>
                          {detailErr ? (
                            <div style={{ color: '#991b1b' }}>{detailErr}</div>
                          ) : detailLoading ? (
                            <span>Donaties laden…</span>
                          ) : (
                            <div>
                              {(() => {
                                const t = totalsByProject.get(p.id)
                                return (
                                  <div
                                    style={{
                                      display: 'flex',
                                      flexWrap: 'wrap',
                                      gap: '12px 24px',
                                      marginBottom: 14,
                                      fontSize: '.86rem',
                                    }}
                                  >
                                    <span>
                                      <strong>Betaalde donaties naar goede doelen (som):</strong> {t ? euro(t.paid) : '—'}
                                    </span>
                                    <span>
                                      <strong>Aantal betaald:</strong> {t?.countPaid ?? '—'}
                                    </span>
                                    <span style={{ color: '#dc2626' }}>
                                      <strong>Teruggevorderd:</strong> {t ? euro(t.refunded) : '—'}
                                    </span>
                                    <span style={{ color: '#b45309' }}>
                                      <strong>Hangend:</strong> {t ? euro(t.pending) : '—'}
                                    </span>
                                  </div>
                                )
                              })()}
                              {!donRows || donRows.length === 0 ? (
                                <div className="admin-portal-empty" style={{ margin: 0 }}>
                                  Geen gekoppelde donatieregistraties voor dit project.
                                </div>
                              ) : (
                                <table className="admin-portal-table" style={{ fontSize: '.82rem' }}>
                                  <thead>
                                    <tr>
                                      <th>Datum</th>
                                      <th>Donateur</th>
                                      <th style={{ textAlign: 'right' }}>Bedrag</th>
                                      <th>Status</th>
                                      <th>Toegewezen NN goed doel</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {donRows!.map((d) => {
                                      const { net, isRefund } = donationFinancial(d)
                                      const refunded = String(d.status).toLowerCase() === 'refunded'
                                      return (
                                        <tr key={d.id} style={refunded ? { background: '#fef2f2' } : undefined}>
                                          <td style={{ whiteSpace: 'nowrap', color: '#6b7280' }}>
                                            {new Date(d.paid_at ?? d.created_at).toLocaleString('nl-NL')}
                                          </td>
                                          <td>
                                            <strong>{d.donor_name ?? '—'}</strong>
                                            <div style={{ fontSize: '.72rem', color: '#64748b' }}>{d.donor_email ?? d.donor_user_id ?? '—'}</div>
                                          </td>
                                          <td
                                            style={{
                                              textAlign: 'right',
                                              fontWeight: 700,
                                              color: refunded ? '#dc2626' : '#111827',
                                              fontVariantNumeric: 'tabular-nums',
                                            }}
                                          >
                                            {isRefund ? `− ${euro(Math.abs(net))}` : euro(Number(d.amount))}
                                          </td>
                                          <td>
                                            <span
                                              className={`admin-portal-badge ${
                                                String(d.status).toLowerCase() === 'paid' ? 'ok' : refunded ? 'err' : 'info'
                                              }`}
                                            >
                                              {d.status}
                                            </span>
                                          </td>
                                          <td style={{ fontSize: '.76rem', color: '#64748b' }}>
                                            {d.charity_name ?? '—'}{' '}
                                            {d.amount_to_charity != null ? (
                                              <span style={{ marginLeft: 6 }}>(toewijzing {euro(d.amount_to_charity)})</span>
                                            ) : null}
                                          </td>
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
