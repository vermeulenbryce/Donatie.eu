import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchAdminCommunitiesList,
  subscribeToTableChanges,
  type AdminCommunityListRow,
} from '../../../../features/admin/adminContentService'

function ownerLabel(r: AdminCommunityListRow) {
  const name = [r.owner_first_name, r.owner_last_name]
    .map((s) => (s ?? '').trim())
    .filter(Boolean)
    .join(' ')
  if (name) return name
  return r.owner_email ?? r.owner_user_id
}

export function AdminInfluencersSection() {
  const [rows, setRows] = useState<AdminCommunityListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [kind, setKind] = useState<'all' | 'bedrijf' | 'influencer'>('all')
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    try {
      setRows(await fetchAdminCommunitiesList())
      setErr(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Laden mislukt.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const u1 = subscribeToTableChanges('communities', load)
    const u2 = subscribeToTableChanges('community_members', load)
    const u3 = subscribeToTableChanges('profiles', load)
    return () => {
      u1()
      u2()
      u3()
    }
  }, [load])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (kind !== 'all' && r.kind !== kind) return false
      if (!needle) return true
      return (
        r.name.toLowerCase().includes(needle) ||
        r.join_code.toLowerCase().includes(needle) ||
        r.id.toLowerCase().includes(needle) ||
        (r.slug ?? '').toLowerCase().includes(needle) ||
        (r.owner_email ?? '').toLowerCase().includes(needle) ||
        ownerLabel(r).toLowerCase().includes(needle)
      )
    })
  }, [rows, kind, q])

  const bedrijfCount = useMemo(() => rows.filter((r) => r.kind === 'bedrijf').length, [rows])
  const inflCount = useMemo(() => rows.filter((r) => r.kind === 'influencer').length, [rows])

  return (
    <div>
      {err ? (
        <div className="admin-portal-card" style={{ borderLeft: '4px solid #dc2626' }}>
          <strong>Fout:</strong> {err}
          {/permission|policy|row-level|rls/i.test(err) ? (
            <p style={{ marginTop: 8, fontSize: '.88rem' }}>
              Controleer of <code>docs/SQL_ADMIN_INFLUENCERS_COMMUNITIES_READ.sql</code> in Supabase is uitgevoerd.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="admin-portal-card">
        <h2 className="admin-portal-card-title">Influencers &amp; Communities</h2>
        <p className="admin-portal-card-sub">
          Alle communities (bedrijf en influencer) met eigenaar en aantal leden. Data uit{' '}
          <code>communities</code> en <code>community_members</code>; realtime op wijzigingen.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {(['all', 'bedrijf', 'influencer'] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={`admin-portal-btn ${kind === f ? '' : 'is-ghost'}`}
              onClick={() => setKind(f)}
            >
              {f === 'all' && `Alle (${rows.length})`}
              {f === 'bedrijf' && `Bedrijf (${bedrijfCount})`}
              {f === 'influencer' && `Influencer (${inflCount})`}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <label style={{ display: 'flex', flex: '1 1 220px', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: '.78rem', fontWeight: 700, color: '#6b7280' }}>Zoeken</span>
            <input
              type="search"
              className="admin-portal-input"
              placeholder="Naam, code, e-mail, ID…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Zoek communities"
            />
          </label>
          <a className="admin-portal-btn is-ghost" href="/communities" target="_blank" rel="noreferrer">
            Publieke communities-pagina
          </a>
        </div>
      </div>

      <div className="admin-portal-card">
        {loading ? (
          <p>Laden…</p>
        ) : filtered.length === 0 ? (
          <div className="admin-portal-empty">
            {rows.length === 0 ? 'Nog geen communities.' : 'Geen resultaten met dit filter / zoekterm.'}
          </div>
        ) : (
          <div className="admin-portal-table-wrap">
            <table className="admin-portal-table">
              <thead>
                <tr>
                  <th>Community</th>
                  <th>Soort</th>
                  <th>Leden</th>
                  <th>Join code</th>
                  <th>Eigenaar</th>
                  <th>Aangemaakt</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.name}</strong>
                      {r.slug ? (
                        <div style={{ fontSize: '.76rem', color: '#6b7280' }}>slug: {r.slug}</div>
                      ) : null}
                      <div style={{ fontSize: '.72rem', color: '#9ca3af', fontFamily: 'ui-monospace, monospace' }}>
                        {r.id}
                      </div>
                    </td>
                    <td>
                      <span className={`admin-portal-badge ${r.kind === 'bedrijf' ? 'ok' : 'info'}`}>{r.kind}</span>
                    </td>
                    <td>{r.member_count}</td>
                    <td style={{ fontFamily: 'ui-monospace, monospace', fontSize: '.85rem' }}>{r.join_code}</td>
                    <td>
                      <div>{ownerLabel(r)}</div>
                      {r.owner_email ? (
                        <div style={{ fontSize: '.78rem', color: '#6b7280' }}>{r.owner_email}</div>
                      ) : null}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '.78rem', color: '#6b7280' }}>
                      {new Date(r.created_at).toLocaleString('nl-NL')}
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
