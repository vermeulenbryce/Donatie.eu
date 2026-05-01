import { useMemo, useState } from 'react'

const WIDTH_PRESETS = [360, 375, 390, 428, 768, 1024, 1280, 1440] as const

const PATH_PRESETS: { label: string; path: string }[] = [
  { label: 'Home', path: '/' },
  { label: 'Goede doelen', path: '/goede-doelen' },
  { label: 'Communities', path: '/communities' },
  { label: 'Account', path: '/account' },
  { label: 'FAQ', path: '/faq' },
  { label: 'Ranglijst', path: '/ranglijst' },
]

function normalizePath(p: string) {
  const t = p.trim() || '/'
  return t.startsWith('/') ? t : `/${t}`
}

export function AdminResponsiveSection() {
  const [path, setPath] = useState('/')
  const [width, setWidth] = useState(390)

  const previewUrl = useMemo(() => {
    if (typeof window === 'undefined') return '/'
    return `${window.location.origin}${normalizePath(path)}`
  }, [path])

  return (
    <div>
      <div className="admin-portal-card" style={{ marginBottom: 16 }}>
        <h2 className="admin-portal-card-title">Responsive preview</h2>
        <p className="admin-portal-card-sub">
          Publieke site in een iframe op vaste scherm­breedtes. Data komt overeen met de live site (zelfde origin); je
          ziet dezelfde sessie als in dit tabblad.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: '.78rem', fontWeight: 700, color: '#6b7280' }}>Snel naar</span>
          {PATH_PRESETS.map((p) => (
            <button
              key={p.path}
              type="button"
              className="admin-portal-btn is-ghost"
              onClick={() => setPath(p.path)}
              style={{
                fontWeight: path === p.path ? 800 : 500,
                borderColor: path === p.path ? '#283593' : undefined,
                padding: '6px 12px',
                fontSize: '0.82rem',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: '.78rem', fontWeight: 700, color: '#6b7280' }}>Pad</span>
          <input
            type="text"
            className="admin-portal-input"
            placeholder="/eigen-pad"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            aria-label="Publiek pad"
            style={{ maxWidth: 400, flex: '1 1 220px' }}
          />
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontSize: '.78rem', fontWeight: 700, color: '#6b7280' }}>Breedte (px)</span>
          {WIDTH_PRESETS.map((w) => (
            <button
              key={w}
              type="button"
              className="admin-portal-btn is-ghost"
              onClick={() => setWidth(w)}
              style={{
                fontWeight: width === w ? 800 : 500,
                borderColor: width === w ? '#283593' : undefined,
                padding: '6px 11px',
                fontSize: '0.82rem',
              }}
            >
              {w}
            </button>
          ))}
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 4 }}>
            <span style={{ fontSize: '.75rem', color: '#6b7280' }}>Aangepast</span>
            <input
              type="number"
              className="admin-portal-input"
              min={280}
              max={1920}
              value={width}
              onChange={(e) => {
                const n = Number(e.target.value)
                if (!Number.isFinite(n)) return
                setWidth(Math.min(1920, Math.max(280, Math.round(n))))
              }}
              style={{ width: 88 }}
              aria-label="Aangepaste breedte in pixels"
            />
          </label>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          width: '100%',
          minHeight: 0,
        }}
      >
        <div
          style={{
            width,
            maxWidth: '100%',
            height: 'min(78vh, 920px)',
            border: '1px solid #d1d5db',
            borderRadius: 10,
            overflow: 'hidden',
            boxShadow: '0 6px 24px rgba(15, 23, 42, 0.12)',
            background: '#e5e7eb',
          }}
        >
          <iframe
            key={previewUrl}
            title="Publieke site (responsive preview)"
            src={previewUrl}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              display: 'block',
              background: '#fff',
            }}
          />
        </div>
      </div>
    </div>
  )
}
