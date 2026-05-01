import { useCallback, useEffect, useMemo, useState } from 'react'
import { CBF_CAUSES } from '../../../../features/legacy/cbfCauses.generated'
import {
  addFeaturedCause,
  deleteFeaturedCause,
  fetchFeaturedCauses,
  subscribeToTableChanges,
  updateFeaturedCause,
  type FeaturedCauseRow,
} from '../../../../features/admin/adminContentService'

function parseCbfId(key: string): number | null {
  const m = key.match(/^cbf-(\d+)$/i)
  return m ? Number(m[1]) : null
}

export function AdminFeaturedSection() {
  const [rows, setRows] = useState<FeaturedCauseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [query, setQuery] = useState('')

  const load = useCallback(async () => {
    try {
      const list = await fetchFeaturedCauses()
      setRows(list)
      setErr(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Laden mislukt.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const unsub = subscribeToTableChanges('site_featured_causes', load)
    return () => unsub()
  }, [load])

  const usedKeys = useMemo(() => new Set(rows.map((r) => r.cause_key)), [rows])
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase()
    return CBF_CAUSES.filter((c) => !usedKeys.has(`cbf-${c.id}`))
      .filter((c) => {
        if (!q) return true
        const hay = [String(c.id), c.naam, c.slug, c.sector, c.plaats].join(' ').toLowerCase()
        return hay.includes(q)
      })
  }, [usedKeys, query])

  async function onAdd(cbfId: number) {
    try {
      const sort = (rows.at(-1)?.sort_order ?? 0) + 10
      const created = await addFeaturedCause(`cbf-${cbfId}`, sort)
      setRows((prev) => [...prev, created].sort((a, b) => a.sort_order - b.sort_order))
      setPickerOpen(false)
      setQuery('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Toevoegen mislukt.')
    }
  }

  async function onToggle(row: FeaturedCauseRow) {
    const prev = rows
    setRows((list) => list.map((r) => (r.id === row.id ? { ...r, active: !r.active } : r)))
    try {
      await updateFeaturedCause(row.id, { active: !row.active })
    } catch (e) {
      setRows(prev)
      setErr(e instanceof Error ? e.message : 'Bijwerken mislukt.')
    }
  }

  async function onMove(row: FeaturedCauseRow, direction: -1 | 1) {
    const idx = rows.findIndex((r) => r.id === row.id)
    const other = rows[idx + direction]
    if (!other) return
    const prev = rows
    setRows((list) =>
      list
        .map((r) => {
          if (r.id === row.id) return { ...r, sort_order: other.sort_order }
          if (r.id === other.id) return { ...r, sort_order: row.sort_order }
          return r
        })
        .sort((a, b) => a.sort_order - b.sort_order),
    )
    try {
      await Promise.all([
        updateFeaturedCause(row.id, { sort_order: other.sort_order }),
        updateFeaturedCause(other.id, { sort_order: row.sort_order }),
      ])
    } catch (e) {
      setRows(prev)
      setErr(e instanceof Error ? e.message : 'Volgorde wijzigen mislukt.')
    }
  }

  async function onRemove(row: FeaturedCauseRow) {
    if (!window.confirm(`"${labelFor(row.cause_key)}" verwijderen uit uitgelichte doelen?`)) return
    const prev = rows
    setRows((list) => list.filter((r) => r.id !== row.id))
    try {
      await deleteFeaturedCause(row.id)
    } catch (e) {
      setRows(prev)
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

      <div className="admin-portal-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div>
            <h2 className="admin-portal-card-title">Uitgelichte doelen op de homepage</h2>
            <p className="admin-portal-card-sub">
              Staat live in sync met <code>public.site_featured_causes</code>. Wijzigingen verschijnen direct op de
              homepage voor alle bezoekers.
            </p>
          </div>
          <button type="button" className="admin-portal-btn" onClick={() => setPickerOpen((v) => !v)}>
            + Doel toevoegen
          </button>
        </div>

        {pickerOpen ? (
          <div style={{ marginTop: 16, borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
            <input
              autoFocus
              className="admin-portal-input"
              placeholder="Zoek CBF-doel op naam…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ marginBottom: 12 }}
            />
            <div style={{ maxHeight: 260, overflowY: 'auto', display: 'grid', gap: 6 }}>
              {candidates.length === 0 ? (
                <div className="admin-portal-empty">Geen doelen gevonden.</div>
              ) : (
                candidates.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => void onAdd(c.id)}
                    className="admin-portal-btn is-ghost"
                    style={{ justifyContent: 'flex-start', textAlign: 'left' }}
                  >
                    <span style={{ fontWeight: 800 }}>#{c.id}</span> &nbsp;{c.naam}
                  </button>
                ))
              )}
            </div>
          </div>
        ) : null}
      </div>

      <div className="admin-portal-card">
        {loading ? (
          <p>Laden…</p>
        ) : rows.length === 0 ? (
          <div className="admin-portal-empty">Nog geen uitgelichte doelen.</div>
        ) : (
          <div className="admin-portal-table-wrap">
            <table className="admin-portal-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Doel</th>
                <th>Sort</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Acties</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id}>
                  <td>{i + 1}</td>
                  <td>
                    <strong>{labelFor(r.cause_key)}</strong>
                    <div style={{ color: '#9ca3af', fontSize: '.75rem' }}>{r.cause_key}</div>
                  </td>
                  <td>{r.sort_order}</td>
                  <td>
                    <span className={`admin-portal-badge ${r.active ? 'ok' : 'warn'}`}>
                      {r.active ? 'zichtbaar' : 'verborgen'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button type="button" className="admin-portal-btn is-ghost" onClick={() => void onMove(r, -1)} disabled={i === 0}>↑</button>
                    <button type="button" className="admin-portal-btn is-ghost" onClick={() => void onMove(r, 1)} disabled={i === rows.length - 1} style={{ marginLeft: 6 }}>↓</button>
                    <button type="button" className="admin-portal-btn is-ghost" onClick={() => void onToggle(r)} style={{ marginLeft: 6 }}>
                      {r.active ? 'Verberg' : 'Toon'}
                    </button>
                    <button type="button" className="admin-portal-btn is-danger" onClick={() => void onRemove(r)} style={{ marginLeft: 6 }}>
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

function labelFor(causeKey: string): string {
  const id = parseCbfId(causeKey)
  if (id == null) return causeKey
  const c = CBF_CAUSES.find((x) => x.id === id)
  return c?.naam ?? causeKey
}
