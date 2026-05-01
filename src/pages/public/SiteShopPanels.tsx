import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  confirmSiteShopRedemption,
  createSiteShopItem,
  deleteSiteShopItem,
  fetchSiteShopItems,
  fetchMyPendingPoints,
  isPlatformAdmin,
  listSiteShopRedemptionsForAdmin,
  redeemSiteShopItem,
  updateSiteShopItem,
  type SiteShopItem,
  type SiteShopRedemption,
} from '../../features/shop/siteShopService'
import { supabase } from '../../lib/supabase'

const DEFAULT_EMOJIS = ['🎁', '🎉', '⭐', '💎', '🏆', '☕', '🍕', '🎟️', '👕', '💚', '📦']

function translateError(err: string | undefined): string {
  const map: Record<string, string> = {
    not_authenticated: 'Je bent niet ingelogd.',
    item_not_found: 'Dit item bestaat niet meer.',
    item_inactive: 'Dit item is op dit moment niet beschikbaar.',
    out_of_stock: 'Helaas, dit item is uitverkocht.',
    insufficient_points: 'Je hebt niet genoeg punten voor dit item.',
    not_admin: 'Alleen een platform-admin kan dit doen.',
  }
  return err ? map[err] ?? err : 'Er ging iets mis.'
}

function statusBadge(status: SiteShopRedemption['status']): { label: string; bg: string; color: string } {
  if (status === 'confirmed') return { label: 'Bevestigd', bg: '#dcfce7', color: '#166534' }
  if (status === 'cancelled') return { label: 'Geannuleerd', bg: '#fee2e2', color: '#991b1b' }
  return { label: 'In afwachting', bg: '#fef3c7', color: '#854d0e' }
}

function fullName(r: SiteShopRedemption): string {
  const fn = (r.first_name ?? '').trim()
  const ln = (r.last_name ?? '').trim()
  const full = `${fn} ${ln}`.trim()
  return full || r.email || 'Gebruiker'
}

/**
 * Gebruikersgerichte site-shop (vervangt de oude lokale flow).
 */
export function SiteShopPanel({
  visible,
  userPoints,
  pendingPoints,
  onRedeemed,
}: {
  visible: boolean
  userPoints: number
  pendingPoints: number
  onRedeemed?: (remaining: number) => void
}) {
  const [items, setItems] = useState<SiteShopItem[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const rows = await fetchSiteShopItems({ activeOnly: true })
      setItems(rows)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Items ophalen mislukt.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (visible) void refresh()
  }, [visible, refresh])

  useEffect(() => {
    if (!visible || !supabase) return
    const client = supabase
    const ch = client
      .channel('site-shop-items-view')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'site_shop_items' }, () => {
        void refresh()
      })
      .subscribe()
    return () => {
      void client.removeChannel(ch)
    }
  }, [visible, refresh])

  async function onRedeem(item: SiteShopItem) {
    if (!window.confirm(`${item.cost} punten inwisselen voor "${item.title}"?`)) return
    setBusyId(item.id)
    setErr(null)
    setMsg(null)
    try {
      const res = await redeemSiteShopItem(item.id)
      if (!res.ok) {
        setErr(translateError(res.error))
        return
      }
      setMsg(
        `Ingewisseld! De platform-admin bevestigt de levering${
          typeof res.remainingPoints === 'number'
            ? ` · je hebt nog ${res.remainingPoints.toLocaleString('nl-NL')} punten.`
            : '.'
        }`,
      )
      if (typeof res.remainingPoints === 'number') onRedeemed?.(res.remainingPoints)
      await refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Inwisselen mislukt.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <div
        style={{
          background: 'linear-gradient(135deg,#3a98f8,#6c47ff)',
          borderRadius: 16,
          padding: 22,
          color: '#fff',
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ fontSize: '2.4rem' }}>⭐</div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, fontFamily: 'Fraunces,serif' }}>
            {userPoints.toLocaleString('nl-NL')} punten
          </div>
          <div style={{ fontSize: '.85rem', color: 'rgba(255,255,255,.85)' }}>Jouw actieve spaarpunten</div>
        </div>
        {pendingPoints > 0 ? (
          <div
            style={{
              background: 'rgba(255,255,255,.18)',
              border: '1.5px solid rgba(255,255,255,.3)',
              borderRadius: 12,
              padding: '8px 14px',
            }}
          >
            <div style={{ fontSize: '.7rem', fontWeight: 800, letterSpacing: '.04em' }}>IN AFWACHTING</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>{pendingPoints.toLocaleString('nl-NL')} pt</div>
            <div style={{ fontSize: '.7rem', color: 'rgba(255,255,255,.8)' }}>
              Actief na 72u refund-periode
            </div>
          </div>
        ) : null}
      </div>

      {err ? (
        <div
          style={{
            background: '#fef2f2',
            border: '1.5px solid #fecaca',
            color: '#991b1b',
            borderRadius: 10,
            padding: '8px 12px',
            marginBottom: 12,
            fontSize: '.82rem',
          }}
        >
          {err}
        </div>
      ) : null}
      {msg ? (
        <div
          style={{
            background: '#f0fdf4',
            border: '1.5px solid #bbf7d0',
            color: '#166534',
            borderRadius: 10,
            padding: '8px 12px',
            marginBottom: 12,
            fontSize: '.82rem',
          }}
        >
          {msg}
        </div>
      ) : null}

      {loading ? (
        <p style={{ color: '#6b7280' }}>Laden…</p>
      ) : items.length === 0 ? (
        <p style={{ color: '#6b7280' }}>Er zijn momenteel geen beloningen beschikbaar.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 18 }}>
          {items.map((item) => {
            const canAfford = userPoints >= item.cost
            const locked = !canAfford || item.stock <= 0 || busyId === item.id
            return (
              <div
                key={item.id}
                style={{
                  background: '#fff',
                  border: '1.5px solid #e5e7eb',
                  borderRadius: 14,
                  padding: 16,
                }}
              >
                <div style={{ fontSize: '1.6rem', marginBottom: 6 }}>{item.emoji || '🎁'}</div>
                <div style={{ fontWeight: 800, color: '#1f2937', marginBottom: 4 }}>{item.title}</div>
                {item.description ? (
                  <div style={{ fontSize: '.82rem', color: '#6b7280', marginBottom: 10 }}>{item.description}</div>
                ) : null}
                <div style={{ fontSize: '.78rem', fontWeight: 700, color: '#4338ca', marginBottom: 6 }}>
                  {item.cost.toLocaleString('nl-NL')} punten
                </div>
                <div style={{ fontSize: '.72rem', color: '#64748b', marginBottom: 12 }}>
                  Voorraad: {item.stock}
                </div>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={locked}
                  onClick={() => void onRedeem(item)}
                  style={{
                    width: '100%',
                    justifyContent: 'center',
                    background: locked ? '#e5e7eb' : 'linear-gradient(135deg,#6c47ff,#7c3aed)',
                    color: locked ? '#6b7280' : '#fff',
                  }}
                >
                  {busyId === item.id
                    ? 'Bezig…'
                    : item.stock <= 0
                      ? 'Uitverkocht'
                      : !canAfford
                        ? 'Onvoldoende punten'
                        : 'Inwisselen'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

// =============================================================
// Admin beheer: items + inwisselingen
// =============================================================

function emptyItemForm() {
  return { id: undefined as string | undefined, title: '', description: '', cost: '100', stock: '999', emoji: DEFAULT_EMOJIS[0], active: true }
}

export function SiteShopAdminPanel({ visible }: { visible: boolean }) {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [items, setItems] = useState<SiteShopItem[]>([])
  const [redemptions, setRedemptions] = useState<SiteShopRedemption[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [showCancelled, setShowCancelled] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyItemForm())
  const [busyRedemptionId, setBusyRedemptionId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    isPlatformAdmin().then((v) => {
      if (!cancelled) setIsAdmin(v)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const refresh = useCallback(async () => {
    if (isAdmin !== true) return
    setLoading(true)
    setErr(null)
    try {
      const [its, reds] = await Promise.all([
        fetchSiteShopItems(),
        listSiteShopRedemptionsForAdmin({ includeCancelled: showCancelled }),
      ])
      setItems(its)
      setRedemptions(reds)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Laden mislukt.')
    } finally {
      setLoading(false)
    }
  }, [isAdmin, showCancelled])

  useEffect(() => {
    if (visible) void refresh()
  }, [visible, refresh])

  useEffect(() => {
    if (!visible || !supabase || isAdmin !== true) return
    const client = supabase
    const ch = client
      .channel('site-shop-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'site_shop_items' }, () => void refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'site_shop_redemptions' }, () => void refresh())
      .subscribe()
    return () => {
      void client.removeChannel(ch)
    }
  }, [visible, refresh, isAdmin])

  const pendingReds = useMemo(() => redemptions.filter((r) => r.status === 'pending'), [redemptions])
  const otherReds = useMemo(() => redemptions.filter((r) => r.status !== 'pending'), [redemptions])

  async function onSubmitItem(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setMsg(null)
    const title = form.title.trim()
    const cost = Number(form.cost)
    const stock = Number(form.stock || '0')
    if (!title || !Number.isFinite(cost) || cost < 0) {
      setErr('Vul een titel en geldige kosten in.')
      return
    }
    setSaving(true)
    try {
      if (editingId) {
        await updateSiteShopItem(editingId, {
          title,
          description: form.description,
          cost,
          stock,
          emoji: form.emoji,
          active: form.active,
        })
        setMsg('Item bijgewerkt.')
      } else {
        await createSiteShopItem({
          title,
          description: form.description,
          cost,
          stock,
          emoji: form.emoji,
          active: form.active,
        })
        setMsg('Item toegevoegd.')
      }
      setForm(emptyItemForm())
      setEditingId(null)
      await refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Opslaan mislukt.')
    } finally {
      setSaving(false)
    }
  }

  function onEdit(item: SiteShopItem) {
    setEditingId(item.id)
    setForm({
      id: item.id,
      title: item.title,
      description: item.description ?? '',
      cost: String(item.cost),
      stock: String(item.stock),
      emoji: item.emoji || DEFAULT_EMOJIS[0],
      active: item.active,
    })
    setMsg(null)
    setErr(null)
  }

  async function onDelete(item: SiteShopItem) {
    if (!window.confirm(`Item "${item.title}" verwijderen?`)) return
    setErr(null)
    try {
      await deleteSiteShopItem(item.id)
      if (editingId === item.id) {
        setEditingId(null)
        setForm(emptyItemForm())
      }
      setMsg('Item verwijderd.')
      await refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Verwijderen mislukt.')
    }
  }

  async function onToggleActive(item: SiteShopItem) {
    try {
      await updateSiteShopItem(item.id, { active: !item.active })
      await refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Bijwerken mislukt.')
    }
  }

  async function onConfirm(r: SiteShopRedemption, confirmed: boolean) {
    setBusyRedemptionId(r.redemption_id)
    try {
      await confirmSiteShopRedemption(r.redemption_id, confirmed)
      await refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Bijwerken mislukt.')
    } finally {
      setBusyRedemptionId(null)
    }
  }

  if (isAdmin === null) return null
  if (!isAdmin) return null

  return (
    <div
      style={{
        marginTop: 28,
        background: '#fff',
        border: '1.5px solid #e5e7eb',
        borderRadius: 18,
        padding: 18,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ fontSize: '.72rem', fontWeight: 900, letterSpacing: '.1em', color: '#0f172a' }}>
          👑 PLATFORM-ADMIN · BEHEER
        </div>
        <span
          style={{
            fontSize: '.7rem',
            background: '#fef3c7',
            color: '#854d0e',
            padding: '3px 8px',
            borderRadius: 999,
            fontWeight: 800,
          }}
        >
          Alleen voor jou zichtbaar
        </span>
      </div>

      {err ? (
        <div
          style={{
            background: '#fef2f2',
            border: '1.5px solid #fecaca',
            color: '#991b1b',
            borderRadius: 10,
            padding: '8px 12px',
            marginBottom: 10,
            fontSize: '.82rem',
          }}
        >
          {err}
        </div>
      ) : null}
      {msg ? (
        <div
          style={{
            background: '#f0fdf4',
            border: '1.5px solid #bbf7d0',
            color: '#166534',
            borderRadius: 10,
            padding: '8px 12px',
            marginBottom: 10,
            fontSize: '.82rem',
          }}
        >
          {msg}
        </div>
      ) : null}

      {/* ====== Items beheren ====== */}
      <form
        onSubmit={(e) => void onSubmitItem(e)}
        style={{
          background: 'linear-gradient(135deg,#eff6ff,#dbeafe)',
          border: '1.5px solid #bfdbfe',
          borderRadius: 14,
          padding: 14,
          display: 'grid',
          gap: 10,
          marginBottom: 16,
        }}
      >
        <div style={{ fontWeight: 700, color: '#1e3a8a' }}>{editingId ? 'Item bewerken' : 'Nieuw shop-item'}</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            className="input"
            placeholder="Titel"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            style={{ flex: '1 1 200px', marginBottom: 0 }}
          />
          <select
            className="input"
            value={form.emoji}
            onChange={(e) => setForm((f) => ({ ...f, emoji: e.target.value }))}
            style={{ flex: '0 1 100px', marginBottom: 0 }}
            aria-label="Emoji"
          >
            {DEFAULT_EMOJIS.map((em) => (
              <option key={em} value={em}>
                {em}
              </option>
            ))}
          </select>
        </div>
        <textarea
          className="input"
          placeholder="Beschrijving (optioneel)"
          rows={2}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          style={{ resize: 'vertical' }}
        />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ fontSize: '.82rem', color: '#1e3a8a', display: 'flex', gap: 6, alignItems: 'center' }}>
            Kosten (pt)
            <input
              className="input"
              type="number"
              min={0}
              value={form.cost}
              onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
              style={{ width: 100, marginBottom: 0 }}
            />
          </label>
          <label style={{ fontSize: '.82rem', color: '#1e3a8a', display: 'flex', gap: 6, alignItems: 'center' }}>
            Voorraad
            <input
              className="input"
              type="number"
              min={0}
              value={form.stock}
              onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
              style={{ width: 100, marginBottom: 0 }}
            />
          </label>
          <label style={{ fontSize: '.82rem', color: '#1e3a8a', display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
            />
            Actief
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="submit" className="btn btn-dark btn-sm" disabled={saving}>
            {saving ? 'Bezig…' : editingId ? 'Bewerking opslaan' : 'Item toevoegen'}
          </button>
          {editingId ? (
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => {
                setEditingId(null)
                setForm(emptyItemForm())
              }}
            >
              Annuleren
            </button>
          ) : null}
        </div>
      </form>

      <div style={{ marginBottom: 22 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Items ({items.length})</div>
        {loading ? (
          <p style={{ color: '#6b7280' }}>Laden…</p>
        ) : items.length === 0 ? (
          <p style={{ color: '#6b7280' }}>Nog geen items.</p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {items.map((it) => (
              <div
                key={it.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: 12,
                  border: '1.5px solid #e5e7eb',
                  borderRadius: 12,
                  background: '#f8fafc',
                  flexWrap: 'wrap',
                  opacity: it.active ? 1 : 0.65,
                }}
              >
                <div style={{ fontSize: '1.6rem' }}>{it.emoji || '🎁'}</div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontWeight: 700 }}>
                    {it.title}
                    {!it.active ? (
                      <span style={{ marginLeft: 8, fontSize: '.7rem', color: '#991b1b', fontWeight: 800 }}>
                        (inactief)
                      </span>
                    ) : null}
                  </div>
                  {it.description ? (
                    <div style={{ fontSize: '.78rem', color: '#475569' }}>{it.description}</div>
                  ) : null}
                  <div style={{ fontSize: '.78rem' }}>
                    <strong>{it.cost.toLocaleString('nl-NL')}</strong> pt · voorraad: {it.stock}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => onEdit(it)}>
                    Bewerken
                  </button>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => void onToggleActive(it)}>
                    {it.active ? 'Deactiveren' : 'Activeren'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    style={{ color: '#991b1b', borderColor: '#fecaca' }}
                    onClick={() => void onDelete(it)}
                  >
                    Verwijder
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ====== Inwisselingen ====== */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <div style={{ fontWeight: 700 }}>Inwisselingen ({redemptions.length})</div>
          <label style={{ fontSize: '.78rem', display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={showCancelled}
              onChange={(e) => setShowCancelled(e.target.checked)}
            />
            Toon geannuleerd
          </label>
        </div>

        {redemptions.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: '.88rem' }}>Nog geen inwisselingen.</p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {[...pendingReds, ...otherReds].map((r) => {
              const s = statusBadge(r.status)
              const when = new Date(r.created_at).toLocaleString('nl-NL')
              const addrLine = [r.postal_code, r.city].filter(Boolean).join(' ').trim()
              return (
                <div
                  key={r.redemption_id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '48px 1fr auto',
                    gap: 12,
                    padding: 12,
                    border: '1px solid #e5e7eb',
                    borderRadius: 12,
                    background: r.status === 'pending' ? '#fffbeb' : '#f8fafc',
                    alignItems: 'start',
                  }}
                >
                  <div style={{ fontSize: '2rem', textAlign: 'center' }}>{r.item_emoji || '🎁'}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <div style={{ fontWeight: 800 }}>{r.item_title}</div>
                      <span
                        style={{
                          fontSize: '.7rem',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          background: s.bg,
                          color: s.color,
                          borderRadius: 999,
                          padding: '2px 10px',
                        }}
                      >
                        {s.label}
                      </span>
                    </div>
                    <div style={{ fontSize: '.82rem', color: '#334155', marginTop: 4 }}>
                      <strong>{fullName(r)}</strong> · {r.email ?? '—'}
                    </div>
                    <div style={{ fontSize: '.78rem', color: '#475569', marginTop: 2 }}>
                      {r.cost_points.toLocaleString('nl-NL')} pt · ingewisseld op {when}
                    </div>
                    <div style={{ fontSize: '.78rem', color: '#334155', marginTop: 6 }}>
                      <div>
                        <span style={{ color: '#64748b' }}>Adres:</span> {r.address || '—'}
                      </div>
                      <div>
                        <span style={{ color: '#64748b' }}>Plaats:</span> {addrLine || '—'}
                        {r.country ? <span style={{ color: '#64748b' }}> · {r.country}</span> : null}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                    {r.status === 'pending' ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-dark btn-sm"
                          disabled={busyRedemptionId === r.redemption_id}
                          onClick={() => void onConfirm(r, true)}
                        >
                          ✓ Bevestigen
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          style={{ color: '#991b1b', borderColor: '#fecaca' }}
                          disabled={busyRedemptionId === r.redemption_id}
                          onClick={() => void onConfirm(r, false)}
                        >
                          Annuleren
                        </button>
                      </>
                    ) : r.status === 'confirmed' ? (
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        disabled={busyRedemptionId === r.redemption_id}
                        onClick={() => void onConfirm(r, false)}
                      >
                        Ongedaan maken
                      </button>
                    ) : (
                      <span style={{ fontSize: '.74rem', color: '#6b7280' }}>Geannuleerd</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

/** Handige hook om elders (bv. banner) ook pending punten te tonen. */
export function usePendingPoints(visible: boolean): number {
  const [pending, setPending] = useState(0)
  useEffect(() => {
    let cancelled = false
    if (!visible) return
    fetchMyPendingPoints().then((v) => {
      if (!cancelled) setPending(v)
    })
    return () => {
      cancelled = true
    }
  }, [visible])
  return pending
}
