import { useEffect, useState } from 'react'
import { useLegacyUiSession } from '../../context/LegacyUiSessionContext'
import { readDnlAccounts, upsertDnlAccountProfile } from '../../features/account/legacyDashboardModel'

type StickerPack = 'persoonlijk' | 'zakelijk' | 'bundel'
type StickerOrder = {
  id: string
  pack: StickerPack
  price: number
  points: number
  ownerEmail?: string
  createdAt: string
}
const STICKER_ORDERS_KEY = 'dnl_sticker_orders'
export const dnlStickerOrdersUpdatedEvent = 'dnl:sticker-orders-updated'

function readStickerOrders(): StickerOrder[] {
  try {
    const raw = localStorage.getItem(STICKER_ORDERS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as StickerOrder[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeStickerOrders(rows: StickerOrder[]) {
  localStorage.setItem(STICKER_ORDERS_KEY, JSON.stringify(rows))
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(dnlStickerOrdersUpdatedEvent))
  }
}

function StickerHeartMock() {
  return (
    <div style={{ flexShrink: 0, textAlign: 'center' as const }}>
      <div style={{ display: 'inline-block', width: 200, height: 200, filter: 'drop-shadow(0 10px 30px rgba(0,0,0,.32))' }}>
        <div
          style={{
            clipPath:
              "path('M100,35 C100,17 72,0 45,0 C13,0 0,27 0,52 C0,78 15,97 35,115 L100,188 L165,115 C185,97 200,78 200,52 C200,27 187,0 155,0 C128,0 100,17 100,35 Z')",
            width: 200,
            height: 200,
            background: '#3a98f8',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-start',
            paddingTop: 44,
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              fontFamily: 'Fraunces,serif',
              fontSize: '1.75rem',
              fontWeight: 900,
              color: '#e81c1c',
              lineHeight: 1,
              letterSpacing: '0.02em',
              position: 'relative',
              zIndex: 3,
              textShadow: '0 1px 4px rgba(0,0,0,.18)',
            }}
          >
            NEE
          </div>
          <div
            style={{
              position: 'relative',
              marginTop: 8,
              zIndex: 1,
            }}
          >
            <img
              src="/donatie-logo.svg"
              alt="Online doneren via Donatie.eu - donatie platform"
              style={{
                width: 80,
                height: 80,
                objectFit: 'cover',
                borderRadius: '50%',
                display: 'block',
              }}
            />
          </div>
          <div
            style={{
              fontFamily: 'Fraunces,serif',
              fontSize: '0.8rem',
              fontWeight: 900,
              color: '#fff',
              textAlign: 'center' as const,
              letterSpacing: '0.04em',
              textTransform: 'uppercase' as const,
              position: 'absolute',
              top: 12,
              left: '50%',
              transform: 'translateX(-50%)',
              whiteSpace: 'nowrap' as const,
              zIndex: 2,
              textShadow: '0 1px 4px rgba(0,0,0,.5)',
            }}
          >
            ik doneer via:
          </div>
        </div>
      </div>
      <div style={{ marginTop: 12, fontSize: '0.78rem', color: 'rgba(255,255,255,.65)' }}>Officieel Donatie.eu ontwerp</div>
    </div>
  )
}

export function StickerPage() {
  const { shell } = useLegacyUiSession()
  const [msg, setMsg] = useState<string | null>(null)
  const [ordersCount, setOrdersCount] = useState(0)

  useEffect(() => {
    const refresh = () => {
      const rows = readStickerOrders()
      if (!shell?.email) {
        setOrdersCount(rows.length)
        return
      }
      const mine = rows.filter((r) => (r.ownerEmail || '').toLowerCase() === shell.email.toLowerCase())
      setOrdersCount(mine.length)
    }
    refresh()
    window.addEventListener(dnlStickerOrdersUpdatedEvent, refresh)
    const onStorage = (e: StorageEvent) => {
      if (e.key === STICKER_ORDERS_KEY) refresh()
    }
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(dnlStickerOrdersUpdatedEvent, refresh)
      window.removeEventListener('storage', onStorage)
    }
  }, [shell?.email])

  function bestel(pack: StickerPack, price: number, points: number) {
    const rows = readStickerOrders()
    const next: StickerOrder = {
      id: `so-${Date.now()}`,
      pack,
      price,
      points,
      ownerEmail: shell?.email || undefined,
      createdAt: new Date().toISOString(),
    }
    writeStickerOrders([next, ...rows])
    if (shell?.email) {
      const stored = readDnlAccounts()[shell.email] || {}
      const currentPoints = Number(stored.points ?? shell.points ?? 0)
      upsertDnlAccountProfile(shell.email, {
        points: currentPoints + points,
        sticker: true,
      })
    }
    setMsg(`Bestelling opgeslagen (${pack}) voor EUR ${price.toFixed(2)}. Puntenbonus: +${points}.`)
  }

  return (
    <main role="main" id="mainContent" className="sticker-page-routes">
      <div className="sticker-hero">
        <div className="container sticker-hero-inner">
          <div>
            <div className="eyebrow" style={{ color: 'rgba(255,255,255,.7)' }}>
              Sticker programma
            </div>
            <h1>Toon dat jij geeft</h1>
            <p style={{ fontSize: '1.05rem', color: 'rgba(255,255,255,.75)', maxWidth: 480 }}>
              Bestel een officiële Donatie.eu sticker voor je deur of brievenbus. Verdien punten en sta op de ranglijst als
              donateur.
            </p>
          </div>
          <StickerHeartMock />
        </div>
      </div>

      <div className="container">
        {msg ? (
          <div style={{ margin: '18px 0 8px', fontSize: '.85rem', color: '#166534', fontWeight: 600 }}>{msg}</div>
        ) : null}
        {ordersCount > 0 ? (
          <div style={{ marginBottom: 10, fontSize: '.8rem', color: '#6b7280' }}>
            {shell?.email ? 'Jouw bestellingen' : 'Lokale bestellingen'}: <strong>{ordersCount}</strong>
          </div>
        ) : null}
        <div className="sticker-wrapper">
          <div className="sticker-track">
            <div className="sticker-card">
              <div className="sticker-pkg">
                <span className="sticker-pkg-icon">🏷️</span>
                <h3>Persoonlijk</h3>
                <div className="sticker-pkg-price">
                  €4<span>,95</span>
                </div>
                <div className="sticker-pkg-pts">⭐ +50 punten</div>
                <p>Voor particulieren die willen laten zien dat ze al doneren via Donatie.eu.</p>
                <ul>
                  <li>1 vinyl sticker (10×10 cm)</li>
                  <li>Waterdicht en UV-bestendig</li>
                  <li>+50 punten op jouw account</li>
                  <li>Vermeld op de ranglijst als sticker-drager</li>
                  <li>Gratis verzending</li>
                </ul>
                <button type="button" className="btn btn-dark btn-full" onClick={() => bestel('persoonlijk', 4.95, 50)}>
                  Bestel nu
                </button>
              </div>
            </div>

            <div className="sticker-card">
              <div className="sticker-pkg featured">
                <div className="sticker-featured-badge">🔥 Meest gekozen</div>
                <span className="sticker-pkg-icon">🏢</span>
                <h3>Zakelijk</h3>
                <div className="sticker-pkg-price">
                  €9<span>,95</span>
                </div>
                <div className="sticker-pkg-pts">⭐ +100 punten</div>
                <p>Voor bedrijven die hun maatschappelijke betrokkenheid zichtbaar willen maken.</p>
                <ul>
                  <li>2 vinyl stickers (15×15 cm)</li>
                  <li>Bedrijfsnaam op de ranglijst</li>
                  <li>+100 punten voor bedrijfsranglijst</li>
                  <li>Badge &quot;Sticker Ambassadeur&quot;</li>
                  <li>Gratis verzending</li>
                </ul>
                <button type="button" className="btn btn-blue btn-full" onClick={() => bestel('zakelijk', 9.95, 100)}>
                  Bestel nu
                </button>
              </div>
            </div>

            <div className="sticker-card">
              <div className="sticker-pkg">
                <span className="sticker-pkg-icon">📦</span>
                <h3>Bundel (10×)</h3>
                <div className="sticker-pkg-price">
                  €29<span>,95</span>
                </div>
                <div className="sticker-pkg-pts">⭐ +500 punten</div>
                <p>Perfect voor verenigingen, kerken, sportclubs of kleine ondernemers.</p>
                <ul>
                  <li>10 vinyl stickers (10×10 cm)</li>
                  <li>+500 punten in één keer</li>
                  <li>Ideaal voor distributie</li>
                  <li>Badge &quot;Community Champion&quot;</li>
                  <li>Gratis verzending</li>
                </ul>
                <button type="button" className="btn btn-dark btn-full" onClick={() => bestel('bundel', 29.95, 500)}>
                  Bestel nu
                </button>
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 64 }}>
          <div className="eyebrow text-center">Waarom een sticker?</div>
          <h2 className="section-title text-center mt8">
            De sticker doet meer
            <br />
            dan je denkt
          </h2>
          <div className="grid2" style={{ marginTop: 40, gap: 24 }}>
            <div className="card-flat" style={{ padding: 28 }}>
              <div style={{ fontSize: '2rem', marginBottom: 14 }}>🚪</div>
              <h3 className="ff" style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: 8 }}>
                Geen ongewenste collectantes
              </h3>
              <p style={{ fontSize: '.87rem', color: 'var(--mid)', lineHeight: 1.65 }}>
                Collectantes aan de deur zien meteen dat jij al bijdraagt via Donatie.eu. Geen ongemakkelijke gesprekken meer op de
                drempel.
              </p>
            </div>
            <div className="card-flat" style={{ padding: 28 }}>
              <div style={{ fontSize: '2rem', marginBottom: 14 }}>👀</div>
              <h3 className="ff" style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: 8 }}>
                Offline merkzichtbaarheid
              </h3>
              <p style={{ fontSize: '.87rem', color: 'var(--mid)', lineHeight: 1.65 }}>
                Elke sticker in de buurt wekt nieuwsgierigheid: &quot;Wat is Donatie.eu?&quot; - organische mond-tot-mondreclame zonder
                advertentiekosten.
              </p>
            </div>
            <div className="card-flat" style={{ padding: 28 }}>
              <div style={{ fontSize: '2rem', marginBottom: 14 }}>🏆</div>
              <h3 className="ff" style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: 8 }}>
                Punten & ranglijst
              </h3>
              <p style={{ fontSize: '.87rem', color: 'var(--mid)', lineHeight: 1.65 }}>
                Elke sticker levert punten op die meetellen in jouw ranglijstpositie. Bedrijven met een sticker krijgen een speciaal
                sticker-icoon.
              </p>
            </div>
            <div className="card-flat" style={{ padding: 28 }}>
              <div style={{ fontSize: '2rem', marginBottom: 14 }}>📣</div>
              <h3 className="ff" style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: 8 }}>
                Sociaal bewijs
              </h3>
              <p style={{ fontSize: '.87rem', color: 'var(--mid)', lineHeight: 1.65 }}>
                Deel een foto van je sticker op sociale media. Nodig vrienden en collega&apos;s uit om ook mee te doen. Virale groei
                voor het goede doel.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
