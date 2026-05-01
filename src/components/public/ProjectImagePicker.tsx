import { useRef, useState } from 'react'
import { assertUserImagePassesAzureModeration } from '../../features/safety/azureImageModeration'
import { fileToResizedDataUrl } from '../../features/profile/profileImageService'

export function ProjectImagePicker({
  value,
  onChange,
  label = 'Projectfoto (optioneel)',
  maxSide = 1600,
  quality = 0.82,
}: {
  value: string | null
  onChange: (dataUrl: string | null) => void
  label?: string
  maxSide?: number
  quality?: number
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function onPick(file: File | null) {
    if (!file) return
    setBusy(true)
    setErr(null)
    try {
      const dataUrl = await fileToResizedDataUrl(file, { maxSide, quality })
      await assertUserImagePassesAzureModeration(dataUrl)
      onChange(dataUrl)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Foto verwerken mislukt.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div
      style={{
        background: '#f8fafc',
        border: '1.5px solid #e2e8f0',
        borderRadius: 14,
        padding: 12,
        display: 'grid',
        gap: 10,
      }}
    >
      <div style={{ fontWeight: 700, fontSize: '.82rem', color: '#334155' }}>{label}</div>

      {value ? (
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: 180,
            borderRadius: 12,
            overflow: 'hidden',
            background: '#0f172a',
          }}
        >
          <img
            src={value}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        </div>
      ) : (
        <div
          style={{
            width: '100%',
            height: 140,
            borderRadius: 12,
            background:
              'linear-gradient(135deg,#e2e8f0,#f1f5f9) center/20px 20px, repeating-linear-gradient(45deg,#e2e8f0 0,#e2e8f0 12px,#f1f5f9 12px,#f1f5f9 24px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#94a3b8',
            fontSize: '.88rem',
            fontWeight: 700,
          }}
        >
          Geen foto geselecteerd
        </div>
      )}

      {err ? (
        <div
          style={{
            background: '#fef2f2',
            border: '1.5px solid #fecaca',
            color: '#991b1b',
            borderRadius: 8,
            padding: '6px 10px',
            fontSize: '.78rem',
          }}
        >
          {err}
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => void onPick(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? 'Bezig…' : value ? 'Foto wijzigen' : 'Foto uploaden'}
        </button>
        {value ? (
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={busy}
            onClick={() => onChange(null)}
            style={{ color: '#991b1b', borderColor: '#fecaca' }}
          >
            Verwijderen
          </button>
        ) : null}
      </div>
      <div style={{ fontSize: '.7rem', color: '#94a3b8' }}>
        Aanbevolen: 3:2 verhouding. JPG/PNG/WebP · automatisch verkleind.
      </div>
    </div>
  )
}
