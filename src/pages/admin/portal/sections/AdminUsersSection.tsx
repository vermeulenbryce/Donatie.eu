import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminUserCauseQuizPanel } from '../../../../components/admin/AdminUserCauseQuizPanel'
import { CBF_CAUSES } from '../../../../features/legacy/cbfCauses.generated'
import {
  adminSearchUsers,
  subscribeToTableChanges,
  type AdminSearchUserRow,
} from '../../../../features/admin/adminContentService'

const PAGE_SIZE = 25

function displayName(r: AdminSearchUserRow) {
  const n = [r.first_name, r.last_name].filter(Boolean).join(' ').trim()
  return n || '—'
}

function euro(n: number) {
  return `€ ${Number(n ?? 0).toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function int(n: number) {
  return Number(n ?? 0).toLocaleString('nl-NL')
}

function when(ts: string | null) {
  if (!ts) return '—'
  try {
    return new Date(ts).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return ts
  }
}

function whenDateShort(ts: string | null) {
  if (!ts) return '—'
  try {
    return new Date(ts).toLocaleString('nl-NL', { dateStyle: 'short' })
  } catch {
    return ts
  }
}

export function AdminUsersSection() {
  const [input, setInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState<AdminSearchUserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [quizForUser, setQuizForUser] = useState<string | null>(null)
  /** CBF doel-ids: toon alleen gebruikers met minstens één id in opgeslagen quiz. Leeg = geen extra filter. */
  const [filterQuizCauseIds, setFilterQuizCauseIds] = useState<number[]>([])
  const [causeAddQuery, setCauseAddQuery] = useState('')

  const causePickList = useMemo(() => {
    const q = causeAddQuery.trim().toLowerCase()
    if (!q) return CBF_CAUSES.slice(0, 12)
    return CBF_CAUSES.filter(
      (c) =>
        c.naam.toLowerCase().includes(q) || String(c.id).includes(q) || (c.sector && c.sector.toLowerCase().includes(q)),
    ).slice(0, 20)
  }, [causeAddQuery])

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const list = await adminSearchUsers(
        search,
        PAGE_SIZE,
        page * PAGE_SIZE,
        filterQuizCauseIds.length ? filterQuizCauseIds : null,
      )
      setRows(list)
      setErr(null)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Laden mislukt.'
      setErr(
        msg.includes('function') && msg.includes('admin_search_users')
          ? `${msg} Voer o.a. uit: docs/SQL_FIX_USER_CAUSE_QUIZ_ADMIN_READ_FILTER.sql (quiz-kolom + filter) of docs/SQL_USER_CAUSE_QUIZ.sql.`
          : msg,
      )
    } finally {
      setLoading(false)
    }
  }, [search, page, filterQuizCauseIds])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const t = window.setTimeout(() => {
      setSearch(input.trim())
      setPage(0)
    }, 400)
    return () => window.clearTimeout(t)
  }, [input])

  useEffect(() => {
    setPage(0)
  }, [filterQuizCauseIds])

  useEffect(() => {
    const unsubs = [
      subscribeToTableChanges('profiles', load),
      subscribeToTableChanges('user_cause_quiz', load),
    ]
    return () => unsubs.forEach((u) => u())
  }, [load])

  const canPrev = page > 0
  const canNext = rows.length === PAGE_SIZE

  return (
    <div>
      {err ? (
        <div className="admin-portal-card" style={{ borderLeft: '4px solid #dc2626' }}>
          <strong>Fout:</strong> {err}
        </div>
      ) : null}

      <div className="admin-portal-card">
        <h2 className="admin-portal-card-title">Gebruikersoverzicht</h2>
        <p className="admin-portal-card-sub">
          Zoek op e-mail, voor- of achternaam, bedrijfs- of influencernaam. Lees via{' '}
          <code>admin_search_users</code> (veilig, alleen platform-admin). Voor meekijken: link naar de shadow-weergave.
        </p>
        <input
          className="admin-portal-input"
          placeholder="Zoek… (leeg = alle gebruikers, nieuwste eerst)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          style={{ maxWidth: 420 }}
        />
        <p className="admin-portal-card-sub" style={{ marginTop: 8, marginBottom: 0 }}>
          {PAGE_SIZE} per pagina · pagina {page + 1}
        </p>

        <div
          style={{
            marginTop: 16,
            padding: 14,
            background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)',
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            maxWidth: 720,
          }}
        >
          <div style={{ fontWeight: 800, fontSize: '0.8rem', marginBottom: 8, color: '#0f172a' }}>Optioneel: filter op quiz-uitslag</div>
          <p className="admin-portal-card-sub" style={{ marginTop: 0, marginBottom: 8 }}>
            Toon alleen accounts waar minstens één van de gekozen CBF-doelen in de opgeslagen top-10 staat. Leeg = alle
            accounts (zonder filter op doelen).
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <input
              className="admin-portal-input"
              placeholder="Zoek doel op naam, id of sector…"
              value={causeAddQuery}
              onChange={(e) => setCauseAddQuery(e.target.value)}
              style={{ flex: 1, minWidth: 200 }}
            />
            <button
              type="button"
              className="admin-portal-btn is-ghost"
              disabled={filterQuizCauseIds.length === 0}
              onClick={() => setFilterQuizCauseIds([])}
            >
              Wis filter
            </button>
          </div>
          {causePickList.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {causePickList.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="admin-portal-btn is-ghost"
                  style={{ fontSize: '0.78rem' }}
                  disabled={filterQuizCauseIds.includes(c.id)}
                  onClick={() => setFilterQuizCauseIds((prev) => (prev.includes(c.id) ? prev : [...prev, c.id]))}
                >
                  + #{c.id} {c.naam.length > 36 ? `${c.naam.slice(0, 34)}…` : c.naam}
                </button>
              ))}
            </div>
          ) : null}
          {filterQuizCauseIds.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              {filterQuizCauseIds.map((id) => {
                const name = CBF_CAUSES.find((c) => c.id === id)?.naam ?? `#${id}`
                return (
                  <span
                    key={id}
                    className="admin-portal-badge ok"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px' }}
                  >
                    {name}
                    <button
                      type="button"
                      onClick={() => setFilterQuizCauseIds((p) => p.filter((x) => x !== id))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 900, lineHeight: 1 }}
                      title="Verwijder uit filter"
                      aria-label="Verwijder"
                    >
                      ×
                    </button>
                  </span>
                )
              })}
            </div>
          ) : null}
        </div>
      </div>

      <div className="admin-portal-card">
        {loading ? (
          <p>Laden…</p>
        ) : rows.length === 0 ? (
          <div className="admin-portal-empty">Geen resultaten. Pas je zoekopdracht aan.</div>
        ) : (
          <>
            <div className="admin-portal-table-wrap">
              <table className="admin-portal-table">
            <thead>
              <tr>
                <th>E-mail</th>
                <th>Naam</th>
                <th>Type</th>
                <th>Punten</th>
                <th>Doneer totaal</th>
                <th>Account sinds</th>
                <th style={{ textAlign: 'center' }}>Quiz</th>
                <th style={{ textAlign: 'right' }}>Acties</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.user_id}>
                  <td>{r.email ?? '—'}</td>
                  <td>{displayName(r)}</td>
                  <td>
                    {r.account_type ?? '—'}
                    {r.is_admin ? (
                      <span className="admin-portal-badge ok" style={{ marginLeft: 6 }}>
                        admin
                      </span>
                    ) : null}
                    {r.is_volunteer ? (
                      <span className="admin-portal-badge" style={{ marginLeft: 4 }}>
                        vrijwilliger
                      </span>
                    ) : null}
                  </td>
                  <td>{int(r.points)}</td>
                  <td>{euro(r.total_donated)}</td>
                  <td style={{ color: '#6b7280', fontSize: '.85rem' }}>{when(r.created_at)}</td>
                  <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                    {r.quiz_completed_at ? (
                      <div
                        title={`Quiz gedaan: ${whenDateShort(r.quiz_completed_at)}`}
                        style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}
                      >
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 28,
                            height: 28,
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, #d1fae5, #a7f3d0)',
                            color: '#065f46',
                            fontWeight: 900,
                            fontSize: 15,
                            lineHeight: 1,
                            border: '1.5px solid #6ee7b7',
                          }}
                          aria-label="Quiz voltooid"
                        >
                          ✓
                        </span>
                        <span style={{ fontSize: 10, color: '#059669', fontWeight: 600, maxWidth: 88, lineHeight: 1.2 }}>
                          {whenDateShort(r.quiz_completed_at)}
                        </span>
                      </div>
                    ) : (
                      <div title="Nog geen quiz" style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 28,
                            height: 28,
                            borderRadius: '50%',
                            background: '#f3f4f6',
                            color: '#9ca3af',
                            fontWeight: 900,
                            fontSize: 15,
                            lineHeight: 1,
                            border: '1.5px solid #e5e7eb',
                          }}
                          aria-label="Geen quiz"
                        >
                          ✗
                        </span>
                        <span style={{ fontSize: 10, color: '#9ca3af' }}>—</span>
                      </div>
                    )}
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {r.quiz_completed_at ? (
                      <button
                        type="button"
                        className="admin-portal-btn is-ghost"
                        onClick={() => setQuizForUser(r.user_id)}
                      >
                        Uitslag
                      </button>
                    ) : null}
                    <Link to={`/admin/shadow/${r.user_id}`} className="admin-portal-btn is-ghost">
                      Meekijken
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
            </div>
            {quizForUser ? <AdminUserCauseQuizPanel userId={quizForUser} onClose={() => setQuizForUser(null)} /> : null}
          </>
        )}

        {!loading && rows.length > 0 ? (
          <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="admin-portal-btn is-ghost"
              disabled={!canPrev}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Vorige
            </button>
            <button
              type="button"
              className="admin-portal-btn is-ghost"
              disabled={!canNext}
              onClick={() => setPage((p) => p + 1)}
            >
              Volgende
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
