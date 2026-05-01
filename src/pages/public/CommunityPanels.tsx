import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  confirmCommunityRedemption,
  createCommunityPost,
  createCommunityShopItem,
  deleteCommunityPost,
  deleteCommunityShopItem,
  fetchCommunityMembers,
  fetchCommunityPosts,
  fetchCommunityShopItems,
  listCommunityRedemptionsForOwner,
  redeemCommunityShopItem,
  removeCommunityMember,
  updateCommunityShopItem,
  type CommunityMemberRow,
  type CommunityPost,
  type CommunityRedemption,
  type CommunityShopItem,
} from '../../features/community/communityProjectsService'
import { supabase } from '../../lib/supabase'

function translateShopError(err: string | undefined): string {
  const map: Record<string, string> = {
    not_authenticated: 'Je bent niet ingelogd.',
    item_not_found: 'Dit item bestaat niet meer.',
    item_inactive: 'Dit item is op dit moment niet beschikbaar.',
    out_of_stock: 'Helaas, dit item is uitverkocht.',
    not_a_member: 'Je bent geen lid van deze community.',
    insufficient_points: 'Je hebt niet genoeg community-punten voor dit item.',
  }
  return err ? map[err] ?? err : 'Inwisselen is mislukt.'
}

function formatMemberName(m: CommunityMemberRow): string {
  const fn = (m.first_name ?? '').trim()
  const ln = (m.last_name ?? '').trim()
  const full = `${fn} ${ln}`.trim()
  return full || m.email || 'Gebruiker'
}

function roleLabel(role: CommunityMemberRow['role']): { label: string; color: string; bg: string } {
  if (role === 'owner') return { label: 'Eigenaar', color: '#854d0e', bg: '#fef3c7' }
  if (role === 'sponsor') return { label: 'Sponsor', color: '#701a75', bg: '#fae8ff' }
  return { label: 'Lid', color: '#075985', bg: '#e0f2fe' }
}

export function CommunityMembersPanel({
  communityId,
  visible,
  onChange,
}: {
  communityId: string
  visible: boolean
  onChange?: () => void
}) {
  const [members, setMembers] = useState<CommunityMemberRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [busyUserId, setBusyUserId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const rows = await fetchCommunityMembers(communityId)
      setMembers(rows)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Leden ophalen mislukt.')
    } finally {
      setLoading(false)
    }
  }, [communityId])

  useEffect(() => {
    if (visible) void refresh()
  }, [visible, refresh])

  useEffect(() => {
    if (!visible || !supabase) return
    const client = supabase
    const ch = client
      .channel(`community-members-owner-${communityId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'community_members', filter: `community_id=eq.${communityId}` },
        () => void refresh(),
      )
      .subscribe()
    return () => {
      void client.removeChannel(ch)
    }
  }, [visible, communityId, refresh])

  async function onRemove(userId: string, name: string) {
    if (!window.confirm(`${name} uit de community verwijderen? Deze actie kan niet ongedaan gemaakt worden.`)) return
    setBusyUserId(userId)
    setErr(null)
    try {
      await removeCommunityMember(communityId, userId)
      await refresh()
      onChange?.()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Verwijderen mislukt.')
    } finally {
      setBusyUserId(null)
    }
  }

  const [owners, others] = useMemo(() => {
    const o: CommunityMemberRow[] = []
    const r: CommunityMemberRow[] = []
    for (const m of members) (m.role === 'owner' ? o : r).push(m)
    return [o, r]
  }, [members])

  return (
    <div
      style={{
        background: '#fff',
        border: '1.5px solid #e5e7eb',
        borderRadius: 16,
        padding: 18,
        marginBottom: 24,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: '1rem', color: '#0f172a' }}>Leden van je community</div>
          <div style={{ fontSize: '.8rem', color: '#64748b' }}>
            {members.length} {members.length === 1 ? 'persoon' : 'personen'} · jij kunt leden verwijderen
          </div>
        </div>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() => void refresh()}
          disabled={loading}
        >
          {loading ? 'Laden…' : 'Vernieuwen'}
        </button>
      </div>

      {err ? (
        <div
          style={{
            background: '#fef2f2',
            border: '1.5px solid #fecaca',
            color: '#991b1b',
            borderRadius: 10,
            padding: '8px 12px',
            marginTop: 12,
            fontSize: '.82rem',
          }}
        >
          {err}
        </div>
      ) : null}

      {!loading && members.length === 0 ? (
        <p style={{ color: '#6b7280', fontSize: '.88rem', marginTop: 14 }}>Nog geen leden. Deel je code om mensen uit te nodigen.</p>
      ) : null}

      <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
        {[...owners, ...others].map((m) => {
          const badge = roleLabel(m.role)
          const name = formatMemberName(m)
          const joined = new Date(m.joined_at).toLocaleDateString('nl-NL')
          const isOwnerRow = m.role === 'owner'
          return (
            <div
              key={m.user_id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: 12,
                border: '1px solid #e5e7eb',
                borderRadius: 12,
                background: isOwnerRow ? '#fffbeb' : '#f8fafc',
                flexWrap: 'wrap',
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg,#1a237e,#3a98f8)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '1.05rem',
                  flexShrink: 0,
                }}
              >
                {(name[0] || '?').toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontWeight: 700, color: '#0f172a' }}>{name}</div>
                <div style={{ fontSize: '.78rem', color: '#64748b' }}>
                  {m.email || '—'} · aangesloten {joined}
                </div>
              </div>
              <span
                style={{
                  fontSize: '.72rem',
                  fontWeight: 800,
                  background: badge.bg,
                  color: badge.color,
                  borderRadius: 999,
                  padding: '4px 10px',
                  letterSpacing: '.04em',
                  textTransform: 'uppercase',
                }}
              >
                {badge.label}
              </span>
              {!isOwnerRow ? (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  style={{ color: '#991b1b', borderColor: '#fecaca', fontWeight: 700 }}
                  disabled={busyUserId === m.user_id}
                  onClick={() => void onRemove(m.user_id, name)}
                >
                  {busyUserId === m.user_id ? 'Bezig…' : 'Verwijderen'}
                </button>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// =======================================================
// Shop (beheer door owner)
// =======================================================

const DEFAULT_EMOJIS = ['🎁', '🎉', '⭐', '💎', '🏆', '☕', '🍕', '🎟️', '👕', '📦']

function emptyForm(): {
  id?: string
  title: string
  description: string
  cost: string
  stock: string
  emoji: string
  active: boolean
} {
  return { title: '', description: '', cost: '100', stock: '0', emoji: DEFAULT_EMOJIS[0], active: true }
}

export function CommunityShopManagerPanel({
  communityId,
  visible,
}: {
  communityId: string
  visible: boolean
}) {
  const [items, setItems] = useState<CommunityShopItem[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const rows = await fetchCommunityShopItems(communityId)
      setItems(rows)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Items ophalen mislukt.')
    } finally {
      setLoading(false)
    }
  }, [communityId])

  useEffect(() => {
    if (visible) void refresh()
  }, [visible, refresh])

  useEffect(() => {
    if (!visible || !supabase) return
    const client = supabase
    const ch = client
      .channel(`community-shop-${communityId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'community_shop_items', filter: `community_id=eq.${communityId}` },
        () => void refresh(),
      )
      .subscribe()
    return () => {
      void client.removeChannel(ch)
    }
  }, [visible, communityId, refresh])

  function resetForm() {
    setForm(emptyForm())
    setEditingId(null)
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    setErr(null)
    const title = form.title.trim()
    const cost = Number(form.cost)
    const stock = Number(form.stock || '0')
    if (!title || !Number.isFinite(cost) || cost < 0) {
      setErr('Vul een titel en geldige kosten in (≥ 0).')
      return
    }
    setSaving(true)
    try {
      if (editingId) {
        await updateCommunityShopItem(editingId, {
          title,
          description: form.description,
          cost,
          stock,
          emoji: form.emoji,
          active: form.active,
        })
        setMsg('Item bijgewerkt.')
      } else {
        await createCommunityShopItem({
          communityId,
          title,
          description: form.description,
          cost,
          stock,
          emoji: form.emoji,
          active: form.active,
        })
        setMsg('Item toegevoegd.')
      }
      resetForm()
      await refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Opslaan mislukt.')
    } finally {
      setSaving(false)
    }
  }

  function onEdit(item: CommunityShopItem) {
    setEditingId(item.id)
    setForm({
      id: item.id,
      title: item.title,
      description: item.description ?? '',
      cost: String(item.cost),
      stock: String(item.stock ?? 0),
      emoji: item.emoji || DEFAULT_EMOJIS[0],
      active: item.active,
    })
    setMsg(null)
    setErr(null)
  }

  async function onDelete(id: string, title: string) {
    if (!window.confirm(`Item '${title}' verwijderen?`)) return
    setErr(null)
    try {
      await deleteCommunityShopItem(id)
      if (editingId === id) resetForm()
      setMsg('Item verwijderd.')
      await refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Verwijderen mislukt.')
    }
  }

  async function onToggleActive(item: CommunityShopItem) {
    try {
      await updateCommunityShopItem(item.id, { active: !item.active })
      await refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Bijwerken mislukt.')
    }
  }

  return (
    <div
      style={{
        background: 'linear-gradient(135deg,#fff7ed,#ffedd5)',
        border: '1.5px solid #fdba74',
        borderRadius: 16,
        padding: 18,
        marginBottom: 24,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: '1rem', color: '#9a3412' }}>Puntenwinkel van je community</div>
          <div style={{ fontSize: '.8rem', color: '#c2410c' }}>
            Beloningen die leden kunnen inwisselen met hun punten.
          </div>
        </div>
      </div>

      {msg ? (
        <div
          style={{
            background: '#f0fdf4',
            border: '1.5px solid #bbf7d0',
            color: '#166534',
            borderRadius: 10,
            padding: '8px 12px',
            marginTop: 12,
            fontSize: '.82rem',
          }}
        >
          {msg}
        </div>
      ) : null}
      {err ? (
        <div
          style={{
            background: '#fef2f2',
            border: '1.5px solid #fecaca',
            color: '#991b1b',
            borderRadius: 10,
            padding: '8px 12px',
            marginTop: 12,
            fontSize: '.82rem',
          }}
        >
          {err}
        </div>
      ) : null}

      <form
        onSubmit={(e) => void onSubmit(e)}
        style={{
          background: '#fff',
          border: '1.5px solid #fed7aa',
          borderRadius: 14,
          padding: 14,
          marginTop: 12,
          display: 'grid',
          gap: 10,
        }}
      >
        <div style={{ fontWeight: 700, color: '#9a3412' }}>
          {editingId ? 'Item bewerken' : 'Nieuw item toevoegen'}
        </div>
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
          placeholder="Omschrijving (optioneel)"
          rows={2}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          style={{ resize: 'vertical' }}
        />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ fontSize: '.82rem', color: '#374151', display: 'flex', gap: 6, alignItems: 'center' }}>
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
          <label style={{ fontSize: '.82rem', color: '#374151', display: 'flex', gap: 6, alignItems: 'center' }}>
            Voorraad
            <input
              className="input"
              type="number"
              min={0}
              value={form.stock}
              onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
              style={{ width: 80, marginBottom: 0 }}
            />
          </label>
          <label style={{ fontSize: '.82rem', color: '#374151', display: 'flex', gap: 6, alignItems: 'center' }}>
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
            <button type="button" className="btn btn-outline btn-sm" onClick={resetForm}>
              Annuleren
            </button>
          ) : null}
        </div>
      </form>

      <div style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 8, color: '#9a3412' }}>
          Items ({items.length})
        </div>
        {loading ? (
          <p style={{ color: '#6b7280', fontSize: '.88rem' }}>Laden…</p>
        ) : items.length === 0 ? (
          <p style={{ color: '#c2410c', fontSize: '.88rem' }}>Nog geen items. Voeg er hierboven een toe.</p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {items.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: 12,
                  border: '1.5px solid #e5e7eb',
                  borderRadius: 12,
                  background: '#fff',
                  opacity: item.active ? 1 : 0.65,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ fontSize: '1.6rem', flexShrink: 0 }}>{item.emoji || '🎁'}</div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontWeight: 700, color: '#0f172a' }}>
                    {item.title}
                    {!item.active ? (
                      <span style={{ marginLeft: 8, fontSize: '.7rem', color: '#991b1b', fontWeight: 800 }}>
                        (inactief)
                      </span>
                    ) : null}
                  </div>
                  {item.description ? (
                    <div style={{ fontSize: '.78rem', color: '#475569' }}>{item.description}</div>
                  ) : null}
                  <div style={{ fontSize: '.78rem', color: '#0f172a', marginTop: 2 }}>
                    <strong>{item.cost.toLocaleString('nl-NL')}</strong> punten · voorraad: {item.stock}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => onEdit(item)}>
                    Bewerken
                  </button>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => void onToggleActive(item)}>
                    {item.active ? 'Deactiveren' : 'Activeren'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    style={{ color: '#991b1b', borderColor: '#fecaca' }}
                    onClick={() => void onDelete(item.id, item.title)}
                  >
                    Verwijder
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// =======================================================
// Shop (weergave voor leden)
// =======================================================

export function CommunityShopViewPanel({
  communityId,
  communityName,
  visible,
  userCommunityPoints,
  onRedeemed,
}: {
  communityId: string
  communityName: string
  visible: boolean
  userCommunityPoints?: number
  onRedeemed?: (remaining: number) => void
}) {
  const [items, setItems] = useState<CommunityShopItem[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const rows = await fetchCommunityShopItems(communityId, { activeOnly: true })
      setItems(rows)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Items ophalen mislukt.')
    } finally {
      setLoading(false)
    }
  }, [communityId])

  useEffect(() => {
    if (visible) void refresh()
  }, [visible, refresh])

  useEffect(() => {
    if (!visible || !supabase) return
    const client = supabase
    const ch = client
      .channel(`community-shop-view-${communityId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'community_shop_items', filter: `community_id=eq.${communityId}` },
        () => void refresh(),
      )
      .subscribe()
    return () => {
      void client.removeChannel(ch)
    }
  }, [visible, communityId, refresh])

  async function onRedeem(item: CommunityShopItem) {
    if (!window.confirm(`${item.cost} community-punten inwisselen voor "${item.title}"?`)) return
    setBusyId(item.id)
    setErr(null)
    setMsg(null)
    try {
      const res = await redeemCommunityShopItem(item.id)
      if (!res.ok) {
        setErr(translateShopError(res.error))
        return
      }
      setMsg(
        `Ingewisseld! De community-eigenaar bevestigt de levering${
          typeof res.remainingPoints === 'number'
            ? ` · je hebt nog ${res.remainingPoints.toLocaleString('nl-NL')} community-punten.`
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

  if (!loading && items.length === 0) return null

  return (
    <div
      style={{
        background: '#fff',
        border: '1.5px solid #e5e7eb',
        borderRadius: 14,
        padding: 14,
        marginBottom: 16,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 800, color: '#0f172a' }}>Puntenwinkel · {communityName}</div>
          <div style={{ fontSize: '.78rem', color: '#64748b' }}>
            Exclusieve beloningen · in te wisselen met jouw community-punten.
          </div>
        </div>
        {typeof userCommunityPoints === 'number' ? (
          <div
            style={{
              alignSelf: 'flex-start',
              background: '#fae8ff',
              color: '#6b21a8',
              borderRadius: 999,
              padding: '4px 12px',
              fontSize: '.78rem',
              fontWeight: 800,
            }}
          >
            Community-punten: {userCommunityPoints.toLocaleString('nl-NL')}
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
            marginTop: 10,
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
            marginTop: 10,
            fontSize: '.82rem',
          }}
        >
          {msg}
        </div>
      ) : null}

      {loading ? (
        <p style={{ color: '#6b7280', fontSize: '.88rem', marginTop: 10 }}>Laden…</p>
      ) : (
        <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
          {items.map((item) => {
            const canAfford = typeof userCommunityPoints === 'number' ? userCommunityPoints >= item.cost : undefined
            return (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: 10,
                  border: '1px solid #e5e7eb',
                  borderRadius: 12,
                  background: '#f8fafc',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ fontSize: '1.6rem', flexShrink: 0 }}>{item.emoji || '🎁'}</div>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <div style={{ fontWeight: 700, color: '#0f172a' }}>{item.title}</div>
                  {item.description ? (
                    <div style={{ fontSize: '.78rem', color: '#475569' }}>{item.description}</div>
                  ) : null}
                  <div style={{ fontSize: '.78rem', color: '#0f172a', marginTop: 2 }}>
                    <strong>{item.cost.toLocaleString('nl-NL')}</strong> community-punten · voorraad: {item.stock}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-dark btn-sm"
                  disabled={canAfford === false || item.stock <= 0 || busyId === item.id}
                  onClick={() => void onRedeem(item)}
                >
                  {busyId === item.id
                    ? 'Bezig…'
                    : item.stock <= 0
                      ? 'Uitverkocht'
                      : canAfford === false
                        ? 'Te weinig punten'
                        : 'Inwisselen'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// =======================================================
// Inwisselingen-paneel (alleen voor community-eigenaar)
// =======================================================

function fullName(r: CommunityRedemption): string {
  const fn = (r.first_name ?? '').trim()
  const ln = (r.last_name ?? '').trim()
  const full = `${fn} ${ln}`.trim()
  return full || r.email || 'Gebruiker'
}

function statusLabel(status: CommunityRedemption['status']): { label: string; bg: string; color: string } {
  if (status === 'confirmed') return { label: 'Bevestigd', bg: '#dcfce7', color: '#166534' }
  if (status === 'cancelled') return { label: 'Geannuleerd', bg: '#fee2e2', color: '#991b1b' }
  return { label: 'In afwachting', bg: '#fef3c7', color: '#854d0e' }
}

export function CommunityRedemptionsPanel({
  communityId,
  visible,
}: {
  communityId: string
  visible: boolean
}) {
  const [rows, setRows] = useState<CommunityRedemption[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [showCancelled, setShowCancelled] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const list = await listCommunityRedemptionsForOwner(communityId, {
        includeCancelled: showCancelled,
      })
      setRows(list)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ophalen mislukt.')
    } finally {
      setLoading(false)
    }
  }, [communityId, showCancelled])

  useEffect(() => {
    if (visible) void refresh()
  }, [visible, refresh])

  useEffect(() => {
    if (!visible || !supabase) return
    const client = supabase
    const ch = client
      .channel(`community-redemptions-${communityId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'community_shop_redemptions', filter: `community_id=eq.${communityId}` },
        () => void refresh(),
      )
      .subscribe()
    return () => {
      void client.removeChannel(ch)
    }
  }, [visible, communityId, refresh])

  async function onToggle(row: CommunityRedemption, confirm: boolean) {
    setBusyId(row.redemption_id)
    setErr(null)
    try {
      await confirmCommunityRedemption(row.redemption_id, confirm)
      await refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Bijwerken mislukt.')
    } finally {
      setBusyId(null)
    }
  }

  const pending = rows.filter((r) => r.status === 'pending')
  const others = rows.filter((r) => r.status !== 'pending')

  return (
    <div
      style={{
        background: '#fff',
        border: '1.5px solid #e5e7eb',
        borderRadius: 16,
        padding: 18,
        marginBottom: 24,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: '1rem', color: '#0f172a' }}>Inwisselingen</div>
          <div style={{ fontSize: '.8rem', color: '#64748b' }}>
            Wie heeft welk product ingewisseld? Vink af om te bevestigen.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <label style={{ fontSize: '.8rem', display: 'flex', gap: 6, alignItems: 'center', color: '#475569' }}>
            <input
              type="checkbox"
              checked={showCancelled}
              onChange={(e) => setShowCancelled(e.target.checked)}
            />
            Toon geannuleerd
          </label>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => void refresh()} disabled={loading}>
            {loading ? 'Laden…' : 'Vernieuwen'}
          </button>
        </div>
      </div>

      {err ? (
        <div
          style={{
            background: '#fef2f2',
            border: '1.5px solid #fecaca',
            color: '#991b1b',
            borderRadius: 10,
            padding: '8px 12px',
            marginTop: 10,
            fontSize: '.82rem',
          }}
        >
          {err}
        </div>
      ) : null}

      {!loading && rows.length === 0 ? (
        <p style={{ color: '#6b7280', fontSize: '.88rem', marginTop: 14 }}>
          Nog geen inwisselingen in deze community.
        </p>
      ) : null}

      <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
        {[...pending, ...others].map((r) => {
          const s = statusLabel(r.status)
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
                  <div style={{ fontWeight: 800, color: '#0f172a' }}>{r.item_title}</div>
                  <span
                    style={{
                      fontSize: '.7rem',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '.05em',
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
                  {r.cost_points.toLocaleString('nl-NL')} punten · ingewisseld op {when}
                </div>
                <div style={{ fontSize: '.78rem', color: '#334155', marginTop: 6 }}>
                  <div>
                    <span style={{ color: '#64748b' }}>Adres:</span> {r.address || '—'}
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Plaats:</span> {addrLine || '—'}{' '}
                    {r.country ? <span style={{ color: '#64748b' }}>· {r.country}</span> : null}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                {r.status === 'pending' ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-dark btn-sm"
                      disabled={busyId === r.redemption_id}
                      onClick={() => void onToggle(r, true)}
                    >
                      ✓ Bevestigen
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      style={{ color: '#991b1b', borderColor: '#fecaca' }}
                      disabled={busyId === r.redemption_id}
                      onClick={() => void onToggle(r, false)}
                    >
                      Annuleren
                    </button>
                  </>
                ) : r.status === 'confirmed' ? (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={busyId === r.redemption_id}
                    onClick={() => void onToggle(r, false)}
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
    </div>
  )
}

// =======================================================
// Community Feed / Activiteiten
// =======================================================

function postAuthorName(p: CommunityPost): string {
  const fn = (p.author_first_name ?? '').trim()
  const ln = (p.author_last_name ?? '').trim()
  const full = `${fn} ${ln}`.trim()
  return full || p.author_email || 'Lid'
}

function timeAgo(iso: string): string {
  const d = new Date(iso)
  const diff = Math.max(0, Date.now() - d.getTime())
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'zojuist'
  if (m < 60) return `${m}m geleden`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}u geleden`
  const days = Math.floor(h / 24)
  if (days < 7) return `${days}d geleden`
  return d.toLocaleDateString('nl-NL')
}

export function CommunityFeedPanel({
  communityId,
  visible,
  currentUserId,
  canPost,
  isOwner,
  limit = 50,
  compact = false,
}: {
  communityId: string
  visible: boolean
  currentUserId?: string
  canPost: boolean
  isOwner: boolean
  limit?: number
  compact?: boolean
}) {
  const [posts, setPosts] = useState<CommunityPost[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const rows = await fetchCommunityPosts(communityId, limit)
      setPosts(rows)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Berichten ophalen mislukt.')
    } finally {
      setLoading(false)
    }
  }, [communityId, limit])

  useEffect(() => {
    if (visible) void refresh()
  }, [visible, refresh])

  useEffect(() => {
    if (!visible || !supabase) return
    const client = supabase
    const ch = client
      .channel(`community-posts-${communityId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'community_posts', filter: `community_id=eq.${communityId}` },
        () => void refresh(),
      )
      .subscribe()
    return () => {
      void client.removeChannel(ch)
    }
  }, [visible, communityId, refresh])

  async function onPost(e: React.FormEvent) {
    e.preventDefault()
    const text = body.trim()
    if (!text) return
    setSaving(true)
    setErr(null)
    try {
      await createCommunityPost({ communityId, body: text })
      setBody('')
      await refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Plaatsen mislukt.')
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(p: CommunityPost) {
    if (!window.confirm('Dit bericht verwijderen?')) return
    setBusyId(p.id)
    try {
      await deleteCommunityPost(p.id)
      await refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Verwijderen mislukt.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div
      style={{
        background: '#fff',
        border: '1.5px solid #e5e7eb',
        borderRadius: 16,
        padding: compact ? 14 : 18,
        marginBottom: 16,
      }}
    >
      {!compact ? (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontWeight: 800, fontSize: '1rem', color: '#0f172a' }}>Activiteit</div>
          <div style={{ fontSize: '.8rem', color: '#64748b' }}>
            Updates en berichten van de community. Alleen leden zien dit.
          </div>
        </div>
      ) : (
        <div style={{ fontWeight: 800, marginBottom: 10, color: '#0f172a' }}>📣 Recente activiteit</div>
      )}

      {err ? (
        <div
          style={{
            background: '#fef2f2',
            border: '1.5px solid #fecaca',
            color: '#991b1b',
            borderRadius: 10,
            padding: '8px 12px',
            fontSize: '.82rem',
            marginBottom: 10,
          }}
        >
          {err}
        </div>
      ) : null}

      {canPost ? (
        <form
          onSubmit={(e) => void onPost(e)}
          style={{
            background: 'linear-gradient(135deg,#f8fafc,#eff6ff)',
            border: '1.5px solid #dbeafe',
            borderRadius: 12,
            padding: 10,
            marginBottom: 14,
            display: 'grid',
            gap: 8,
          }}
        >
          <textarea
            className="input"
            placeholder={isOwner ? 'Deel een update met je community…' : 'Schrijf iets voor de community…'}
            rows={2}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            style={{ resize: 'vertical', marginBottom: 0 }}
            maxLength={8000}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ fontSize: '.72rem', color: '#64748b' }}>
              {body.length > 0 ? `${body.length} tekens` : 'Max. 8000 tekens'}
            </div>
            <button type="submit" className="btn btn-dark btn-sm" disabled={saving || !body.trim()}>
              {saving ? 'Bezig…' : isOwner ? 'Plaatsen als eigenaar' : 'Plaatsen'}
            </button>
          </div>
        </form>
      ) : null}

      {loading ? (
        <p style={{ color: '#6b7280', fontSize: '.88rem' }}>Laden…</p>
      ) : posts.length === 0 ? (
        <p style={{ color: '#6b7280', fontSize: '.88rem' }}>Nog geen berichten.</p>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {posts.map((p) => {
            const name = postAuthorName(p)
            const isAuthor = currentUserId && p.author_id === currentUserId
            const canDelete = Boolean(isAuthor || isOwner)
            return (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  gap: 10,
                  padding: 12,
                  border: '1px solid #e5e7eb',
                  borderRadius: 12,
                  background: p.is_owner ? '#fffbeb' : '#f8fafc',
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    flexShrink: 0,
                    borderRadius: '50%',
                    background: p.is_owner
                      ? 'linear-gradient(135deg,#f59e0b,#fbbf24)'
                      : 'linear-gradient(135deg,#1a237e,#3a98f8)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                  }}
                  aria-hidden
                >
                  {(name[0] || '?').toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ fontWeight: 800, color: '#0f172a' }}>{name}</div>
                    {p.is_owner ? (
                      <span
                        style={{
                          fontSize: '.66rem',
                          fontWeight: 800,
                          letterSpacing: '.04em',
                          background: '#fef3c7',
                          color: '#854d0e',
                          padding: '2px 8px',
                          borderRadius: 999,
                          textTransform: 'uppercase',
                        }}
                      >
                        Eigenaar
                      </span>
                    ) : null}
                    <span style={{ fontSize: '.72rem', color: '#64748b' }}>· {timeAgo(p.created_at)}</span>
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap', color: '#1f2937', marginTop: 4, fontSize: '.92rem', lineHeight: 1.5 }}>
                    {p.body}
                  </div>
                </div>
                {canDelete ? (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={busyId === p.id}
                    onClick={() => void onDelete(p)}
                    style={{ color: '#991b1b', borderColor: '#fecaca', alignSelf: 'flex-start' }}
                  >
                    {busyId === p.id ? '…' : 'Verwijder'}
                  </button>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
