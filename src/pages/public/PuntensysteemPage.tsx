import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DONNIE_OPEN_QUESTION_EVENT } from '../../components/public/DonnieChatbot'
import { useLegacyUiSession } from '../../context/LegacyUiSessionContext'
import {
  computeDonorPointsPreviewSync,
  getDonationAmountsSync,
  getPointsConfigSync,
  preloadDonationSiteSettings,
} from '../../features/donations/donationSiteSettings'

const EARN_CARDS = [
  {
    bg: '#f8faff',
    border: '#e0e7ff',
    iconBg: 'linear-gradient(135deg,#4f46e5,#6366f1)',
    title: 'Per €1 donatie',
    val: '+0,5 pt',
    color: '#4f46e5',
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
    text: 'Elke euro die je doneert levert direct punten op, ongeacht het bedrag.',
  },
  {
    bg: '#f0fdf4',
    border: '#bbf7d0',
    iconBg: 'linear-gradient(135deg,#059669,#10b981)',
    title: 'Terugkerende donatie',
    val: '×1,2',
    color: '#059669',
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
        <polyline points="23 4 23 10 17 10" />
        <path d="M20.49 15a9 9 0 1 1-.18-3.36" />
      </svg>
    ),
    text: 'Maandelijkse of jaarlijkse donaties geven je automatisch 20% extra punten.',
  },
  {
    bg: '#fffbeb',
    border: '#fde68a',
    iconBg: 'linear-gradient(135deg,#d97706,#f59e0b)',
    title: 'Campagnebonus',
    val: '×1,5',
    color: '#d97706',
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
    text: 'Doneer tijdens actieve campagnes en pak tot 50% extra punten boven op je totaal.',
  },
  {
    bg: '#faf5ff',
    border: '#ddd6fe',
    iconBg: 'linear-gradient(135deg,#7c3aed,#8b5cf6)',
    title: 'Sticker kopen',
    val: '+50–100',
    color: '#7c3aed',
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
        <line x1="7" y1="7" x2="7.01" y2="7" />
      </svg>
    ),
    text: 'Persoonlijke sticker +50 pt · Zakelijke sticker +100 pt eenmalig.',
  },
  {
    bg: '#fff1f2',
    border: '#fecaca',
    iconBg: 'linear-gradient(135deg,#dc2626,#ef4444)',
    title: 'Donatie-streak',
    val: '+5 bonus',
    color: '#dc2626',
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
    ),
    text: 'Doneer 3 maanden op rij en ontvang elke maand een extra streakbonus.',
  },
  {
    bg: '#f0f9ff',
    border: '#bae6fd',
    iconBg: 'linear-gradient(135deg,#0284c7,#38bdf8)',
    title: 'Vriend uitnodigen',
    val: '+25 pt',
    color: '#0284c7',
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <line x1="19" y1="8" x2="19" y2="14" />
        <line x1="22" y1="11" x2="16" y2="11" />
      </svg>
    ),
    text: 'Nodig een vriend uit die doneert — jullie ontvangen allebei 25 punten.',
  },
]

const REWARD_GROUPS = [
  {
    head: 'linear-gradient(135deg,#f59e0b 0%,#f97316 100%)',
    icon: '🎟️',
    title: 'Kortingsbonnen',
    sub: 'Korting bij populaire winkels',
    rows: [
      ['Bol.com — €5 korting', '150 pt', '#fffbeb', '#d97706'],
      ['HEMA — €10 korting', '280 pt', '#fffbeb', '#d97706'],
      ['Coolblue — €15 korting', '420 pt', '#fffbeb', '#d97706'],
    ],
  },
  {
    head: 'linear-gradient(135deg,#059669 0%,#10b981 100%)',
    icon: '🏨',
    title: 'Weekendjes weg',
    sub: 'Overnachtingen & uitjes',
    rows: [
      ['Glamping voor 2 personen', '800 pt', '#f0fdf4', '#059669'],
      ['Stadshotel 1 nacht (2p)', '1.200 pt', '#f0fdf4', '#059669'],
      ['Wellness weekend (2p)', '2.500 pt', '#f0fdf4', '#059669'],
    ],
  },
  {
    head: 'linear-gradient(135deg,#7c3aed 0%,#8b5cf6 100%)',
    icon: '🎁',
    title: 'Producten',
    sub: 'Duurzame cadeaus & gadgets',
    rows: [
      ['Donatie.eu drinkfles', '200 pt', '#faf5ff', '#7c3aed'],
      ['Biologisch cadeaupakket', '450 pt', '#faf5ff', '#7c3aed'],
      ['Zonnepanelen donatieset', '900 pt', '#faf5ff', '#7c3aed'],
    ],
  },
  {
    head: 'linear-gradient(135deg,#dc2626 0%,#ef4444 100%)',
    icon: '🎰',
    title: 'Loterijen',
    sub: 'Maandelijkse prijstrekking',
    rows: [
      ['Loterijlot - pot EUR 500', '50 pt', '#fef2f2', '#dc2626'],
      ['Gouden lot - pot EUR 2.000', '150 pt', '#fef2f2', '#dc2626'],
      ['Jackpot-lot - pot EUR 10.000', '500 pt', '#fef2f2', '#dc2626'],
    ],
  },
  {
    head: 'linear-gradient(135deg,#ea580c 0%,#f97316 100%)',
    icon: '🎭',
    title: 'Ervaringen',
    sub: 'Unieke uitjes & activiteiten',
    rows: [
      ['Kookworkshop voor 2', '350 pt', '#fff7ed', '#ea580c'],
      ['Rondvaart Amsterdam (2p)', '300 pt', '#fff7ed', '#ea580c'],
      ['Museumjaarkaart (1 jaar)', '600 pt', '#fff7ed', '#ea580c'],
    ],
  },
  {
    head: 'linear-gradient(135deg,#0284c7 0%,#0ea5e9 100%)',
    icon: '💚',
    title: 'Extra donatie',
    sub: 'Geef je beloning door',
    rows: [
      ['EUR 10 extra donatie', '100 pt', '#f0f9ff', '#0284c7'],
      ['EUR 25 extra donatie', '230 pt', '#f0f9ff', '#0284c7'],
      ['EUR 50 extra donatie', '420 pt', '#f0f9ff', '#0284c7'],
    ],
  },
]

const LEVEL_CARDS = [
  ['🌱', 'Starter', '0 - 99 pt', 'Kortingsbonnen & loterijen', '#86efac', 'linear-gradient(180deg,#f0fdf4,#fff)', '#166534', '#dcfce7'],
  ['⭐', 'Donateur', '100 - 499 pt', '+ Producten & ervaringen', '#fde68a', 'linear-gradient(180deg,#fffbeb,#fff)', '#92400e', '#fef3c7'],
  ['💎', 'Kampioen', '500 - 1.499 pt', '+ Weekendjes weg & workshops', '#93c5fd', 'linear-gradient(180deg,#eff6ff,#fff)', '#1e40af', '#dbeafe'],
  ['🏆', 'Elite', '1.500 - 2.999 pt', '+ Wellness & exclusieve loten', '#c4b5fd', 'linear-gradient(180deg,#faf5ff,#fff)', '#5b21b6', '#ede9fe'],
  ['👑', 'Legende', '3.000+ pt', '+ VIP & jackpot-loten', '#fca5a5', 'linear-gradient(180deg,#fff1f2,#fff)', '#991b1b', '#fee2e2'],
] as const

function formatPtsPerOneEuro(): string {
  const { divisor, pointsPerTenEuro } = getPointsConfigSync()
  if (!divisor || divisor <= 0) return '—'
  const perOne = pointsPerTenEuro / divisor
  const rounded = Math.round(perOne * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace('.', ',')
}

export function PuntensysteemPage() {
  const { shell } = useLegacyUiSession()
  const [amount, setAmount] = useState('25')
  const [cfgTick, setCfgTick] = useState(0)

  useEffect(() => {
    void preloadDonationSiteSettings(true).then(() => setCfgTick((t) => t + 1))
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        void preloadDonationSiteSettings(true).then(() => setCfgTick((t) => t + 1))
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  const amountBuckets = useMemo(() => getDonationAmountsSync().default_buckets.slice(0, 6), [cfgTick])
  const ptsExamples = useMemo(() => {
    void cfgTick
    const pt = (x: number) => computeDonorPointsPreviewSync(x)
    const p10 = pt(10)
    const p25 = pt(25)
    const p50 = pt(50)
    return [
      {
        key: 'eenmalig10',
        title: 'EUR 10 eenmalig doneren',
        sub: 'Een donatie',
        pts: p10,
        badge: 'na 1 donatie',
        success: false,
        highlight: false,
      },
      {
        key: 'maand10x6',
        title: 'EUR 10/maand · 6 maanden',
        sub: '6 × hetzelfde bedrag (zelfde formule per donatie)',
        pts: 6 * p10,
        badge: 'totaal na 6 maanden',
        success: false,
        highlight: false,
      },
      {
        key: 'maand25x12',
        title: 'EUR 25/maand · 1 jaar',
        sub: '12 × hetzelfde bedrag (zelfde formule per donatie)',
        pts: 12 * p25,
        badge: 'totaal na 1 jaar',
        success: true,
        highlight: false,
      },
      {
        key: 'maand50sticker',
        title: 'EUR 50/maand · 1 jaar + sticker',
        sub: '12 maanden + eenmalige stickerbonus (zoals op stickerpagina)',
        pts: 12 * p50 + 50,
        badge: '💎 Kampioen',
        success: false,
        highlight: true,
      },
    ]
  }, [cfgTick])

  const eur = Math.max(0, Number(amount) || 0)
  const calcPts = useMemo(() => computeDonorPointsPreviewSync(eur), [eur, cfgTick])

  return (
    <main role="main" id="mainContent">
      <div id="page-puntensysteem" className="page active">
        <div
          className="pts-hero"
          style={{
            background: 'linear-gradient(135deg,var(--blue) 0%,#1a7fd4 100%)',
            color: '#fff',
            textAlign: 'center',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(ellipse 80% 60% at 50% 0%,rgba(255,255,255,.08) 0%,transparent 70%)',
            pointerEvents: 'none',
          }}
        />
        <div className="container" style={{ position: 'relative' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(255,255,255,.1)',
              border: '1px solid rgba(255,255,255,.2)',
              borderRadius: 50,
              padding: '6px 18px',
              fontSize: '0.8rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase' as const,
              marginBottom: 22,
              color: 'rgba(255,255,255,.85)',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            Puntensysteem
          </div>
          <h1
            style={{
              fontFamily: 'Fraunces,serif',
              fontSize: 'clamp(2.2rem, 5vw, 3.6rem)',
              fontWeight: 900,
              marginBottom: 16,
              lineHeight: 1.05,
              letterSpacing: '-0.02em',
            }}
          >
            Doneer goed.
            <br />
            Word beloond.
          </h1>
          <p style={{ fontSize: '1.08rem', color: 'rgba(255,255,255,.7)', maxWidth: 500, margin: '0 auto 36px', lineHeight: 1.65 }}>
            Elke euro die je doneert verdient jou punten. Spaar voor kortingsbonnen, weekendjes weg, leuke producten en meer.
          </p>
          <div className="pts-hero-rule">
            <div className="pts-hero-rule__cell pts-hero-rule__from">💶 €1 doneren</div>
            <div className="pts-hero-rule__cell pts-hero-rule__arrow" aria-hidden>
              →
            </div>
            <div className="pts-hero-rule__cell pts-hero-rule__to">
              {formatPtsPerOneEuro() === '—' ? '—' : `${formatPtsPerOneEuro()} pt`}
            </div>
          </div>
        </div>
        </div>

        <div className="section" style={{ background: '#fff', padding: '72px 0 56px' }}>
          <div className="container">
          <div style={{ textAlign: 'center', marginBottom: 44 }}>
            <h2 style={{ fontFamily: 'Fraunces,serif', fontSize: 'clamp(1.5rem, 2.5vw, 2.1rem)', fontWeight: 900, color: '#0f1c5e', marginBottom: 10 }}>
              Zo verdien je punten
            </h2>
            <p style={{ color: '#6b7280', fontSize: '0.96rem', maxWidth: 480, margin: '0 auto' }}>
              Elke actie telt — klein of groot, jij bouwt altijd aan je saldo.
            </p>
          </div>
          <div className="pts-earn-grid">
            {EARN_CARDS.map((c, idx) => (
              <div
                key={c.title}
                className="pts-earn-card"
                style={{
                  background: c.bg,
                  border: `1.5px solid ${c.border}`,
                  borderRadius: 18,
                  padding: '28px 24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    background: c.iconBg,
                    borderRadius: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 16,
                  }}
                >
                  {c.svg}
                </div>
                <div style={{ fontFamily: 'Fraunces,serif', fontSize: '1.1rem', fontWeight: 900, color: '#0f1c5e' }}>{c.title}</div>
                <div style={{ fontSize: '2rem', fontWeight: 900, color: c.color, letterSpacing: '-0.03em' }}>
                  {idx === 0 ? `+${formatPtsPerOneEuro()} pt` : c.val}
                </div>
                <p className="pts-earn-card__text">{c.text}</p>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 28 }}>
            <button
              type="button"
              className="pts-ask-donnie-btn"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent(DONNIE_OPEN_QUESTION_EVENT, {
                    detail: { question: 'Hoe werkt het puntensysteem precies?' },
                  }),
                )
              }}
              style={{
                alignItems: 'center',
                gap: 10,
                background: 'linear-gradient(135deg,#1a237e,#3a98f8)',
                color: '#fff',
                border: 'none',
                borderRadius: 14,
                padding: '12px 22px',
                fontWeight: 800,
                fontSize: '.92rem',
                cursor: 'pointer',
                boxShadow: '0 4px 18px rgba(26,35,126,.35)',
              }}
            >
              💬 Vraag het aan Donnie
            </button>
          </div>
          </div>
        </div>

        <div className="section-sm" style={{ background: '#f8fafc', padding: '72px 0' }}>
          <div className="container">
          <div style={{ textAlign: 'center', marginBottom: 44 }}>
            <h2 style={{ fontFamily: 'Fraunces,serif', fontSize: 'clamp(1.5rem, 2.5vw, 2.1rem)', fontWeight: 900, color: '#0f1c5e', marginBottom: 10 }}>
              Waarvoor kun je sparen?
            </h2>
            <p style={{ color: '#6b7280', fontSize: '0.96rem', maxWidth: 480, margin: '0 auto' }}>
              Wissel je punten in voor beloningen die jij het liefst wilt.
            </p>
          </div>

          <div className="pts-reward-grid">
            {REWARD_GROUPS.map((g) => (
              <div
                key={g.title}
                className="pts-reward-card"
                style={{
                  background: '#fff',
                  borderRadius: 22,
                  border: '1.5px solid #e8ecf8',
                  overflow: 'hidden',
                  boxShadow: '0 2px 20px rgba(15,28,94,.06)',
                }}
              >
                <div style={{ background: g.head, padding: '24px 24px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: '1.8rem' }}>{g.icon}</span>
                    <div>
                      <div style={{ fontFamily: 'Fraunces,serif', fontSize: '1.15rem', fontWeight: 900, color: '#fff' }}>{g.title}</div>
                      <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,.75)' }}>{g.sub}</div>
                    </div>
                  </div>
                </div>
                <div className="pts-reward-card__body">
                  {g.rows.map(([label, pts, bg, col]) => (
                    <div
                      key={String(label)}
                      className="pts-reward-row"
                      style={{
                        background: bg,
                      }}
                    >
                      <span className="pts-reward-row__label">{label}</span>
                      <span className="pts-reward-row__pts" style={{ color: col }}>
                        {pts}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          </div>
        </div>

        <div className="section" style={{ background: '#fff', padding: '72px 0' }}>
          <div className="container">
            <div style={{ textAlign: 'center', marginBottom: 44 }}>
              <h2 style={{ fontFamily: 'Fraunces,serif', fontSize: 'clamp(1.5rem, 2.5vw, 2.1rem)', fontWeight: 900, color: '#0f1c5e', marginBottom: 10 }}>
                Jouw level
              </h2>
              <p style={{ color: '#6b7280', fontSize: '0.96rem', maxWidth: 480, margin: '0 auto' }}>
                Hoe meer je doneert, hoe hoger je level - en hoe exclusiever de beloningen.
              </p>
            </div>
            <div className="pts-level-grid">
              {LEVEL_CARDS.map(([icon, title, range, perks, border, bg, titleCol, chipBg]) => (
                <div
                  key={title}
                  className="pts-level-card"
                  style={{ border: `2px solid ${border}`, background: bg }}
                >
                  <div className="pts-level-card__icon">{icon}</div>
                  <div className="pts-level-card__title" style={{ color: titleCol }}>
                    {title}
                  </div>
                  <div className="pts-level-card__range">{range}</div>
                  <div className="pts-level-card__perks" style={{ background: chipBg }}>
                    {perks}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="section-sm" style={{ background: '#f8fafc', padding: '72px 0' }}>
          <div className="container" style={{ maxWidth: 720 }}>
            <div style={{ textAlign: 'center', marginBottom: 44 }}>
              <h2 style={{ fontFamily: 'Fraunces,serif', fontSize: 'clamp(1.5rem, 2.5vw, 2.1rem)', fontWeight: 900, color: '#0f1c5e', marginBottom: 10 }}>
                Reken het zelf uit 🧮
              </h2>
              <p style={{ color: '#6b7280', fontSize: '0.96rem' }}>Zo snel kun je sparen voor een beloning.</p>
            </div>

            <div className="pts-examples-list">
              {ptsExamples.map((ex) => (
                <div
                  key={ex.key}
                  className={['pts-example-row', ex.success ? 'pts-example-row--success' : '', ex.highlight ? 'pts-example-row--highlight' : '']
                    .filter(Boolean)
                    .join(' ')}
                >
                  <div className="pts-example-row__main">
                    <div className="pts-example-row__title">{ex.title}</div>
                    <div className="pts-example-row__sub">{ex.sub}</div>
                  </div>
                  <div
                    className={[
                      'pts-example-row__points',
                      ex.success ? 'pts-example-row__points--green' : '',
                      ex.highlight ? 'pts-example-row__points--purple' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {ex.pts} pt
                  </div>
                  <div className="pts-example-row__badge">
                    {ex.success || ex.highlight ? (
                      <span
                        className={
                          ex.highlight
                            ? 'pts-example-row__badge-strong pts-example-row__badge-purple'
                            : 'pts-example-row__badge-strong pts-example-row__badge-green'
                        }
                      >
                        {ex.badge}
                      </span>
                    ) : (
                      <span>{ex.badge}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="pts-calc-panel">
              <div style={{ fontWeight: 800, color: '#1a237e', marginBottom: 10 }}>Live puntencalculator</div>
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {(amountBuckets.length ? amountBuckets : [10, 25, 50, 100]).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className="btn btn-sm btn-outline"
                      onClick={() => setAmount(String(preset))}
                      style={{ padding: '6px 10px', fontSize: '.74rem' }}
                    >
                      EUR {preset}
                    </button>
                  ))}
                </div>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Bedrag in euro"
                />
                <div style={{ fontSize: '.86rem', color: '#6b7280' }}>
                  Uitkomst: <strong style={{ color: '#1a237e' }}>{calcPts} punten</strong> voor EUR {eur.toFixed(2)} (zelfde formule als bij doneren en in het adminpaneel).
                </div>
                <p style={{ fontSize: '.78rem', color: '#9ca3af', margin: 0, lineHeight: 1.45 }}>
                  Alleen ter indicatie; definitieve punten volgen na verwerking van je donatie. Je kunt hier geen punten op je account zetten.
                </p>
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'center', marginTop: 32 }}>
            <Link to={shell ? '/account' : '/auth'} className="btn btn-dark btn-lg">
              {shell ? 'Ga naar je dashboard →' : 'Inloggen om punten te zien →'}
            </Link>
          </div>
          </div>
        </div>
    </main>
  )
}
