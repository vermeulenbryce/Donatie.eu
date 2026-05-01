import { Link } from 'react-router-dom'
import { FaqAccordion } from '../../components/public/FaqAccordion'
import { PublicPageHeader } from '../../components/public/PublicPageHeader'
import { useLiveFaqItems } from '../../features/public/faqLive'

const HIW_STEPS = [
  { n: '01', icon: '🎯', title: 'Kies je doel', text: 'Doe de snelle quiz (30 sec) en ontdek goede doelen die bij jouw interesses passen. Of blader zelf door de uitgebreide lijst met filters.' },
  { n: '02', icon: '💳', title: 'Doneer eenvoudig', text: 'Betaal via iDEAL, creditcard of PayPal. In 2–3 stappen geregeld. 80% van jouw donatie gaat direct naar het goede doel.' },
  { n: '03', icon: '⭐', title: 'Verdien punten', text: 'Elke donatie levert punten op. Per €1 ontvang je 0,5 punt. Spaar voor kortingsbonnen, weekendjes weg, producten en loterijen. Terugkerende donaties ×1.2 multiplier.' },
  { n: '04', icon: '🏆', title: 'Klim op de ranglijst', text: 'Compete met andere donateurs en bedrijven. Win badges, bereik nieuwe levels en word "Top Donateur van de Maand".' },
]

export function FaqPage() {
  const faqItems = useLiveFaqItems()
  return (
    <main role="main" id="mainContent" className="page-faq">
      <PublicPageHeader
        eyebrow="Transparantie & vertrouwen"
        title="Hoe werkt Donatie.eu?"
        subtitle="Alles wat je moet weten over doneren, punten verdienen en veiligheid."
      />

      <div className="container section">
        <div className="hiw-grid">
          {HIW_STEPS.map((s) => (
            <div key={s.n} className="hiw-card">
              <div className="hiw-num">{s.n}</div>
              <div className="hiw-icon">{s.icon}</div>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
              {s.n === '01' ? (
                <p style={{ marginTop: 12, marginBottom: 0 }}>
                  <Link to="/goede-doelen?quiz=1" className="btn btn-sm" style={{ fontWeight: 800 }}>
                    Start de quiz
                  </Link>
                </p>
              ) : null}
            </div>
          ))}
        </div>

        <div className="divider" style={{ margin: '64px 0' }} />

        <div className="grid2 faq-compliance-grid" style={{ gap: 32, alignItems: 'center' }}>
          <div>
            <div className="eyebrow">Veiligheid & compliance</div>
            <h2 className="section-title">
              Jouw geld is
              <br />
              100% veilig
            </h2>
            <p className="section-sub">
              Alle fondsen worden verwerkt via een onafhankelijke Stichting Derdengelden. Operationele activiteiten en financiële
              stromen zijn strikt gescheiden.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 28 }}>
              <div className="feat-item">
                <div className="feat-icon g">🏛️</div>
                <div>
                  <h4>Stichting Derdengelden</h4>
                  <p style={{ fontSize: '0.85rem', color: 'var(--mid)', lineHeight: 1.6 }}>
                    Alle geldstromen verlopen via een onafhankelijke stichting. Volledig gescheiden van platformactiviteiten.
                  </p>
                  <Link to="/juridisch/transparantie" className="btn btn-sm btn-outline" style={{ marginTop: 8 }}>
                    Meer over transparantie
                  </Link>
                </div>
              </div>
              <div className="feat-item">
                <div className="feat-icon b">✅</div>
                <div>
                  <h4>Alleen ANBI-doelen</h4>
                  <p style={{ fontSize: '0.85rem', color: 'var(--mid)', lineHeight: 1.6 }}>
                    Wij accepteren uitsluitend ANBI-gecertificeerde goede doelen. Geen risico op frauduleuze campagnes.
                  </p>
                  <Link to="/juridisch/anbi-info" className="btn btn-sm btn-outline" style={{ marginTop: 8 }}>
                    Bekijk ANBI-info
                  </Link>
                </div>
              </div>
              <div className="feat-item">
                <div className="feat-icon p">🔒</div>
                <div>
                  <h4>AVG & privacybescherming</h4>
                  <p style={{ fontSize: '0.85rem', color: 'var(--mid)', lineHeight: 1.6 }}>
                    Jouw gegevens zijn veilig. Je kunt altijd anoniem doneren — punten tellen mee, naam blijft verborgen.
                  </p>
                  <Link to="/juridisch/privacybeleid" className="btn btn-sm btn-outline" style={{ marginTop: 8 }}>
                    Lees privacybeleid
                  </Link>
                </div>
              </div>
            </div>
          </div>
          <div className="faq-pts-example" style={{ background: 'var(--off)', borderRadius: 20, padding: 32 }}>
            <h3 className="ff" style={{ fontFamily: 'Fraunces,serif', fontSize: '1.2rem', fontWeight: 800, marginBottom: 20 }}>
              Puntensysteem — voorbeeld
            </h3>
            <div className="faq-pts-example__list">
              {[
                ['Eenmalige donatie (€10)', 'chip-green', '+5 pts'],
                ['Terugkerende donatie (×1.2)', 'chip-blue', '+6 pts'],
                ['Campagnebonus (×1.5)', 'chip-yellow', '+8 pts'],
                ['Persoonlijke sticker', 'chip-pink', '+50 pts'],
                ['Zakelijke sticker', 'chip-pink', '+100 pts'],
                ['Streakbonus (3 mnd)', 'chip-green', '+5 pts'],
              ].map(([label, chip, pts]) => (
                <div key={String(label)} className="faq-pts-row">
                  <span className="faq-pts-row__label">{label}</span>
                  <span className={`chip ${chip}`}>{pts}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="divider" style={{ margin: '64px 0' }} />

        <div style={{ marginBottom: 'clamp(48px, 8vw, 88px)' }}>
          <div className="text-center mb32">
            <div className="eyebrow">Veelgestelde vragen</div>
            <h2 className="section-title">Meest gestelde vragen</h2>
            <p className="section-sub" style={{ margin: '12px auto' }}>
              Alles over geldverdeling, veiligheid en het puntensysteem.
            </p>
          </div>
          <FaqAccordion items={faqItems} />
        </div>
      </div>

      <div style={{ background: 'linear-gradient(135deg,#0f1c5e,#1a237e)', padding: '60px 0 48px' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: 'rgba(255,255,255,.1)',
                border: '1px solid rgba(255,255,255,.2)',
                borderRadius: 50,
                padding: '6px 16px',
                fontSize: '0.75rem',
                fontWeight: 700,
                textTransform: 'uppercase' as const,
                color: 'rgba(255,255,255,.85)',
                marginBottom: 16,
              }}
            >
              ⭐ Puntensysteem
            </div>
            <h2
              style={{
                fontFamily: 'Fraunces,serif',
                fontSize: 'clamp(1.6rem, 3vw, 2.2rem)',
                fontWeight: 900,
                color: '#fff',
                marginBottom: 10,
              }}
            >
              Doneer goed. Word beloond.
            </h2>
            <p style={{ color: 'rgba(255,255,255,.7)', fontSize: '0.93rem', maxWidth: 480, margin: '0 auto' }}>
              Elke euro die je doneert levert punten op. Spaar voor kortingsbonnen, weekendjes weg en meer.
            </p>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
            <div
              style={{
                display: 'inline-grid',
                gridTemplateColumns: 'auto auto auto',
                alignItems: 'center',
                background: 'rgba(255,255,255,.07)',
                border: '1.5px solid rgba(255,255,255,.15)',
                borderRadius: 16,
                overflow: 'hidden',
                fontWeight: 800,
              }}
            >
              <div style={{ padding: '12px 20px', borderRight: '1px solid rgba(255,255,255,.12)', color: '#fff' }}>
                💶 €1 doneren
              </div>
              <div style={{ padding: '12px 12px', color: 'rgba(255,255,255,.4)', fontSize: '1.1rem' }}>→</div>
              <div style={{ padding: '12px 20px', color: '#FFD700', fontFamily: 'Fraunces,serif', fontSize: '1.05rem' }}>
                +0,5 punt
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12, marginBottom: 32 }}>
            <div style={{ background: 'rgba(255,255,255,.07)', border: '1.5px solid rgba(255,255,255,.1)', borderRadius: 14, padding: '20px 16px' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>💶</div>
              <div style={{ fontFamily: 'Fraunces,serif', fontSize: '.9rem', fontWeight: 900, color: '#fff', marginBottom: 4 }}>Per €1 donatie</div>
              <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#FFD700' }}>+0,5 pt</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,.07)', border: '1.5px solid rgba(255,255,255,.1)', borderRadius: 14, padding: '20px 16px' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>🔄</div>
              <div style={{ fontFamily: 'Fraunces,serif', fontSize: '.9rem', fontWeight: 900, color: '#fff', marginBottom: 4 }}>Terugkerende donatie</div>
              <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#FFD700' }}>×1,2</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,.07)', border: '1.5px solid rgba(255,255,255,.1)', borderRadius: 14, padding: '20px 16px' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>🏷️</div>
              <div style={{ fontFamily: 'Fraunces,serif', fontSize: '.9rem', fontWeight: 900, color: '#fff', marginBottom: 4 }}>Sticker kopen</div>
              <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#FFD700' }}>+50-50 pt</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,.07)', border: '1.5px solid rgba(255,255,255,.1)', borderRadius: 14, padding: '20px 16px' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>🔥</div>
              <div style={{ fontFamily: 'Fraunces,serif', fontSize: '.9rem', fontWeight: 900, color: '#fff', marginBottom: 4 }}>3 maanden streak</div>
              <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#FFD700' }}>+5 pt bonus</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,.07)', border: '1.5px solid rgba(255,255,255,.1)', borderRadius: 14, padding: '20px 16px' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>🎯</div>
              <div style={{ fontFamily: 'Fraunces,serif', fontSize: '.9rem', fontWeight: 900, color: '#fff', marginBottom: 4 }}>Campagnebonus</div>
              <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#FFD700' }}>×1,5</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,.07)', border: '1.5px solid rgba(255,255,255,.1)', borderRadius: 14, padding: '20px 16px' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>👥</div>
              <div style={{ fontFamily: 'Fraunces,serif', fontSize: '.9rem', fontWeight: 900, color: '#fff', marginBottom: 4 }}>Vriend uitnodigen</div>
              <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#FFD700' }}>+25 pt</div>
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,.06)', border: '1.5px solid rgba(255,255,255,.08)', borderRadius: 16, padding: 22, marginBottom: 26 }}>
            <h3 style={{ fontFamily: 'Fraunces,serif', fontSize: '1rem', fontWeight: 900, color: '#fff', marginBottom: 14, textAlign: 'center' }}>🏅 Niveaus</h3>
            <div className="faq-niveaus-grid">
              <div style={{ textAlign: 'center', padding: '10px 6px', background: 'rgba(255,255,255,.05)', borderRadius: 9 }}><div style={{ fontSize: '1.2rem' }}>🌱</div><div style={{ fontWeight: 800, color: '#fff', fontSize: '.8rem', margin: '4px 0 2px' }}>Starter</div><div style={{ fontSize: '.68rem', color: 'rgba(255,255,255,.4)' }}>0-99 pt</div></div>
              <div style={{ textAlign: 'center', padding: '10px 6px', background: 'rgba(255,255,255,.05)', borderRadius: 9 }}><div style={{ fontSize: '1.2rem' }}>💚</div><div style={{ fontWeight: 800, color: '#fff', fontSize: '.8rem', margin: '4px 0 2px' }}>Gever</div><div style={{ fontSize: '.68rem', color: 'rgba(255,255,255,.4)' }}>100-299 pt</div></div>
              <div style={{ textAlign: 'center', padding: '10px 6px', background: 'rgba(255,255,255,.05)', borderRadius: 9 }}><div style={{ fontSize: '1.2rem' }}>⭐</div><div style={{ fontWeight: 800, color: '#fff', fontSize: '.8rem', margin: '4px 0 2px' }}>Held</div><div style={{ fontSize: '.68rem', color: 'rgba(255,255,255,.4)' }}>300-699 pt</div></div>
              <div style={{ textAlign: 'center', padding: '10px 6px', background: 'rgba(255,255,255,.05)', borderRadius: 9 }}><div style={{ fontSize: '1.2rem' }}>🏆</div><div style={{ fontWeight: 800, color: '#fff', fontSize: '.8rem', margin: '4px 0 2px' }}>Champion</div><div style={{ fontSize: '.68rem', color: 'rgba(255,255,255,.4)' }}>700-1499 pt</div></div>
              <div style={{ textAlign: 'center', padding: '10px 6px', background: 'rgba(255,255,255,.05)', borderRadius: 9 }}><div style={{ fontSize: '1.2rem' }}>👑</div><div style={{ fontWeight: 800, color: '#fff', fontSize: '.8rem', margin: '4px 0 2px' }}>Elite</div><div style={{ fontSize: '.68rem', color: 'rgba(255,255,255,.4)' }}>1500-2999 pt</div></div>
              <div style={{ textAlign: 'center', padding: '10px 6px', background: 'linear-gradient(135deg,rgba(255,215,0,.15),rgba(255,165,0,.1))', borderRadius: 9, border: '1px solid rgba(255,215,0,.2)' }}><div style={{ fontSize: '1.2rem' }}>🌟</div><div style={{ fontWeight: 800, color: '#FFD700', fontSize: '.8rem', margin: '4px 0 2px' }}>Legende</div><div style={{ fontSize: '.68rem', color: 'rgba(255,215,0,.6)' }}>3000+ pt</div></div>
            </div>
          </div>

          <div style={{ textAlign: 'center' }}>
            <Link
              to="/puntensysteem"
              className="btn btn-lg"
              style={{
                background: 'linear-gradient(135deg,#FFD700,#FFA500)',
                color: '#1a1a1a',
                border: 'none',
                fontWeight: 800,
                boxShadow: '0 4px 14px rgba(255,165,0,.3)',
              }}
            >
              ⭐ Bekijk volledige puntenshop →
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}
