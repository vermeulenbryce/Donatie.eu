import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  fetchAdminShadowSnapshot,
  subscribeToTableChanges,
  type AdminShadowSnapshot,
} from '../../../../features/admin/adminContentService'

function euro(value: unknown): string {
  const n = Number(value ?? 0)
  return `€ ${n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function AdminShadowViewPage() {
  const { userId } = useParams<{ userId: string }>()
  const [snapshot, setSnapshot] = useState<AdminShadowSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!userId) return
    try {
      setSnapshot(await fetchAdminShadowSnapshot(userId, 25))
      setErr(null)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Laden mislukt.'
      setErr(msg)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void load()
    const unsubs = [
      subscribeToTableChanges('profiles', load),
      subscribeToTableChanges('donations', load),
      subscribeToTableChanges('communities', load),
      subscribeToTableChanges('active_sessions', load),
      subscribeToTableChanges('admin_shadow_grants', load),
    ]
    const poll = window.setInterval(load, 15_000)
    return () => {
      unsubs.forEach((u) => u())
      window.clearInterval(poll)
    }
  }, [load])

  const profile = (snapshot?.profile ?? {}) as Record<string, unknown>
  const donations = useMemo(() => (snapshot?.donations ?? []) as Array<Record<string, unknown>>, [snapshot])
  const memberships = useMemo(
    () => (snapshot?.community_memberships ?? []) as Array<Record<string, unknown>>,
    [snapshot],
  )
  const ownedCommunities = useMemo(
    () => (snapshot?.owned_communities ?? []) as Array<Record<string, unknown>>,
    [snapshot],
  )
  const activeSession = (snapshot?.active_session ?? {}) as Record<string, unknown>

  return (
    <div>
      <div className="admin-portal-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <div>
            <h2 className="admin-portal-card-title">Shadow view</h2>
            <p className="admin-portal-card-sub">Read-only inzage van gebruiker met expliciete toestemming.</p>
          </div>
          <Link to="/admin/sessions" className="admin-portal-btn is-ghost">
            ← Terug naar sessies
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="admin-portal-card">
          <p>Laden…</p>
        </div>
      ) : err ? (
        <div className="admin-portal-card" style={{ borderLeft: '4px solid #dc2626' }}>
          <strong>Fout:</strong> {err === 'shadow_not_granted' ? 'Gebruiker heeft geen meekijktoestemming gegeven.' : err}
        </div>
      ) : (
        <>
          <div className="admin-portal-stats">
            <div className="admin-portal-stat">
              <div className="num">{String(profile.points ?? 0)}</div>
              <div className="lbl">Punten</div>
            </div>
            <div className="admin-portal-stat">
              <div className="num">{euro(profile.total_donated)}</div>
              <div className="lbl">Totaal gedoneerd</div>
            </div>
            <div className="admin-portal-stat">
              <div className="num">{donations.length}</div>
              <div className="lbl">Laatste donaties (lijst)</div>
            </div>
            <div className="admin-portal-stat">
              <div className="num">{memberships.length + ownedCommunities.length}</div>
              <div className="lbl">Communities</div>
            </div>
          </div>

          <div className="admin-portal-card">
            <h3 className="admin-portal-card-title">Profiel</h3>
            <div className="admin-portal-row">
              <div>
                <strong>Naam</strong>
                <div>{`${String(profile.first_name ?? '')} ${String(profile.last_name ?? '')}`.trim() || '—'}</div>
              </div>
              <div>
                <strong>E-mail</strong>
                <div>{String(profile.email ?? '—')}</div>
              </div>
              <div>
                <strong>Type</strong>
                <div>{String(profile.account_type ?? 'individu')}</div>
              </div>
              <div>
                <strong>Vrijwilliger</strong>
                <div>{profile.is_volunteer === true ? 'Ja' : 'Nee'}</div>
              </div>
            </div>
          </div>

          <div className="admin-portal-card">
            <h3 className="admin-portal-card-title">Actieve sessie</h3>
            <div className="admin-portal-row">
              <div>
                <strong>Route</strong>
                <div>{String(activeSession.route ?? '—')}</div>
              </div>
              <div>
                <strong>Laatste heartbeat</strong>
                <div>
                  {activeSession.last_heartbeat
                    ? new Date(String(activeSession.last_heartbeat)).toLocaleString('nl-NL')
                    : '—'}
                </div>
              </div>
              <div>
                <strong>User-Agent</strong>
                <div style={{ fontSize: '.8rem', color: '#4b5563' }}>{String(activeSession.user_agent ?? '—')}</div>
              </div>
            </div>
          </div>

          <div className="admin-portal-card">
            <h3 className="admin-portal-card-title">Laatste donaties</h3>
            {donations.length === 0 ? (
              <div className="admin-portal-empty">Geen donaties gevonden.</div>
            ) : (
              <div className="admin-portal-table-wrap">
                <table className="admin-portal-table">
                  <thead>
                  <tr>
                    <th>Datum</th>
                    <th>Goed doel</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Bedrag</th>
                  </tr>
                  </thead>
                  <tbody>
                  {donations.map((d) => (
                    <tr key={String(d.id)}>
                      <td style={{ fontSize: '.8rem' }}>
                        {new Date(String(d.created_at ?? d.paid_at ?? Date.now())).toLocaleString('nl-NL')}
                      </td>
                      <td>{String(d.charity_name ?? '—')}</td>
                      <td>{String(d.status ?? '—')}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{euro(d.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="admin-portal-card">
            <h3 className="admin-portal-card-title">Community-lidmaatschappen</h3>
            {memberships.length === 0 && ownedCommunities.length === 0 ? (
              <div className="admin-portal-empty">Geen communities.</div>
            ) : (
              <div className="admin-portal-row">
                {ownedCommunities.map((c) => (
                  <div key={`own-${String(c.id)}`} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12 }}>
                    <strong>{String(c.name ?? 'Community')}</strong>
                    <div style={{ fontSize: '.8rem', color: '#6b7280' }}>Eigenaar · {String(c.kind ?? '—')}</div>
                  </div>
                ))}
                {memberships.map((m) => (
                  <div key={`m-${String(m.community_id)}`} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12 }}>
                    <strong>{String(m.name ?? 'Community')}</strong>
                    <div style={{ fontSize: '.8rem', color: '#6b7280' }}>
                      Rol: {String(m.role ?? 'member')} · {String(m.kind ?? '—')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
