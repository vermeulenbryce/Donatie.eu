import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  deleteSiteShopItem,
  fetchSiteShopItems,
  subscribeToTableChanges,
  upsertSiteShopItem,
  type SiteShopItemRow,
} from '../../../../features/admin/adminContentService'

const emptyDraft = {
  id: '',
  title: '',
  description: '',
  cost: 100,
  stock: 999,
  emoji: '🎁',
  active: true,
  sort_order: 100,
}

function FieldHint({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: '.78rem', color: '#6b7280', marginTop: 4, lineHeight: 1.45 }}>{children}</div>
}

function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor?: string
  children: ReactNode
}) {
  return (
    <label htmlFor={htmlFor} style={{ fontSize: '.85rem', fontWeight: 700, color: '#1f2937', display: 'block' }}>
      {children}
    </label>
  )
}

export function AdminShopSection() {
  const [rows, setRows] = useState<SiteShopItemRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [draft, setDraft] = useState(emptyDraft)

  const load = useCallback(async () => {
    try {
      setRows(await fetchSiteShopItems())
      setErr(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Laden mislukt.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const unsub = subscribeToTableChanges('site_shop_items', load)
    return () => unsub()
  }, [load])

  async function onSave() {
    if (!draft.title.trim()) {
      setErr('Titel is verplicht.')
      return
    }
    try {
      const payload: Partial<SiteShopItemRow> & { title: string; cost: number } = {
        title: draft.title.trim(),
        description: draft.description.trim() || null,
        cost: Math.max(0, Number(draft.cost) || 0),
        stock: Math.max(0, Number(draft.stock) || 0),
        emoji: draft.emoji.trim() || null,
        active: draft.active,
        sort_order: Number(draft.sort_order) || 0,
      }
      if (draft.id) payload.id = draft.id
      const saved = await upsertSiteShopItem(payload)
      setRows((list) => {
        const idx = list.findIndex((r) => r.id === saved.id)
        if (idx === -1) return [...list, saved].sort((a, b) => a.sort_order - b.sort_order)
        const next = list.slice()
        next[idx] = saved
        return next.sort((a, b) => a.sort_order - b.sort_order)
      })
      setDraft(emptyDraft)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Opslaan mislukt.')
    }
  }

  async function onDelete(id: string) {
    if (!window.confirm('Product definitief verwijderen?')) return
    const prev = rows
    setRows((list) => list.filter((r) => r.id !== id))
    try {
      await deleteSiteShopItem(id)
    } catch (e) {
      setRows(prev)
      setErr(e instanceof Error ? e.message : 'Verwijderen mislukt.')
    }
  }

  function onEdit(row: SiteShopItemRow) {
    setDraft({
      id: row.id,
      title: row.title,
      description: row.description ?? '',
      cost: row.cost,
      stock: row.stock,
      emoji: row.emoji ?? '',
      active: row.active,
      sort_order: row.sort_order,
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
        <h2 className="admin-portal-card-title">{draft.id ? 'Product bewerken' : 'Nieuw product'}</h2>
        <p className="admin-portal-card-sub">
          Gegevens gaan naar <code>public.site_shop_items</code>. Wat je hier invult, zien gebruikers op de{' '}
          <strong>publieke puntenwinkel</strong> (titels, beschrijving, prijs in punten, voorraad, volgorde).
        </p>

        <div style={{ display: 'grid', gap: 18, marginTop: 8 }}>
          <div>
            <FieldLabel htmlFor="shop-title">Naam van het item</FieldLabel>
            <input
              id="shop-title"
              className="admin-portal-input"
              style={{ width: '100%', maxWidth: 520 }}
              placeholder="Bijv. Weekje weg – voucher"
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            />
            <FieldHint>Hoofdtitel op de kaart in de winkel. Verplicht.</FieldHint>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
            <div>
              <FieldLabel htmlFor="shop-emoji">Emoji (icoon)</FieldLabel>
              <input
                id="shop-emoji"
                className="admin-portal-input"
                placeholder="Één emoji, bijv. 🎁"
                value={draft.emoji}
                onChange={(e) => setDraft((d) => ({ ...d, emoji: e.target.value }))}
              />
              <FieldHint>Dit pictogram verschijnt op de productkaart naast de titel.</FieldHint>
            </div>
            <div>
              <FieldLabel htmlFor="shop-cost">Prijs in punten</FieldLabel>
              <input
                id="shop-cost"
                className="admin-portal-input"
                type="number"
                min={0}
                value={draft.cost}
                onChange={(e) => setDraft((d) => ({ ...d, cost: Number(e.target.value) || 0 }))}
              />
              <FieldHint>
                Hoeveel <strong>platformpunten</strong> een gebruiker kwijtraakt bij inwisselen (kolom <code>cost</code>
                ).
              </FieldHint>
            </div>
            <div>
              <FieldLabel htmlFor="shop-stock">Voorraad</FieldLabel>
              <input
                id="shop-stock"
                className="admin-portal-input"
                type="number"
                min={0}
                value={draft.stock}
                onChange={(e) => setDraft((d) => ({ ...d, stock: Number(e.target.value) || 0 }))}
              />
              <FieldHint>Maximaal aantal keer beschikbaar; gebruik bv. <code>999</code> als praktisch onbeperkt.</FieldHint>
            </div>
            <div>
              <FieldLabel htmlFor="shop-sort">Sorteer­volgorde</FieldLabel>
              <input
                id="shop-sort"
                className="admin-portal-input"
                type="number"
                value={draft.sort_order}
                onChange={(e) => setDraft((d) => ({ ...d, sort_order: Number(e.target.value) || 0 }))}
              />
              <FieldHint>
                Lagere waarde = hoger in de lijst. Items met dezelfde volgorde volgen op vaste ordening uit de DB.
              </FieldHint>
            </div>
          </div>

          <div>
            <FieldLabel htmlFor="shop-desc">Beschrijving (onder de titel)</FieldLabel>
            <textarea
              id="shop-desc"
              className="admin-portal-textarea"
              placeholder="Korte uitleg wat de gebruiker krijgt of hoe inwisseling werkt."
              rows={4}
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            />
            <FieldHint>Zichtbare tekst op de kaart/subregel bij het product (<code>description</code>).</FieldHint>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.9rem', fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(e) => setDraft((d) => ({ ...d, active: e.target.checked }))}
              />
              Zichtbaar in de puntenwinkel
            </label>
            <div style={{ flex: '1 1 220px' }}>
              <FieldHint>Uit = item verborgen (<code>active = false</code>), maar niet gewist uit de database.</FieldHint>
            </div>

          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" className="admin-portal-btn" onClick={() => void onSave()}>
              {draft.id ? 'Wijzigingen opslaan' : 'Toevoegen'}
            </button>
            {draft.id ? (
              <button type="button" className="admin-portal-btn is-ghost" onClick={() => setDraft(emptyDraft)}>
                Annuleren
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="admin-portal-card">
        <h2 className="admin-portal-card-title">Alle producten</h2>
        {loading ? (
          <p>Laden…</p>
        ) : rows.length === 0 ? (
          <div className="admin-portal-empty">Nog geen producten.</div>
        ) : (
          <div className="admin-portal-table-wrap">
            <table className="admin-portal-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Kosten</th>
                <th>Voorraad</th>
                <th>Volgorde</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Acties</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span style={{ fontSize: '1.1rem', marginRight: 6 }}>{r.emoji ?? '•'}</span>
                    <strong>{r.title}</strong>
                    {r.description ? (
                      <div style={{ fontSize: '.78rem', color: '#6b7280', marginTop: 2 }}>{r.description}</div>
                    ) : null}
                  </td>
                  <td>{r.cost} pt</td>
                  <td>{r.stock}</td>
                  <td>{r.sort_order}</td>
                  <td>
                    <span className={`admin-portal-badge ${r.active ? 'ok' : 'warn'}`}>
                      {r.active ? 'actief' : 'verborgen'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button type="button" className="admin-portal-btn is-ghost" onClick={() => onEdit(r)}>Bewerk</button>
                    <button
                      type="button"
                      className="admin-portal-btn is-danger"
                      style={{ marginLeft: 6 }}
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
