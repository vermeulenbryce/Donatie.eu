import { useCallback, useEffect, useState } from 'react'
import {
  fetchMarktenModulesSetting,
  saveMarktenModulesSetting,
  subscribeToTableChanges,
  type MarktenCampaignEntry,
  type MarktenModuleEntry,
} from '../../../../features/admin/adminContentService'

function emptyModule(): MarktenModuleEntry {
  return { id: '', enabled: false, label: '' }
}

function emptyCampaign(): MarktenCampaignEntry {
  return { id: '', title: '', active: false }
}

export function AdminMarktenSection() {
  const [modules, setModules] = useState<MarktenModuleEntry[]>([])
  const [campaigns, setCampaigns] = useState<MarktenCampaignEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const row = await fetchMarktenModulesSetting()
      setModules(
        row.modules.length > 0
          ? row.modules.map((m) => ({ ...m, label: m.label ?? '' }))
          : [emptyModule()],
      )
      setCampaigns(
        row.campaigns.length > 0
          ? row.campaigns.map((c) => ({ ...c, title: c.title ?? '' }))
          : [emptyCampaign()],
      )
      setErr(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Laden mislukt.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const u = subscribeToTableChanges('site_settings', load)
    return () => u()
  }, [load])

  async function onSave() {
    try {
      setSaving(true)
      setOk(null)
      const mClean = modules
        .map((m) => ({
          id: m.id.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, ''),
          enabled: m.enabled,
          label: m.label?.trim() || undefined,
        }))
        .filter((m) => m.id.length > 0)
      const cClean = campaigns
        .map((c) => ({
          id: c.id.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, ''),
          title: c.title?.trim() || undefined,
          active: c.active,
        }))
        .filter((c) => c.id.length > 0)
      await saveMarktenModulesSetting({ modules: mClean, campaigns: cClean })
      setErr(null)
      setOk('Opgeslagen in site_settings.markten_modules.')
      window.setTimeout(() => setOk(null), 5000)
      void load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Opslaan mislukt.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="admin-portal-card">
        <p>Laden…</p>
      </div>
    )
  }

  return (
    <div>
      {err ? (
        <div className="admin-portal-card" style={{ borderLeft: '4px solid #dc2626' }}>
          <strong>Fout:</strong> {err}
        </div>
      ) : null}
      {ok ? (
        <div className="admin-portal-card" style={{ borderLeft: '4px solid #4ade80' }}>
          {ok}
        </div>
      ) : null}

      <div className="admin-portal-card">
        <h2 className="admin-portal-card-title">Markten &amp; modules</h2>
        <p className="admin-portal-card-sub">
          Centrale vlaggen voor (toekomstige) marktplaats- en campagne-blokken. Opgeslagen in{' '}
          <code>site_settings</code> onder key <code>markten_modules</code> (jsonb: <code>modules</code>,{' '}
          <code>campaigns</code>). Publieke pagina&apos;s kunnen dit later uitlezen; wijzigingen zijn realtime
          bruikbaar zodra de UI daar aan gekoppeld is.
        </p>
      </div>

      <div className="admin-portal-card">
        <h3 className="admin-portal-card-title" style={{ fontSize: '1.02rem' }}>
          Modules
        </h3>
        <p className="admin-portal-card-sub" style={{ marginTop: 0 }}>
          Technische id (alleen <code>a-z</code>, <code>0-9</code>, <code>-</code>, <code>_</code>), optionele
          weergavenaam, en of de module actief is.
        </p>
        <div style={{ display: 'grid', gap: 10 }}>
          {modules.map((m, i) => (
            <div
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr auto auto',
                gap: 10,
                alignItems: 'center',
              }}
              className="admin-markten-row"
            >
              <input
                className="admin-portal-input"
                placeholder="id (bijv. donatie_markt)"
                value={m.id}
                onChange={(e) => {
                  const next = [...modules]
                  next[i] = { ...next[i], id: e.target.value }
                  setModules(next)
                }}
                aria-label={`Module id ${i + 1}`}
              />
              <input
                className="admin-portal-input"
                placeholder="Label (optioneel)"
                value={m.label ?? ''}
                onChange={(e) => {
                  const next = [...modules]
                  next[i] = { ...next[i], label: e.target.value }
                  setModules(next)
                }}
                aria-label={`Module label ${i + 1}`}
              />
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.86rem' }}>
                <input
                  type="checkbox"
                  checked={m.enabled}
                  onChange={(e) => {
                    const next = [...modules]
                    next[i] = { ...next[i], enabled: e.target.checked }
                    setModules(next)
                  }}
                />
                Aan
              </label>
              <button
                type="button"
                className="admin-portal-btn is-danger"
                onClick={() => setModules(modules.filter((_, j) => j !== i))}
                disabled={modules.length <= 1}
              >
                Verwijder
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="admin-portal-btn is-ghost"
          style={{ marginTop: 12 }}
          onClick={() => setModules([...modules, emptyModule()])}
        >
          + Module
        </button>
      </div>

      <div className="admin-portal-card">
        <h3 className="admin-portal-card-title" style={{ fontSize: '1.02rem' }}>
          Campagnes
        </h3>
        <p className="admin-portal-card-sub" style={{ marginTop: 0 }}>
          Lichte configuratie; echte campagne-rijen in een aparte tabel is een latere uitbreiding (
          <code>docs/ADMIN_LIVE_PLAN.md</code>).
        </p>
        <div style={{ display: 'grid', gap: 10 }}>
          {campaigns.map((c, i) => (
            <div
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr auto auto',
                gap: 10,
                alignItems: 'center',
              }}
              className="admin-markten-row"
            >
              <input
                className="admin-portal-input"
                placeholder="campagne-id"
                value={c.id}
                onChange={(e) => {
                  const next = [...campaigns]
                  next[i] = { ...next[i], id: e.target.value }
                  setCampaigns(next)
                }}
                aria-label={`Campagne id ${i + 1}`}
              />
              <input
                className="admin-portal-input"
                placeholder="Titel (optioneel)"
                value={c.title ?? ''}
                onChange={(e) => {
                  const next = [...campaigns]
                  next[i] = { ...next[i], title: e.target.value }
                  setCampaigns(next)
                }}
                aria-label={`Campagne titel ${i + 1}`}
              />
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.86rem' }}>
                <input
                  type="checkbox"
                  checked={c.active}
                  onChange={(e) => {
                    const next = [...campaigns]
                    next[i] = { ...next[i], active: e.target.checked }
                    setCampaigns(next)
                  }}
                />
                Actief
              </label>
              <button
                type="button"
                className="admin-portal-btn is-danger"
                onClick={() => setCampaigns(campaigns.filter((_, j) => j !== i))}
                disabled={campaigns.length <= 1}
              >
                Verwijder
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="admin-portal-btn is-ghost"
          style={{ marginTop: 12 }}
          onClick={() => setCampaigns([...campaigns, emptyCampaign()])}
        >
          + Campagne
        </button>
      </div>

      <div className="admin-portal-card">
        <button type="button" className="admin-portal-btn" onClick={() => void onSave()} disabled={saving}>
          {saving ? 'Opslaan…' : 'Opslaan'}
        </button>
      </div>
    </div>
  )
}
