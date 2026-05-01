import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { LegacyShellUser } from '../../context/LegacyUiSessionContext'
import { submitFondsenwerverMelding } from '../../features/public/fondsenwerverMelding'

export function FondsenwerverMeldModal({
  open,
  onClose,
  shell,
}: {
  open: boolean
  onClose: () => void
  shell: LegacyShellUser | null
}) {
  const [naam, setNaam] = useState('')
  const [adres, setAdres] = useState('')
  const [org, setOrg] = useState('')
  const [tijd, setTijd] = useState('')
  const [omschrijving, setOmschrijving] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [submitErr, setSubmitErr] = useState<string | null>(null)
  const [successId, setSuccessId] = useState<string | null>(null)

  /** Alleen gebruikt bij openen van het modaal (zie effect). */
  const preset = useMemo(() => {
    if (!shell?.email) return { naam: '', adres: '', email: '' }
    const nm = `${shell.firstName || ''} ${shell.lastName || ''}`.trim()
    let addr = ''
    if (shell.source === 'session' && shell.user) {
      const pa = shell.user.address?.trim()
      const pc = shell.user.postalCode?.trim()
      const c = shell.user.city?.trim()
      if (pa || pc || c) addr = [pa, [pc, c].filter(Boolean).join(' ')].filter(Boolean).join(', ')
    }
    return { naam: nm, adres: addr, email: shell.email || '' }
  }, [shell])

  useEffect(() => {
    if (!open) return
    setSuccessId(null)
    setSubmitErr(null)
    setOrg('')
    setOmschrijving('')
    setNaam(preset.naam)
    setAdres(preset.adres)
    setEmail(preset.email)
    const now = new Date()
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
    setTijd(local)
  }, [open, preset])

  const closeAll = useCallback(() => {
    setSuccessId(null)
    setNaam('')
    setAdres('')
    setOrg('')
    setTijd('')
    setOmschrijving('')
    setEmail('')
    onClose()
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAll()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, closeAll])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const n = naam.trim()
    const adr = adres.trim()
    const t = tijd.trim()
    if (!n || !adr || !t) {
      setSubmitErr('Vul naam, adres en tijdstip in.')
      return
    }
    setBusy(true)
    setSubmitErr(null)
    try {
      const { meldId } = await submitFondsenwerverMelding({
        shell,
        naam: n,
        adres: adr,
        org,
        tijd: t,
        omschrijving,
        email,
      })
      setSuccessId(meldId)
    } catch {
      setSubmitErr('Opslaan mislukt. Probeer het nog eens.')
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return createPortal(
    <>
      {/* Meldingsformulier — layout gelijk aan `public/legacy-admin-index.html` #meldModal */}
      {!successId ? (
        <div
          role="presentation"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 4000,
            background: 'rgba(0,0,0,.6)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            display: 'flex',
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose()
          }}
        >
          <div
            role="dialog"
            aria-labelledby="meld-modal-title"
            aria-modal="true"
            style={{
              background: '#fff',
              borderRadius: 20,
              maxWidth: 500,
              width: '100%',
              padding: 0,
              overflow: 'hidden',
              boxShadow: '0 32px 80px rgba(0,0,0,.4)',
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div
              style={{
                background: 'linear-gradient(135deg,#dc2626,#b91c1c)',
                padding: '24px 28px',
                color: '#fff',
              }}
            >
              <div style={{ fontSize: '2rem', marginBottom: 8 }}>🚨</div>
              <h2 id="meld-modal-title" style={{ fontFamily: 'Fraunces,serif', fontSize: '1.4rem', fontWeight: 900, marginBottom: 4 }}>
                Meld ongewenste fondsenwerver
              </h2>
              <p style={{ fontSize: '.85rem', color: 'rgba(255,255,255,.85)', lineHeight: 1.5, margin: 0 }}>
                U heeft de NEE-sticker — maar toch aangebeld? Meld het direct. Wij nemen actie.
              </p>
            </div>
            <form onSubmit={(e) => void onSubmit(e)} style={{ padding: 28 }}>
              <div style={{ display: 'grid', gap: 14 }}>
                <Field label="Uw naam *">
                  <input
                    className="input"
                    placeholder="Voornaam en achternaam"
                    style={{ width: '100%', boxSizing: 'border-box' }}
                    value={naam}
                    onChange={(e) => setNaam(e.target.value)}
                    autoComplete="name"
                  />
                </Field>
                <Field label="Uw adres (postcode + huisnummer) *">
                  <input
                    className="input"
                    placeholder="bijv. 1234 AB 10"
                    style={{ width: '100%', boxSizing: 'border-box' }}
                    value={adres}
                    onChange={(e) => setAdres(e.target.value)}
                    autoComplete="street-address"
                  />
                </Field>
                <Field label="Naam of organisatie van de werver">
                  <input
                    className="input"
                    placeholder="bijv. Collectanten Rode Kruis / onbekend"
                    style={{ width: '100%', boxSizing: 'border-box' }}
                    value={org}
                    onChange={(e) => setOrg(e.target.value)}
                  />
                </Field>
                <Field label="Wanneer was dit? *">
                  <input
                    className="input"
                    type="datetime-local"
                    style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: '0.9rem' }}
                    value={tijd}
                    onChange={(e) => setTijd(e.target.value)}
                  />
                </Field>
                <Field label="Wat is er gebeurd?">
                  <textarea
                    className="input"
                    placeholder="Beschrijf kort wat er is voorgevallen..."
                    rows={3}
                    style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', fontSize: '0.9rem' }}
                    value={omschrijving}
                    onChange={(e) => setOmschrijving(e.target.value)}
                  />
                </Field>
                <Field label="Uw e-mailadres (voor terugkoppeling)">
                  <input
                    className="input"
                    type="email"
                    placeholder="optioneel — voor onze reactie"
                    style={{ width: '100%', boxSizing: 'border-box' }}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                </Field>
              </div>
              {submitErr ? (
                <p style={{ color: '#991b1b', fontSize: '.85rem', marginTop: 10, marginBottom: 0 }}>{submitErr}</p>
              ) : null}
              <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
                <button
                  type="submit"
                  disabled={busy}
                  style={{
                    flex: '1',
                    minWidth: 140,
                    background: '#dc2626',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 10,
                    padding: 13,
                    fontSize: '.95rem',
                    fontWeight: 700,
                    cursor: busy ? 'wait' : 'pointer',
                    boxShadow: '0 4px 12px rgba(220,38,38,.3)',
                  }}
                >
                  {busy ? 'Bezig…' : '🚨 Melding versturen'}
                </button>
                <button
                  type="button"
                  onClick={() => closeAll()}
                  style={{
                    background: '#f3f4f6',
                    color: '#6b7280',
                    border: 'none',
                    borderRadius: 10,
                    padding: '13px 20px',
                    fontSize: '.9rem',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Annuleren
                </button>
              </div>
              <div
                style={{
                  marginTop: 14,
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: 10,
                  padding: '12px 14px',
                  fontSize: '.78rem',
                  color: '#991b1b',
                  lineHeight: 1.6,
                }}
              >
                <strong>🔒 Privacy:</strong> Uw melding wordt vertrouwelijk behandeld en alleen gebruikt om de betreffende organisatie aan te spreken. U ontvangt binnen 3 werkdagen een reactie van ons team.
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Success-overlay — zoals `showMeldSuccess` in legacy */}
      {successId ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 5000,
            background: 'rgba(0,0,0,.5)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            display: 'flex',
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 20,
              maxWidth: 420,
              width: '100%',
              padding: 40,
              textAlign: 'center',
              boxShadow: '0 24px 60px rgba(0,0,0,.3)',
            }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                background: '#dcfce7',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2rem',
                margin: '0 auto 16px',
              }}
            >
              ✅
            </div>
            <h2 style={{ fontFamily: 'Fraunces,serif', fontSize: '1.4rem', fontWeight: 900, color: '#15803d', marginBottom: 8 }}>
              Melding verzonden!
            </h2>
            <p style={{ color: '#6b7280', fontSize: '.88rem', lineHeight: 1.7, marginBottom: 8 }}>
              Uw melding is succesvol ingediend. Ons team neemt binnen <strong>3 werkdagen</strong> contact met u op.
            </p>
            <div
              style={{
                background: '#f0fdf4',
                border: '1.5px solid #86efac',
                borderRadius: 10,
                padding: 12,
                marginBottom: 20,
              }}
            >
              <div style={{ fontSize: '.72rem', color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                Meldingsnummer
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#15803d', letterSpacing: '.05em' }}>{successId}</div>
            </div>
            {shell?.email ? (
              <p style={{ fontSize: '.8rem', color: '#6b7280', marginBottom: 20 }}>📬 Controleer je inbox voor een bevestiging (Meldingen / account).</p>
            ) : null}
            <button
              type="button"
              onClick={() => closeAll()}
              style={{
                background: 'linear-gradient(135deg,#3a98f8,#6c47ff)',
                color: '#fff',
                border: 'none',
                borderRadius: 12,
                padding: '12px 32px',
                fontSize: '.95rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Sluiten
            </button>
          </div>
        </div>
      ) : null}
    </>,
    document.body,
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label
        style={{
          fontSize: '.78rem',
          fontWeight: 700,
          color: '#6b7280',
          display: 'block',
          marginBottom: 5,
          textTransform: 'uppercase',
          letterSpacing: '.05em',
        }}
      >
        {label}
      </label>
      {children}
    </div>
  )
}
