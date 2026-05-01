import { useCallback, useEffect, useRef, useState } from 'react'
import {
  deleteNewsPost,
  fetchNewsPosts,
  subscribeToTableChanges,
  upsertNewsPost,
  type NewsPostRow,
} from '../../../../features/admin/adminContentService'
import type { HomeNewsType } from '../../../../features/public/homeNewsSeed'
import { HOME_NEWS_TYPE_META, NEWS_CATEGORY_KEYS } from '../../../../features/public/homeNewsSeed'
import { isSupabaseConfigured, supabase } from '../../../../lib/supabase'

const emptyDraft = {
  id: '',
  title: '',
  slug: '',
  excerpt: '',
  body: '',
  image_url: '',
  category: 'nieuws' as HomeNewsType,
  published: false,
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '-').toLowerCase()
}

export function AdminNewsSection() {
  const [rows, setRows] = useState<NewsPostRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [uploadingImg, setUploadingImg] = useState(false)
  const [draft, setDraft] = useState(emptyDraft)
  const imageFileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      setRows(await fetchNewsPosts(false))
      setErr(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Laden mislukt.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const unsub = subscribeToTableChanges('site_news_posts', load)
    return () => unsub()
  }, [load])

  async function onSave() {
    if (!draft.title.trim()) {
      setErr('Titel is verplicht.')
      return
    }
    try {
      const payload: Partial<NewsPostRow> & { title: string } = {
        title: draft.title.trim(),
        slug: draft.slug.trim() || null,
        excerpt: draft.excerpt.trim() || null,
        body: draft.body || null,
        image_url: draft.image_url.trim() || null,
        category: draft.category,
        published: draft.published,
      }
      if (draft.id) payload.id = draft.id
      await upsertNewsPost(payload)
      await load()
      setDraft(emptyDraft)
      if (imageFileRef.current) imageFileRef.current.value = ''
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Opslaan mislukt.')
    }
  }

  async function onPickImage(file: File | null) {
    if (!file) return
    if (!isSupabaseConfigured || !supabase) {
      setErr('Supabase is niet geconfigureerd; afbeelding uploaden niet mogelijk.')
      return
    }
    if (!file.type.startsWith('image/')) {
      setErr('Kies een afbeeldingsbestand (bijv. JPEG of PNG).')
      return
    }
    try {
      setErr(null)
      setUploadingImg(true)
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `news/${Date.now()}-${sanitizeFileName(file.name || `foto.${ext}`)}`
      const { error: upErr } = await supabase.storage.from('site-branding').upload(path, file, {
        upsert: true,
        contentType: file.type || undefined,
      })
      if (upErr) throw new Error(upErr.message)
      const { data } = supabase.storage.from('site-branding').getPublicUrl(path)
      setDraft((d) => ({ ...d, image_url: data.publicUrl }))
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload mislukt.')
    } finally {
      setUploadingImg(false)
      if (imageFileRef.current) imageFileRef.current.value = ''
    }
  }

  async function onDelete(id: string) {
    if (!window.confirm('Nieuwsbericht definitief verwijderen?')) return
    try {
      await deleteNewsPost(id)
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Verwijderen mislukt.')
    }
  }

  async function onTogglePublish(row: NewsPostRow) {
    try {
      await upsertNewsPost({
        id: row.id,
        title: row.title,
        slug: row.slug ?? null,
        excerpt: row.excerpt,
        body: row.body,
        image_url: row.image_url,
        category: row.category,
        published: !row.published,
        published_at: !row.published ? new Date().toISOString() : row.published_at ?? undefined,
      })
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Publiceren mislukt.')
    }
  }

  function onEdit(row: NewsPostRow) {
    setDraft({
      id: row.id,
      title: row.title,
      slug: row.slug ?? '',
      excerpt: row.excerpt ?? '',
      body: row.body ?? '',
      image_url: row.image_url ?? '',
      category: row.category,
      published: row.published,
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
        <h2 className="admin-portal-card-title">{draft.id ? 'Nieuwsbericht bewerken' : 'Nieuw bericht'}</h2>
        <p className="admin-portal-card-sub">
          Bij publiceren verschijnt het bericht live op <code>/nieuws</code> en op de homepage. Afbeeldingen worden in
          de bucket <code>site-branding/news/</code> gezet (dezelfde policies als Logo&apos;s &amp; Branding).
        </p>

        <div className="admin-portal-row">
          <input
            className="admin-portal-input"
            placeholder="Titel *"
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          />
          <input
            className="admin-portal-input"
            placeholder="Slug (optioneel)"
            value={draft.slug}
            onChange={(e) => setDraft((d) => ({ ...d, slug: e.target.value }))}
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <label htmlFor="admin-news-category" style={{ display: 'block', fontSize: '.82rem', fontWeight: 700, marginBottom: 6 }}>
            Categorie
          </label>
          <select
            id="admin-news-category"
            className="admin-portal-input"
            style={{ maxWidth: 420, fontSize: '0.92rem', cursor: 'pointer' }}
            value={draft.category}
            onChange={(e) =>
              setDraft((d) => ({ ...d, category: e.target.value as HomeNewsType }))
            }
          >
            {NEWS_CATEGORY_KEYS.map((k) => (
              <option key={k} value={k}>
                {HOME_NEWS_TYPE_META[k].emoji} {HOME_NEWS_TYPE_META[k].label}
              </option>
            ))}
          </select>
          <p style={{ fontSize: '.78rem', color: '#6b7280', margin: '8px 0 0', maxWidth: 520 }}>
            Bepaalt het label op de homepage en onder welk filter het bericht op <code>/nieuws</code> valt.
          </p>
        </div>

        <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' }}>
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              fontSize: '.88rem',
              cursor: uploadingImg ? 'wait' : 'pointer',
            }}
          >
            <strong style={{ flex: '0 0 auto' }}>Hoofdafbeelding</strong>
            <input
              ref={imageFileRef}
              type="file"
              accept="image/*"
              disabled={uploadingImg}
              onChange={(e) => void onPickImage(e.target.files?.[0] ?? null)}
            />
            {uploadingImg ? <span style={{ color: '#6b7280' }}>Uploaden…</span> : null}
          </label>
          <input
            className="admin-portal-input"
            style={{ flex: '1 1 260px', minWidth: 200 }}
            placeholder="Of plak een afbeelding-URL"
            value={draft.image_url}
            onChange={(e) => setDraft((d) => ({ ...d, image_url: e.target.value }))}
          />
        </div>
        {draft.image_url.trim() ? (
          <div style={{ marginTop: 12 }}>
            <img
              src={draft.image_url.trim()}
              alt="Voorbeeld"
              style={{ maxHeight: 140, maxWidth: '100%', borderRadius: 12, border: '1px solid var(--border, #e5e7eb)' }}
            />
          </div>
        ) : null}

        <div style={{ marginTop: 12 }}>
          <input
            className="admin-portal-input"
            placeholder="Samenvatting (excerpt)"
            value={draft.excerpt}
            onChange={(e) => setDraft((d) => ({ ...d, excerpt: e.target.value }))}
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <textarea
            className="admin-portal-textarea"
            placeholder="Inhoud (HTML/Markdown toegestaan als je eigen render hebt)"
            rows={8}
            value={draft.body}
            onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
          />
        </div>

        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.88rem' }}>
            <input
              type="checkbox"
              checked={draft.published}
              onChange={(e) => setDraft((d) => ({ ...d, published: e.target.checked }))}
            />
            Publiceren
          </label>
          <button type="button" className="admin-portal-btn" onClick={() => void onSave()}>
            {draft.id ? 'Wijzigingen opslaan' : 'Bericht toevoegen'}
          </button>
          {draft.id ? (
            <button type="button" className="admin-portal-btn is-ghost" onClick={() => setDraft(emptyDraft)}>
              Annuleren
            </button>
          ) : null}
        </div>
      </div>

      <div className="admin-portal-card">
        <h2 className="admin-portal-card-title">Alle berichten</h2>
        {loading ? (
          <p>Laden…</p>
        ) : rows.length === 0 ? (
          <div className="admin-portal-empty">Nog geen nieuwsberichten.</div>
        ) : (
          <div className="admin-portal-table-wrap">
            <table className="admin-portal-table">
            <thead>
              <tr>
                <th>Titel</th>
                <th>Categorie</th>
                <th>Status</th>
                <th>Aangemaakt</th>
                <th style={{ textAlign: 'right' }}>Acties</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.title}</strong>
                    {r.excerpt ? (
                      <div style={{ fontSize: '.82rem', color: '#6b7280', marginTop: 4 }}>{r.excerpt}</div>
                    ) : null}
                  </td>
                  <td>
                    <span style={{ fontSize: '.85rem', fontWeight: 600 }}>
                      {HOME_NEWS_TYPE_META[r.category]?.emoji}{' '}
                      {HOME_NEWS_TYPE_META[r.category]?.label ?? r.category}
                    </span>
                  </td>
                  <td>
                    <span className={`admin-portal-badge ${r.published ? 'ok' : 'warn'}`}>
                      {r.published ? 'gepubliceerd' : 'concept'}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontSize: '.78rem', color: '#6b7280' }}>
                      {new Date(r.created_at).toLocaleString('nl-NL')}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button type="button" className="admin-portal-btn is-ghost" onClick={() => onEdit(r)}>Bewerk</button>
                    <button
                      type="button"
                      className="admin-portal-btn is-blue"
                      style={{ marginLeft: 6 }}
                      onClick={() => void onTogglePublish(r)}
                    >
                      {r.published ? 'Depubliceer' : 'Publiceer'}
                    </button>
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
