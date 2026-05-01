import { useCallback, useEffect, useState } from 'react'
import {
  fetchBrandingSettings,
  saveBrandingSettings,
  subscribeToTableChanges,
  type BrandingSettings,
} from '../../../../features/admin/adminContentService'
import { isSupabaseConfigured, supabase } from '../../../../lib/supabase'

type UploadTarget = 'logoNavUrl' | 'logoFooterUrl' | 'logoAdminUrl' | 'faviconUrl'

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '-').toLowerCase()
}

export function AdminLogosSection() {
  const [form, setForm] = useState<BrandingSettings>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState<UploadTarget | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const row = await fetchBrandingSettings()
      setForm(row)
      setErr(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Laden mislukt.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const unsub = subscribeToTableChanges('site_settings', load)
    return () => unsub()
  }, [load])

  async function onSave() {
    try {
      setSaving(true)
      setOk(null)
      await saveBrandingSettings(form)
      setErr(null)
      setOk('Branding opgeslagen. Publieke site pakt dit live op.')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Opslaan mislukt.')
    } finally {
      setSaving(false)
    }
  }

  async function onUpload(target: UploadTarget, file: File | null) {
    if (!file) return
    if (!isSupabaseConfigured || !supabase) {
      setErr('Supabase is niet geconfigureerd, upload niet mogelijk.')
      return
    }
    try {
      setErr(null)
      setOk(null)
      setUploading(target)
      const ext = (file.name.split('.').pop() || 'png').toLowerCase()
      const path = `branding/${target}-${Date.now()}-${sanitizeFileName(file.name || `file.${ext}`)}`
      const { error: upErr } = await supabase.storage
        .from('site-branding')
        .upload(path, file, { upsert: true, contentType: file.type || undefined })
      if (upErr) throw new Error(upErr.message)
      const { data } = supabase.storage.from('site-branding').getPublicUrl(path)
      const url = data.publicUrl
      setForm((p) => ({ ...p, [target]: url }))
      setOk('Upload gelukt. Klik nog op "Opslaan" om dit live toe te passen.')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload mislukt.')
    } finally {
      setUploading(null)
    }
  }

  return (
    <div>
      {err ? (
        <div className="admin-portal-card" style={{ borderLeft: '4px solid #dc2626' }}>
          <strong>Fout:</strong> {err}
        </div>
      ) : null}
      {ok ? (
        <div className="admin-portal-card" style={{ borderLeft: '4px solid #10b981' }}>
          {ok}
        </div>
      ) : null}

      <div className="admin-portal-card">
        <h2 className="admin-portal-card-title">Logo&apos;s & Branding</h2>
        <p className="admin-portal-card-sub">
          Kies per onderdeel een bestand, of plak handmatig een URL. Dit wordt opgeslagen in{' '}
          <code>site_settings.branding</code> en live toegepast.
        </p>
      </div>

      <div className="admin-portal-card">
        {loading ? (
          <p>Laden...</p>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            <label>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Navbar/logo (aanbevolen: SVG of PNG, 512x512)</div>
              <input
                type="file"
                accept="image/svg+xml,image/png,image/webp,image/jpeg"
                onChange={(e) => void onUpload('logoNavUrl', e.target.files?.[0] ?? null)}
                style={{ marginBottom: 8 }}
              />
              <input
                className="admin-portal-input"
                value={form.logoNavUrl ?? ''}
                onChange={(e) => setForm((p) => ({ ...p, logoNavUrl: e.target.value }))}
                placeholder="https://..."
              />
            </label>

            <label>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Footer logo (aanbevolen: SVG of PNG, 256x256)</div>
              <input
                type="file"
                accept="image/svg+xml,image/png,image/webp,image/jpeg"
                onChange={(e) => void onUpload('logoFooterUrl', e.target.files?.[0] ?? null)}
                style={{ marginBottom: 8 }}
              />
              <input
                className="admin-portal-input"
                value={form.logoFooterUrl ?? ''}
                onChange={(e) => setForm((p) => ({ ...p, logoFooterUrl: e.target.value }))}
                placeholder="https://..."
              />
            </label>

            <label>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Admin logo (aanbevolen: PNG of SVG, 256x256)</div>
              <input
                type="file"
                accept="image/svg+xml,image/png,image/webp,image/jpeg"
                onChange={(e) => void onUpload('logoAdminUrl', e.target.files?.[0] ?? null)}
                style={{ marginBottom: 8 }}
              />
              <input
                className="admin-portal-input"
                value={form.logoAdminUrl ?? ''}
                onChange={(e) => setForm((p) => ({ ...p, logoAdminUrl: e.target.value }))}
                placeholder="https://..."
              />
            </label>

            <label>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Favicon (aanbevolen: PNG 32x32 of ICO)</div>
              <input
                type="file"
                accept="image/png,image/x-icon,image/vnd.microsoft.icon,image/svg+xml"
                onChange={(e) => void onUpload('faviconUrl', e.target.files?.[0] ?? null)}
                style={{ marginBottom: 8 }}
              />
              <input
                className="admin-portal-input"
                value={form.faviconUrl ?? ''}
                onChange={(e) => setForm((p) => ({ ...p, faviconUrl: e.target.value }))}
                placeholder="https://..."
              />
            </label>

            <div>
              <button
                type="button"
                className="admin-portal-btn"
                onClick={() => void onSave()}
                disabled={saving || uploading !== null}
              >
                {saving ? 'Opslaan...' : uploading ? 'Uploaden...' : 'Opslaan'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
