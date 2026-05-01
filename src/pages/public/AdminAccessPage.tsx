import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLegacyUiSession } from '../../context/LegacyUiSessionContext'
import {
  fetchMyAdminShadowGrant,
  setMyAdminShadowGrant,
  type AdminShadowGrantRow,
} from '../../features/admin/adminContentService'
import { isSupabaseConfigured } from '../../lib/supabase'

export function AdminAccessPage() {
  const { shell } = useLegacyUiSession()
  const userId = shell?.user?.id ?? null
  const [grant, setGrant] = useState<AdminShadowGrantRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!userId || !isSupabaseConfigured) {
      setLoading(false)
      return
    }
    try {
      setGrant(await fetchMyAdminShadowGrant(userId))
      setErr(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Laden mislukt.')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  async function toggle(nextGranted: boolean) {
    if (!userId) return
    setSaving(true)
    setErr(null)
    setOk(null)
    try {
      await setMyAdminShadowGrant(userId, nextGranted)
      await load()
      setOk(
        nextGranted
          ? 'Toestemming gegeven. Admin kan nu read-only meekijken op je profielstatus.'
          : 'Toestemming ingetrokken. Admin kan niet langer meekijken.',
      )
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Opslaan mislukt.')
    } finally {
      setSaving(false)
    }
  }

  if (!userId) {
    return (
      <main className="page container" style={{ padding: '36px 0 64px', maxWidth: 620 }}>
        <h1 className="dash-title">Admin meekijken toestemming</h1>
        <p style={{ color: '#6b7280' }}>Je moet ingelogd zijn om deze instelling te beheren.</p>
        <Link to="/auth" className="btn btn-dark" style={{ marginTop: 12, display: 'inline-block' }}>
          Inloggen
        </Link>
      </main>
    )
  }

  const granted = grant?.granted === true

  return (
    <main className="page container" style={{ padding: '36px 0 64px', maxWidth: 680 }}>
      <h1 className="dash-title">Admin meekijken toestemming</h1>
      <p style={{ color: '#6b7280', fontSize: '.9rem' }}>
        Hiermee geef je <strong>tijdelijk</strong> toestemming aan de beheerder om read-only mee te kijken naar je
        profielstatus, recente donaties en community-koppelingen voor support/doelgerichte hulp.
      </p>

      {loading ? <p style={{ marginTop: 14, color: '#6b7280' }}>Laden…</p> : null}
      {err ? <p style={{ marginTop: 14, color: '#991b1b' }}>{err}</p> : null}
      {ok ? <p style={{ marginTop: 14, color: '#166534' }}>{ok}</p> : null}

      <div
        style={{
          marginTop: 18,
          padding: 20,
          borderRadius: 14,
          border: `1.5px solid ${granted ? '#86efac' : '#e5e7eb'}`,
          background: granted ? '#ecfdf5' : '#fff',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 800, color: '#1f2937' }}>Huidige status: {granted ? 'Toegestaan' : 'Niet toegestaan'}</div>
            <div style={{ fontSize: '.82rem', color: '#6b7280', marginTop: 4 }}>
              {granted
                ? `Gegeven op ${grant?.granted_at ? new Date(grant.granted_at).toLocaleString('nl-NL') : 'onbekend'}`
                : `Ingetrokken op ${grant?.revoked_at ? new Date(grant.revoked_at).toLocaleString('nl-NL') : 'nog nooit gegeven'}`}
            </div>
          </div>
          <button
            type="button"
            className={`btn ${granted ? 'btn-outline' : 'btn-dark'}`}
            disabled={saving}
            onClick={() => void toggle(!granted)}
          >
            {saving ? 'Opslaan…' : granted ? 'Toestemming intrekken' : 'Toestemming geven'}
          </button>
        </div>
      </div>

      <Link to="/account" className="btn btn-outline" style={{ marginTop: 18, display: 'inline-block' }}>
        ← Terug naar account
      </Link>
    </main>
  )
}
