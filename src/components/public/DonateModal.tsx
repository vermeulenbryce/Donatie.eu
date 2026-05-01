import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { LegacyShellUser } from '../../context/LegacyUiSessionContext'
import {
  ALL_PAY_METHODS,
  FREQ_CONFIG,
  type LegacyDonateFreq,
} from '../../features/legacy/legacyCbfConstants'
import {
  computeDonorPointsPreviewSync,
  getDonationAmountsSync,
  preloadDonationSiteSettings,
} from '../../features/donations/donationSiteSettings'

const DONATE_ICON_SRC = '/legacy-cause-donate-icon.jpg'

/** Zelfde mapping als goede-doelen → createDonation: alleen maandelijkse frequentie telt. */
function donationTypeFromFreq(f: LegacyDonateFreq): 'eenmalig' | 'maandelijks' {
  return f === 'maandelijks' ? 'maandelijks' : 'eenmalig'
}

function minEuroForDonationType(
  f: LegacyDonateFreq,
  am: ReturnType<typeof getDonationAmountsSync>,
): number {
  return f === 'maandelijks' ? am.maandelijks_min : am.eenmalig_min
}

/** Eerste snelkoppelbedrag ≥ minimum, anders voldoende hoog. */
function pickSensibleAmount(f: LegacyDonateFreq, am: ReturnType<typeof getDonationAmountsSync>): number {
  const c = FREQ_CONFIG[f]
  const min = minEuroForDonationType(f, am)
  const fromButtons = c.bedragen.filter((x) => x >= min)
  if (fromButtons.length) return fromButtons[0]
  if (f === 'eenmalig' && am.default_buckets.length) {
    const d = am.default_buckets.filter((x) => x >= min).sort((a, b) => a - b)
    if (d.length) return d[0]
  }
  return Math.max(c.bedragen[0] ?? min, min)
}

function DonateIconThumb() {
  return (
    <span
      style={{
        width: 22,
        height: 22,
        borderRadius: 5,
        overflow: 'hidden',
        display: 'inline-flex',
        alignItems: 'center',
        flexShrink: 0,
        verticalAlign: 'middle',
        marginRight: 6,
      }}
    >
      <img src={DONATE_ICON_SRC} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </span>
  )
}

type DonateModalProps = {
  open: boolean
  onClose: () => void
  org: string
  title: string
  shell: LegacyShellUser | null
  onRequireLogin: () => void
  recordDonation: (input: {
    amount: number
    pts: number
    causeTitle: string
    org: string
    frequency: LegacyDonateFreq
  }) => void | Promise<void | { cloudOk: boolean; cloudError?: string }>
  onToast?: (message: string, variant: 'success' | 'error') => void
}

export function DonateModal({
  open,
  onClose,
  org,
  title,
  shell,
  onRequireLogin,
  recordDonation,
  onToast,
}: DonateModalProps) {
  const navigate = useNavigate()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [freq, setFreq] = useState<LegacyDonateFreq>('eenmalig')
  const [amount, setAmount] = useState(10)
  const [customOpen, setCustomOpen] = useState(false)
  const [selectedPay, setSelectedPay] = useState<string | null>(null)
  const [pointsCfgTick, setPointsCfgTick] = useState(0)

  useEffect(() => {
    if (!open) return
    let cancel = false
    void (async () => {
      await preloadDonationSiteSettings(true)
      if (cancel) return
      setPointsCfgTick((x) => x + 1)
      const am = getDonationAmountsSync()
      setStep(1)
      setFreq('eenmalig')
      setCustomOpen(false)
      setAmount(pickSensibleAmount('eenmalig', am))
      setSelectedPay(null)
    })()
    return () => {
      cancel = true
    }
  }, [open, org, title])

  const cfg = FREQ_CONFIG[freq]

  const displayBedragen = useMemo(() => {
    const am = getDonationAmountsSync()
    const min = minEuroForDonationType(freq, am)
    const source =
      freq === 'eenmalig' && am.default_buckets.length > 0 ? am.default_buckets : cfg.bedragen
    const chips = [...new Set(source)]
      .filter((x) => x >= min)
      .sort((a, b) => a - b)
    if (chips.length) return chips
    return [Math.max(min, 1)]
  }, [freq, cfg.bedragen, pointsCfgTick])

  const minHint = useMemo(() => {
    const am = getDonationAmountsSync()
    return minEuroForDonationType(freq, am)
  }, [freq, pointsCfgTick])

  const ptsPreview = useMemo(
    () => computeDonorPointsPreviewSync(amount),
    [amount, pointsCfgTick],
  )

  const freqSuffixText = freq !== 'eenmalig' && cfg.suffix ? ` (${cfg.suffix})` : ''

  const selectFreq = useCallback((f: LegacyDonateFreq) => {
    setFreq(f)
    const am = getDonationAmountsSync()
    setAmount(pickSensibleAmount(f, am))
    setCustomOpen(false)
  }, [])

  const goToPayStep = useCallback(async () => {
    if (!amount || amount < 1) {
      onToast?.('Kies een bedrag.', 'error')
      return
    }
    if (!shell) {
      onClose()
      onRequireLogin()
      onToast?.('Maak eerst een account aan om te doneren.', 'error')
      return
    }
    await preloadDonationSiteSettings(true)
    const am = getDonationAmountsSync()
    const dtype = donationTypeFromFreq(freq)
    const min = dtype === 'maandelijks' ? am.maandelijks_min : am.eenmalig_min
    if (amount < min) {
      onToast?.(
        `Dit bedrag is te laag. Minimum is €${min} voor ${
          dtype === 'maandelijks' ? 'maandelijkse' : 'eenmalige (of kwartaal/jaar)'
        } donaties (Admin → Donatiebedragen).`,
        'error',
      )
      return
    }
    setStep(2)
    setSelectedPay(ALL_PAY_METHODS[0]?.id ?? 'ideal')
  }, [amount, freq, onClose, onRequireLogin, onToast, shell])

  const backToAmount = useCallback(() => {
    setStep(1)
  }, [])

  const confirmDonation = useCallback(async () => {
    if (!shell) return
    await preloadDonationSiteSettings(true)
    const am = getDonationAmountsSync()
    const dtype = donationTypeFromFreq(freq)
    const min = dtype === 'maandelijks' ? am.maandelijks_min : am.eenmalig_min
    if (!Number.isFinite(amount) || amount < min) {
      onToast?.(
        `Dit bedrag is te laag. Minimum is €${min} (ingesteld onder Admin → Donatiebedragen).`,
        'error',
      )
      return
    }
    const pts = computeDonorPointsPreviewSync(amount)
    try {
      const res = await recordDonation({ amount, pts, causeTitle: title, org, frequency: freq })
      const cloudBad =
        res &&
        typeof res === 'object' &&
        'cloudOk' in res &&
        (res as { cloudOk: boolean }).cloudOk === false
      if (cloudBad) {
        const err = (res as { cloudError?: string }).cloudError ?? 'Onbekende fout'
        onToast?.(
          `Lokaal wel bijgewerkt, maar de database weigerde: ${err} — o.a. RLS of minimum; zie docs/SQL_DONATIONS_RLS.sql. Blijf op de betaalstap om te corrigeren.`,
          'error',
        )
        return
      }
      setStep(3)
      onToast?.('Donatie ontvangen! 💙 Bedankt voor je bijdrage.', 'success')
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Donatie afronden mislukt.', 'error')
    }
  }, [amount, freq, org, recordDonation, shell, title, onToast])

  if (!open) return null

  return (
    <div className="modal-overlay open" id="donateModal" role="dialog" aria-modal="true" aria-labelledby="donateTitle">
      <div className="modal-box">
        <button type="button" className="modal-close" onClick={onClose} aria-label="Sluiten">
          ×
        </button>

        {step === 1 && (
          <div id="donateStep1">
            <div className="modal-title" id="donateTitle">
              Doneer nu
            </div>
            <div className="modal-sub" id="donateOrg">
              {org}
            </div>
            <div
              style={{
                display: 'flex',
                gap: 6,
                marginBottom: 18,
                background: 'var(--off)',
                borderRadius: 'var(--r-sm)',
                padding: 4,
                overflowX: 'auto',
                WebkitOverflowScrolling: 'touch',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
              }}
            >
              {(['eenmalig', 'maandelijks', 'kwartaal', 'jaarlijks'] as const).map((f) => {
                const id =
                  f === 'eenmalig'
                    ? 'freqEenmalig'
                    : f === 'maandelijks'
                      ? 'freqMaandelijks'
                      : f === 'kwartaal'
                        ? 'freqKwartaal'
                        : 'freqJaarlijks'
                const label =
                  f === 'eenmalig'
                    ? 'Eenmalig'
                    : f === 'maandelijks'
                      ? 'Maandelijks'
                      : f === 'kwartaal'
                        ? 'Per kwartaal'
                        : 'Jaarlijks'
                return (
                  <button
                    key={f}
                    id={id}
                    type="button"
                    className={`freq-tab${freq === f ? ' freq-active' : ''}`}
                    onClick={() => selectFreq(f)}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
            <div
              id="freqBadge"
              style={{
                fontSize: '.75rem',
                color: 'var(--blue-dark)',
                background: 'var(--blue-light)',
                borderRadius: 20,
                padding: '4px 12px',
                marginBottom: 12,
                display: 'inline-block',
              }}
            >
              🔥 <span id="freqBadgeText">{cfg.badge}</span>
            </div>
            <div style={{ fontSize: '.82rem', color: 'var(--mid)', marginBottom: 10, fontWeight: 600 }}>
              Kies een bedrag{' '}
              <span id="freqSuffix" style={{ fontWeight: 400 }}>
                {cfg.suffix ? `(${cfg.suffix})` : ''}
              </span>
            </div>
            <div className="amount-grid" id="amountGrid">
              {displayBedragen.map((amt) => (
                <div
                  key={amt}
                  role="button"
                  tabIndex={0}
                  className={`amount-opt${cfg.populair.includes(amt) ? ' popular' : ''}${!customOpen && amount === amt ? ' sel' : ''}`}
                  onClick={() => {
                    setCustomOpen(false)
                    setAmount(amt)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setCustomOpen(false)
                      setAmount(amt)
                    }
                  }}
                >
                  €{amt}
                </div>
              ))}
              <div
                role="button"
                tabIndex={0}
                className={`amount-opt${customOpen ? ' sel' : ''}`}
                id="customAmtOpt"
                onClick={() => {
                  setCustomOpen(true)
                  setAmount(0)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setCustomOpen(true)
                    setAmount(0)
                  }
                }}
              >
                Ander
              </div>
            </div>
            <input
              type="number"
              className={`input mt8${customOpen ? '' : ' hidden'}`}
              id="customAmtInput"
              placeholder="Voer bedrag in (€)"
              value={customOpen ? amount || '' : ''}
              onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
            />
            <div className="donate-pts-preview" id="donPtsPreview">
              Je verdient <strong>{ptsPreview} punten</strong> met €{amount}
              {freqSuffixText} 🌟
            </div>
            <p style={{ fontSize: '.72rem', color: 'var(--light)', marginTop: 6, lineHeight: 1.4 }}>
              Minimum {freq === 'maandelijks' ? 'maandelijks' : 'eenmalig / kwartaal / jaar'}: <strong>€{minHint}</strong>{' '}
              (admin → donatiebedragen). Puntentelling volgt <strong>Admin → Puntensysteem</strong> (cache ±1 min).
            </p>
            <button
              type="button"
              className="btn btn-full btn-lg"
              onClick={() => void goToPayStep()}
              style={{
                marginTop: 16,
                background: 'linear-gradient(135deg,#1a237e,#3a98f8)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--r-sm)',
                padding: 14,
                fontSize: '1rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
              }}
            >
              Verder naar betalen →
            </button>
            <div style={{ marginTop: 10, textAlign: 'center', fontSize: '.75rem', color: 'var(--light)' }}>
              🔒 Veilig via Stichting Derdengelden · ANBI-gecontroleerd
            </div>
          </div>
        )}

        {step === 2 && (
          <div id="donateStep2">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <button
                type="button"
                onClick={backToAmount}
                style={{
                  background: '#f3f4f6',
                  border: 'none',
                  borderRadius: 8,
                  padding: '6px 12px',
                  fontSize: '.85rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  color: '#6b7280',
                }}
              >
                ← Terug
              </button>
              <div>
                <div style={{ fontWeight: 800, fontSize: '.95rem', color: 'var(--dark)' }} id="donateStep2Title">
                  Betalen
                </div>
                <div style={{ fontSize: '.78rem', color: 'var(--mid)' }} id="donateStep2Sub">
                  €{amount.toFixed(2)}
                  {freq !== 'eenmalig' && cfg.suffix ? ` ${cfg.suffix}` : ' eenmalig'} aan {title}
                </div>
              </div>
            </div>

            <div
              style={{
                fontSize: '.82rem',
                fontWeight: 700,
                color: 'var(--mid)',
                marginBottom: 10,
                textTransform: 'uppercase',
                letterSpacing: '.06em',
              }}
            >
              Kies betaalmethode
            </div>
            <div id="payMethodsGrid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
              {ALL_PAY_METHODS.map((m) => {
                const sel = selectedPay === m.id
                return (
                  <div
                    key={m.id}
                    role="button"
                    tabIndex={0}
                    data-method={m.id}
                    onClick={() => setSelectedPay(m.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setSelectedPay(m.id)
                      }
                    }}
                    style={{
                      padding: '12px 10px',
                      border: sel ? '2px solid #1a237e' : '2px solid #e5e7eb',
                      borderRadius: 10,
                      cursor: 'pointer',
                      textAlign: 'center',
                      transition: 'all .15s',
                      background: sel ? '#eff6ff' : '#fff',
                      opacity: sel ? 1 : 0.5,
                      transform: sel ? 'scale(1)' : 'scale(0.96)',
                    }}
                  >
                    <div style={{ fontSize: '1.5rem', marginBottom: 4 }}>{m.icon}</div>
                    <div style={{ fontWeight: 700, fontSize: '.82rem', color: '#1f2937' }}>{m.label}</div>
                    <div style={{ fontSize: '.7rem', color: '#9ca3af' }}>{m.desc}</div>
                    {m.popular ? (
                      <div
                        style={{
                          fontSize: '.65rem',
                          background: '#fef3c7',
                          color: '#b45309',
                          borderRadius: 4,
                          padding: '1px 6px',
                          marginTop: 4,
                          display: 'inline-block',
                        }}
                      >
                        ⭐ Populair
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>

            <div id="idealBankSelector" style={{ display: selectedPay === 'ideal' ? 'block' : 'none', marginBottom: 14 }}>
              <label style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--mid)', display: 'block', marginBottom: 6 }}>
                Selecteer jouw bank
              </label>
              <select id="idealBankSelect" className="input" style={{ fontSize: '.88rem' }} defaultValue="">
                <option value="">Kies jouw bank...</option>
                <option value="abn">ABN AMRO</option>
                <option value="ing">ING</option>
                <option value="rabo">Rabobank</option>
                <option value="sns">SNS Bank</option>
                <option value="asn">ASN Bank</option>
                <option value="bunq">bunq</option>
                <option value="regiobank">RegioBank</option>
                <option value="triodos">Triodos Bank</option>
                <option value="revolut">Revolut</option>
              </select>
            </div>

            <div id="cardInputSection" style={{ display: selectedPay === 'card' ? 'block' : 'none', marginBottom: 14 }}>
              <label style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--mid)', display: 'block', marginBottom: 6 }}>
                Kaartgegevens
              </label>
              <input
                id="cardNumber"
                className="input"
                placeholder="1234 5678 9012 3456"
                maxLength={19}
                style={{ fontSize: '.88rem', marginBottom: 8, letterSpacing: '.08em' }}
                onInput={(e) => {
                  const t = e.currentTarget
                  const v = t.value.replace(/\D/g, '').substring(0, 16)
                  t.value = v.replace(/(.{4})/g, '$1 ').trim()
                }}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input
                  id="cardExpiry"
                  className="input"
                  placeholder="MM/JJ"
                  maxLength={5}
                  style={{ fontSize: '.88rem' }}
                  onInput={(e) => {
                    const t = e.currentTarget
                    let v = t.value.replace(/\D/g, '')
                    if (v.length >= 2) v = `${v.substring(0, 2)}/${v.substring(2, 4)}`
                    t.value = v
                  }}
                />
                <input id="cardCvc" className="input" placeholder="CVC" maxLength={4} style={{ fontSize: '.88rem' }} />
              </div>
              <div style={{ fontSize: '.73rem', color: 'var(--light)', marginTop: 6 }}>
                🔒 Kaartgegevens worden versleuteld verwerkt via Stripe. Nooit opgeslagen op onze servers.
              </div>
            </div>

            <div
              id="payNotConfigured"
              style={{
                display: 'block',
                background: '#fffbeb',
                border: '1.5px solid #fcd34d',
                borderRadius: 10,
                padding: '12px 14px',
                fontSize: '.82rem',
                color: '#92400e',
                marginBottom: 14,
              }}
            >
              ⚙️ <strong>Demo / test</strong> — Mollie zou hier een betaalpagina openen; zolang die niet gekoppeld is, volstaat
              bevestigen om de flow te testen. Minimale bedragen uit Admin → Donatiebedragen gelden wel voor de database.
            </div>

            <div
              style={{
                background: 'var(--blue-light)',
                borderRadius: 'var(--r-sm)',
                padding: '10px 14px',
                fontSize: '.78rem',
                color: 'var(--blue-dark)',
                marginBottom: 14,
              }}
            >
              🔒 Veilig betalen · Stichting Derdengelden · ANBI-erkend
            </div>
            <button
              type="button"
              onClick={confirmDonation}
              className="btn btn-full btn-lg"
              id="confirmDonateBtn"
              style={{
                background: 'linear-gradient(135deg,#059669,#0d9488)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--r-sm)',
                padding: 14,
                fontSize: '1rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              ✅ Bevestig donatie
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="confirm-screen" id="donateConfirm">
            <span className="confirm-icon">🎉</span>
            <h2 className="ff" style={{ fontSize: '1.5rem', fontWeight: 900 }}>
              Bedankt voor je donatie!
            </h2>
            <p style={{ fontSize: '.9rem', color: 'var(--mid)', marginTop: 8 }}>Je bijdrage maakt echt het verschil.</p>
            <div className="confirm-pts-badge" id="confirmPtsBadge">
              ⭐ {computeDonorPointsPreviewSync(amount)} punten verdiend!
            </div>
            <p style={{ fontSize: '.82rem', color: 'var(--mid)' }} id="confirmRankMsg">
              Je staat nu in de ranglijst
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-dark" onClick={onClose}>
                Sluiten
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  onClose()
                  navigate('/account')
                }}
              >
                Bekijk mijn profiel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function DonateTriggerButton({
  label,
  className = 'btn btn-dark btn-lg',
  onClick,
}: {
  label: string
  className?: string
  onClick: () => void
}) {
  return (
    <button type="button" className={className} onClick={onClick}>
      <DonateIconThumb />
      {label}
    </button>
  )
}
