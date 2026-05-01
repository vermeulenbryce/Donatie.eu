import { useCallback, useEffect, useMemo, useState } from 'react'
import { CBF_CAUSES } from '../../../../features/legacy/cbfCauses.generated'
import {
  adminListUsersByQuizCause,
  deleteSiteCharityCause,
  fetchSiteCharityCauses,
  importAllCbfCausesToSite,
  setAllSiteCharityCausesActive,
  subscribeToTableChanges,
  upsertSiteCharityCause,
  type SiteCharityCauseRow,
} from '../../../../features/admin/adminContentService'

function parseCbfId(key: string): number | null {
  const m = key.match(/^cbf-(\d+)$/i)
  return m ? Number(m[1]) : null
}

function causeMatchesQuery(
  c: { id: number; naam: string; slug?: string; sector?: string; plaats?: string },
  q: string,
): boolean {
  if (!q) return true
  const hay = [String(c.id), c.naam, c.slug ?? '', c.sector ?? '', c.plaats ?? ''].join(' ').toLowerCase()
  return hay.includes(q)
}

function rowMatchesTableQuery(r: SiteCharityCauseRow, qLower: string): boolean {
  if (!qLower) return true
  const base = [r.label, r.cause_key].join(' ').toLowerCase()
  if (base.includes(qLower)) return true
  const id = parseCbfId(r.cause_key)
  if (id == null) return false
  const c = CBF_CAUSES.find((x) => x.id === id)
  return c ? causeMatchesQuery(c, qLower) : false
}

export function AdminGoedeDoelenSection() {
  const [rows, setRows] = useState<SiteCharityCauseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [query, setQuery] = useState('')
  /** Filter op de live tabel (los van de “+ Doel toevoegen”-zoekbalk). */
  const [tableQuery, setTableQuery] = useState('')
  const [allActiveBusy, setAllActiveBusy] = useState(false)
  const [importCbfBusy, setImportCbfBusy] = useState(false)
  const [qpCauseId, setQpCauseId] = useState<number | ''>('')
  const [qpLoad, setQpLoad] = useState(false)
  const [qpErr, setQpErr] = useState<string | null>(null)
  const [qpList, setQpList] = useState<
    { user_id: string; email: string | null; first_name: string | null; last_name: string | null; rank_in_quiz: number | null }[]
  >([])
  const [qpDidSearch, setQpDidSearch] = useState(false)

  const load = useCallback(async () => {
    try {
      const list = await fetchSiteCharityCauses(false)
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
    const unsub = subscribeToTableChanges('site_charity_causes', load)
    return () => unsub()
  }, [load])

  const used = useMemo(() => new Set(rows.map((r) => r.cause_key)), [rows])
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase()
    return CBF_CAUSES.filter((c) => !used.has(`cbf-${c.id}`)).filter((c) => causeMatchesQuery(c, q))
  }, [query, used])

  const candidateCount = candidates.length

  const tableQueryLower = tableQuery.trim().toLowerCase()
  const filteredRows = useMemo(() => {
    if (!tableQueryLower) return rows
    return rows.filter((r) => rowMatchesTableQuery(r, tableQueryLower))
  }, [rows, tableQueryLower])

  async function onAdd(cbfId: number) {
    try {
      const cause = CBF_CAUSES.find((x) => x.id === cbfId)
      if (!cause) return
      const sortOrder = (rows.at(-1)?.sort_order ?? 0) + 10
      const created = await upsertSiteCharityCause({
        cause_key: `cbf-${cbfId}`,
        label: cause.naam,
        active: true,
        sort_order: sortOrder,
      })
      setRows((prev) => [...prev, created].sort((a, b) => a.sort_order - b.sort_order))
      setPickerOpen(false)
      setQuery('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Toevoegen mislukt.')
    }
  }

  async function onToggle(row: SiteCharityCauseRow) {
    const prev = rows
    setRows((list) => list.map((r) => (r.cause_key === row.cause_key ? { ...r, active: !r.active } : r)))
    try {
      await upsertSiteCharityCause({ ...row, active: !row.active })
    } catch (e) {
      setRows(prev)
      setErr(e instanceof Error ? e.message : 'Status wijzigen mislukt.')
    }
  }

  async function onMove(row: SiteCharityCauseRow, direction: -1 | 1) {
    const idx = rows.findIndex((r) => r.cause_key === row.cause_key)
    const other = rows[idx + direction]
    if (!other) return
    const prev = rows
    setRows((list) =>
      list
        .map((r) => {
          if (r.cause_key === row.cause_key) return { ...r, sort_order: other.sort_order }
          if (r.cause_key === other.cause_key) return { ...r, sort_order: row.sort_order }
          return r
        })
        .sort((a, b) => a.sort_order - b.sort_order),
    )
    try {
      await Promise.all([
        upsertSiteCharityCause({ ...row, sort_order: other.sort_order }),
        upsertSiteCharityCause({ ...other, sort_order: row.sort_order }),
      ])
    } catch (e) {
      setRows(prev)
      setErr(e instanceof Error ? e.message : 'Sorteren mislukt.')
    }
  }

  async function onSetAllActive() {
    if (!rows.length) return
    if (
      !window.confirm(
        `Alle ${rows.length} doelen in deze lijst op “zichtbaar” zetten? (Je kunt daarna weer per doel uitzetten.)`,
      )
    ) {
      return
    }
    setAllActiveBusy(true)
    try {
      await setAllSiteCharityCausesActive()
      await load()
      setErr(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Bulk aanpassen mislukt.')
    } finally {
      setAllActiveBusy(false)
    }
  }

  async function onImportFullCbf() {
    if (
      !window.confirm(
        `De volledige CBF-lijst (${CBF_CAUSES.length} doelen) wordt in de database gezet, allemaal op zichtbaar. ` +
          `Publiek tonen o.a. dieren, welzijn, onderwijs op basis van de sector in de CBF-data. ` +
          `Bestaande rijen met dezelfde cause_key worden bijgewerkt. Doorgaan?`,
      )
    ) {
      return
    }
    setImportCbfBusy(true)
    setErr(null)
    try {
      const list = CBF_CAUSES.map((c) => ({ id: c.id, naam: c.naam }))
      const { count } = await importAllCbfCausesToSite(list)
      await load()
      window.alert(`${count} doelen geïmporteerd en op zichtbaar gezet. Per doel blijf je kunnen verbergen.`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Importeren mislukt.')
    } finally {
      setImportCbfBusy(false)
    }
  }

  async function onDelete(row: SiteCharityCauseRow) {
    if (!window.confirm(`"${row.label}" verwijderen uit goede doelen?`)) return
    const prev = rows
    setRows((list) => list.filter((r) => r.cause_key !== row.cause_key))
    try {
      await deleteSiteCharityCause(row.cause_key)
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
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2 className="admin-portal-card-title">Goede doelen beheer (live)</h2>
            <p className="admin-portal-card-sub">
              Deze lijst stuurt live de pagina <code>/goede-doelen</code>. Zodra er <strong>één of meer</strong> rijen
              in de tabel staan, volgt de site die lijst (met sectoren/zoals “Dieren” uit de CBF-data). Voor
              <strong> alle </strong> doelen actief: gebruik de import hieronder. Nieuwe doelen handmatig: standaard
              <strong> zichtbaar</strong>.
            </p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <button
              type="button"
              className="admin-portal-btn"
              disabled={importCbfBusy || allActiveBusy}
              onClick={() => void onImportFullCbf()}
              title="Alle ANBI+CBF-doelen in de database, alles op zichtbaar"
            >
              {importCbfBusy ? 'Importeren…' : `CBF-lijst importeren (${CBF_CAUSES.length}) · alles actief`}
            </button>
            {rows.length > 0 ? (
              <button
                type="button"
                className="admin-portal-btn is-ghost"
                disabled={allActiveBusy || importCbfBusy}
                onClick={() => void onSetAllActive()}
                title="Alle rijen in de database op zichtbaar zetten"
              >
                {allActiveBusy ? 'Bezig…' : 'Alles op zichtbaar'}
              </button>
            ) : null}
            <button
              type="button"
              className="admin-portal-btn is-ghost"
              onClick={() => setPickerOpen((v) => !v)}
              disabled={importCbfBusy}
            >
              + Doel toevoegen
            </button>
          </div>
        </div>

        {pickerOpen ? (
          <div style={{ marginTop: 16, borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
            <input
              autoFocus
              className="admin-portal-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Zoek op naam, sector, plaats of slug…"
            />
            <p className="admin-portal-card-sub" style={{ margin: '8px 0 0' }}>
              {query.trim() ? (
                <>
                  {candidateCount} {candidateCount === 1 ? 'resultaat' : 'resultaten'}
                </>
              ) : (
                <>Alle {candidateCount} beschikbare doelen (ANBI+CBF) — typ om te filteren.</>
              )}
            </p>
            <div style={{ maxHeight: 360, overflowY: 'auto', display: 'grid', gap: 6, marginTop: 8 }}>
              {candidates.length === 0 ? (
                <div className="admin-portal-empty">Geen kandidaten gevonden.</div>
              ) : (
                candidates.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="admin-portal-btn is-ghost"
                    style={{ justifyContent: 'flex-start' }}
                    onClick={() => void onAdd(c.id)}
                  >
                    <span style={{ fontWeight: 800 }}>#{c.id}</span>&nbsp; {c.naam}
                  </button>
                ))
              )}
            </div>
          </div>
        ) : null}
      </div>

      <div className="admin-portal-card">
        {loading ? (
          <p>Laden...</p>
        ) : rows.length === 0 ? (
          <div className="admin-portal-empty">Nog geen doelen in de live tabel. Voeg er een toe.</div>
        ) : (
          <>
            <label className="admin-portal-live-search-label" htmlFor="goede-doelen-live-zoeken">
              Zoek in live lijst
            </label>
            <input
              id="goede-doelen-live-zoeken"
              type="search"
              className="admin-portal-input admin-portal-live-search-input"
              value={tableQuery}
              onChange={(e) => setTableQuery(e.target.value)}
              placeholder="Naam, cause_key, CBF-ID, sector of plaats…"
              autoComplete="off"
              enterKeyHint="search"
              aria-describedby="goede-doelen-live-zoeken-hint"
            />
            <p id="goede-doelen-live-zoeken-hint" className="admin-portal-card-sub" style={{ margin: '10px 0 16px' }}>
              {tableQueryLower ? (
                <>
                  <strong>{filteredRows.length}</strong> van <strong>{rows.length}</strong> doelen
                  {filteredRows.length === 0 ? ' — geen treffers, pas het filter aan.' : null}
                </>
              ) : (
                <>
                  Typ om te filteren op <strong>{rows.length}</strong> doelen in deze lijst.
                </>
              )}
            </p>
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
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={5}>
                        <div className="admin-portal-empty" style={{ border: 'none', margin: 0 }}>
                          Geen doelen gevonden voor dit filter.
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((r) => {
                      const i = rows.findIndex((x) => x.cause_key === r.cause_key)
                      return (
                        <tr key={r.cause_key}>
                          <td>{i >= 0 ? i + 1 : '—'}</td>
                          <td>
                            <strong>{r.label}</strong>
                            <div style={{ color: '#9ca3af', fontSize: '.75rem' }}>{r.cause_key}</div>
                          </td>
                          <td>{r.sort_order}</td>
                          <td>
                            <span className={`admin-portal-badge ${r.active ? 'ok' : 'warn'}`}>
                              {r.active ? 'zichtbaar' : 'verborgen'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button
                              type="button"
                              className="admin-portal-btn is-ghost"
                              onClick={() => void onMove(r, -1)}
                              disabled={i <= 0}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              className="admin-portal-btn is-ghost"
                              onClick={() => void onMove(r, 1)}
                              disabled={i < 0 || i >= rows.length - 1}
                              style={{ marginLeft: 6 }}
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              className="admin-portal-btn is-ghost"
                              onClick={() => void onToggle(r)}
                              style={{ marginLeft: 6 }}
                            >
                              {r.active ? 'Verberg' : 'Toon'}
                            </button>
                            <button
                              type="button"
                              className="admin-portal-btn is-danger"
                              onClick={() => void onDelete(r)}
                              style={{ marginLeft: 6 }}
                            >
                              Verwijder
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="admin-portal-card" style={{ borderLeft: '4px solid #1a237e' }}>
        <h2 className="admin-portal-card-title">Quiz-marketing: gebruikers per doel</h2>
        <p className="admin-portal-card-sub" style={{ marginTop: 0 }}>
          Hoeveel ingelogde gebruikers hadden een CBF-doel in hun <strong>opgeslagen</strong> top-10 quiz-uitslag? Ideaal
          om segmenten te mailen of push-berichten te plannen. Vereist: <code>user_cause_quiz</code> + RPC in{' '}
          <code>docs/SQL_USER_CAUSE_QUIZ.sql</code>.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="admin-portal-card-sub" style={{ margin: 0 }}>
              CBF-doel
            </span>
            <select
              className="admin-portal-input"
              style={{ minWidth: 280 }}
              value={qpCauseId === '' ? '' : String(qpCauseId)}
              onChange={(e) => {
                const v = e.target.value
                setQpCauseId(v ? Number(v) : '')
              }}
            >
              <option value="">— kies —</option>
              {CBF_CAUSES.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.id} {c.naam}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="admin-portal-btn"
            disabled={qpCauseId === '' || qpLoad}
            onClick={async () => {
              if (qpCauseId === '') return
              setQpLoad(true)
              setQpErr(null)
              try {
                const list = await adminListUsersByQuizCause(qpCauseId)
                setQpDidSearch(true)
                setQpList(
                  list.map((r) => ({
                    user_id: r.user_id,
                    email: r.email,
                    first_name: r.first_name,
                    last_name: r.last_name,
                    rank_in_quiz: r.rank_in_quiz,
                  })),
                )
              } catch (e) {
                setQpDidSearch(false)
                setQpList([])
                setQpErr(e instanceof Error ? e.message : 'Laden mislukt.')
              } finally {
                setQpLoad(false)
              }
            }}
          >
            {qpLoad ? 'Laden…' : 'Lijst ophalen'}
          </button>
        </div>
        {qpErr ? <p style={{ color: '#b91c1c' }}>{qpErr}</p> : null}
        {qpDidSearch && !qpLoad && !qpErr ? (
          <p style={{ fontWeight: 800, color: '#1a237e' }}>
            {qpList.length} {qpList.length === 1 ? 'gebruiker' : 'gebruikers'} met dit doel in de quiz-uitslag
          </p>
        ) : null}
        {qpList.length > 0 ? (
          <div className="admin-portal-table-wrap">
            <table className="admin-portal-table" style={{ fontSize: '0.88rem' }}>
              <thead>
                <tr>
                  <th>E-mail</th>
                  <th>Naam</th>
                  <th>Rank in top 10</th>
                  <th>User id</th>
                </tr>
              </thead>
              <tbody>
                {qpList.map((r) => (
                  <tr key={r.user_id}>
                    <td>{r.email ?? '—'}</td>
                    <td>
                      {[r.first_name, r.last_name].filter(Boolean).join(' ') || '—'}
                    </td>
                    <td>{r.rank_in_quiz ?? '—'}</td>
                    <td style={{ color: '#9ca3af' }}>{r.user_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function resolveCauseFromKey(causeKey: string) {
  const id = parseCbfId(causeKey)
  if (id == null) return null
  return CBF_CAUSES.find((x) => x.id === id) ?? null
}
