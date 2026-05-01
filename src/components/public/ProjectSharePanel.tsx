import { useState } from 'react'

type Props = {
  projectTitle: string
  shareUrl: string
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  }
}

export function ProjectSharePanel({ projectTitle, shareUrl }: Props) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const body = `Steun "${projectTitle}" via Donatie.eu — ${shareUrl}`

  async function onShareClick() {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: projectTitle,
          text: body,
          url: shareUrl,
        })
        return
      } catch {
        /* user cancelled or error */
      }
    }
    setOpen(true)
  }

  async function onCopy() {
    const ok = await copyText(shareUrl)
    setCopied(ok)
    window.setTimeout(() => setCopied(false), 2000)
  }

  const wa = `https://wa.me/?text=${encodeURIComponent(body)}`
  const mail = `mailto:?subject=${encodeURIComponent(`Steun: ${projectTitle}`)}&body=${encodeURIComponent(body)}`

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        className="btn btn-outline btn-sm"
        onClick={() => void onShareClick()}
        style={{ fontWeight: 700 }}
      >
        🔗 Delen
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Project delen"
          style={{
            position: 'absolute',
            zIndex: 40,
            top: '100%',
            right: 0,
            marginTop: 8,
            background: '#fff',
            border: '1.5px solid #e5e7eb',
            borderRadius: 12,
            padding: 14,
            minWidth: 220,
            boxShadow: '0 12px 40px rgba(0,0,0,.12)',
          }}
        >
          <div style={{ fontSize: '.75rem', fontWeight: 800, marginBottom: 10, color: '#374151' }}>Deel link</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <a
              href={wa}
              target="_blank"
              rel="noreferrer"
              className="btn btn-dark btn-sm"
              style={{ textAlign: 'center', textDecoration: 'none' }}
            >
              WhatsApp
            </a>
            <a href={mail} className="btn btn-blue btn-sm" style={{ textAlign: 'center', textDecoration: 'none' }}>
              E-mail (Gmail / app)
            </a>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => void onCopy()}>
              {copied ? '✓ Gekopieerd' : 'Link kopiëren'}
            </button>
            <button
              type="button"
              className="btn btn-sm"
              style={{ background: '#f3f4f6', border: 'none' }}
              onClick={() => setOpen(false)}
            >
              Sluiten
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
