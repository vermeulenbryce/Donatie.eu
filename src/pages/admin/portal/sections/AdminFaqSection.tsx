import { useCallback, useEffect, useState } from 'react'
import {
  deleteFaqItem,
  fetchFaqItemsForAdmin,
  subscribeToTableChanges,
  upsertFaqItem,
  type FaqAdminRow,
} from '../../../../features/admin/adminContentService'

const emptyDraft = {
  id: '',
  category: 'algemeen',
  question: '',
  answer: '',
  sort_order: 0,
  active: true,
  is_basis_slot: false,
  is_placeholder: false,
}

export function AdminFaqSection() {
  const [rows, setRows] = useState<FaqAdminRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [draft, setDraft] = useState<{
    id: string
    category: string
    question: string
    answer: string
    sort_order: number
    active: boolean
    is_basis_slot: boolean
    is_placeholder: boolean
  }>(emptyDraft)

  const load = useCallback(async () => {
    try {
      setRows(await fetchFaqItemsForAdmin())
      setErr(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Laden mislukt.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const unsub = subscribeToTableChanges('site_faq_items', load)
    return () => unsub()
  }, [load])

  async function onSave() {
    if (!draft.question.trim() || !draft.answer.trim()) {
      setErr('Vraag en antwoord zijn verplicht.')
      return
    }
    try {
      const payload: Parameters<typeof upsertFaqItem>[0] = {
        category: draft.category.trim() || (draft.is_basis_slot ? 'basis' : 'algemeen'),
        question: draft.question.trim(),
        answer: draft.answer.trim(),
        sort_order: Number(draft.sort_order) || 0,
        active: draft.active,
      }
      if (draft.id.trim()) payload.id = draft.id
      await upsertFaqItem(payload)
      await load()
      setDraft(emptyDraft)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Opslaan mislukt.')
    }
  }

  async function onDelete(id: string) {
    if (!id.trim()) return
    if (!window.confirm('Dit FAQ-item verwijderen?')) return
    try {
      await deleteFaqItem(id)
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Verwijderen mislukt.')
    }
  }

  function onEdit(row: FaqAdminRow) {
    setDraft({
      id: row.id,
      category: row.category,
      question: row.question,
      answer: row.answer,
      sort_order: row.sort_order,
      active: row.active,
      is_basis_slot: row.is_basis_slot,
      is_placeholder: row.is_placeholder,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div>
      {err ? (
        <div className="admin-portal-card" style={{ borderLeft: '4px solid #dc2626' }}>
          <strong>Fout:</strong> {err}
        </div>
      ) : null}

      <div className="admin-portal-card">
        <h2 className="admin-portal-card-title">
          {draft.is_basis_slot && draft.is_placeholder
            ? 'Basis-slot opslaan'
            : draft.id.trim()
              ? 'Item bewerken'
              : 'Nieuw extra FAQ-item'}
        </h2>
        <p className="admin-portal-card-sub">
          <strong>Basis</strong> = vaste slots (zelfde volgorde als op <code>/faq</code>). Zonder database-rij zie je de
          standaardtekst; met <strong>Opslaan</strong> schrijf je die slot naar de database. <strong>Extra</strong> =
          aanvullende vragen onder de basis. Live op <code>/faq</code>.
        </p>

        <div className="admin-portal-row">
          <input
            className="admin-portal-input"
            placeholder="Categorie (bv. algemeen, doneren, account)"
            value={draft.category}
            onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
          />
          <input
            className="admin-portal-input"
            type="number"
            placeholder="Volgorde (sort_order)"
            value={draft.sort_order}
            onChange={(e) => setDraft((d) => ({ ...d, sort_order: Number(e.target.value) || 0 }))}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.88rem' }}>
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(e) => setDraft((d) => ({ ...d, active: e.target.checked }))}
            />
            Zichtbaar op de publieke pagina
          </label>
        </div>

        <div style={{ marginTop: 12 }}>
          <input
            className="admin-portal-input"
            placeholder="Vraag"
            value={draft.question}
            onChange={(e) => setDraft((d) => ({ ...d, question: e.target.value }))}
          />
        </div>
        <div style={{ marginTop: 12 }}>
          <textarea
            className="admin-portal-textarea"
            placeholder="Antwoord"
            value={draft.answer}
            onChange={(e) => setDraft((d) => ({ ...d, answer: e.target.value }))}
            rows={5}
          />
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <button type="button" className="admin-portal-btn" onClick={() => void onSave()}>
            {draft.is_basis_slot && draft.is_placeholder
              ? 'Opslaan in database'
              : draft.id.trim()
                ? 'Wijzigingen opslaan'
                : 'Toevoegen'}
          </button>
          {draft.id.trim() || draft.is_placeholder ? (
            <button type="button" className="admin-portal-btn is-ghost" onClick={() => setDraft(emptyDraft)}>
              Annuleren
            </button>
          ) : null}
        </div>
      </div>

      <div className="admin-portal-card">
        <h2 className="admin-portal-card-title">Huidige FAQ-items</h2>
        {loading ? (
          <p>Laden…</p>
        ) : rows.length === 0 ? (
          <div className="admin-portal-empty">Nog geen FAQ-items.</div>
        ) : (
          <div className="admin-portal-table-wrap">
            <table className="admin-portal-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Cat.</th>
                <th>Vraag</th>
                <th>Sort</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Acties</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={r.id || `slot-${idx}`}>
                  <td>
                    {r.is_basis_slot ? (
                      <span className="admin-portal-badge ok" title="Vaste basis-slot">
                        Basis
                      </span>
                    ) : (
                      <span className="admin-portal-badge info">Extra</span>
                    )}
                    {r.is_placeholder ? (
                      <div style={{ fontSize: '.72rem', color: '#6b7280', marginTop: 4 }}>Nog niet in DB</div>
                    ) : null}
                  </td>
                  <td><span className="admin-portal-badge info">{r.category}</span></td>
                  <td>
                    <strong>{r.question}</strong>
                    <div style={{ color: '#6b7280', fontSize: '.8rem', marginTop: 4, whiteSpace: 'pre-wrap' }}>
                      {r.answer.slice(0, 180)}
                      {r.answer.length > 180 ? '…' : ''}
                    </div>
                  </td>
                  <td>{r.sort_order}</td>
                  <td>
                    <span className={`admin-portal-badge ${r.active ? 'ok' : 'warn'}`}>
                      {r.active ? 'zichtbaar' : 'verborgen'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button type="button" className="admin-portal-btn is-ghost" onClick={() => onEdit(r)}>Bewerk</button>
                    <button
                      type="button"
                      className="admin-portal-btn is-danger"
                      style={{ marginLeft: 6 }}
                      disabled={!r.id.trim() || r.is_placeholder}
                      title={r.is_placeholder ? 'Sla eerst op om te verwijderen' : undefined}
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
