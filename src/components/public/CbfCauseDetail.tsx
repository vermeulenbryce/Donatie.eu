import { useMemo } from 'react'
import type { LegacyCbfCause } from '../../features/legacy/cbfCauses.generated'
import { buildCauseDescriptionSentences } from '../../features/legacy/causeNarrative'
import { CAT_LABEL } from '../../features/legacy/legacyCbfConstants'
import { sectorMeta } from '../../features/legacy/legacySectorMeta'
import { DonateTriggerButton } from './DonateModal'

type CbfCauseDetailProps = {
  c: LegacyCbfCause
  onBack: () => void
  onDonate: () => void
}

export function CbfCauseDetail({ c, onBack, onDonate }: CbfCauseDetailProps) {
  const meta = sectorMeta(c.sector || '')
  const niches = c.niches || []
  const erkendJaar = c.erkend_jaar || null
  const jarenErkend = erkendJaar ? new Date().getFullYear() - erkendJaar : null
  const paspoortUrl = c.paspoort || 'https://cbf.nl/register-erkende-goede-doelen'
  const website = c.website || null
  const isIntl = c.sector === 'INTERNATIONALE HULP EN MENSENRECHTEN'
  const isNatuur = c.sector === 'NATUUR EN MILIEU' || c.sector === 'MILIEU EN NATUUR'
  const activityScope = isIntl ? 'Internationaal actief' : isNatuur ? 'Nationaal & internationaal' : 'Nederland'
  const donateLabel = `Doneer nu aan ${c.naam}`
  const donateShort =
    c.naam.length > 22 ? `Doneer aan ${c.naam.substring(0, 22)}…` : `Doneer aan ${c.naam}`
  const firstWord = c.naam.split(' ')[0] || c.naam
  const descriptionSentences = useMemo(
    () => buildCauseDescriptionSentences(c, meta.label).sentences,
    [c, meta.label],
  )

  return (
    <div className="page" id="page-cause-detail">
      <div style={{ background: '#fff', borderBottom: '1px solid var(--border)', padding: '16px 0' }}>
        <div className="container">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
            ← Terug naar overzicht
          </button>
        </div>
      </div>
      <div className="container" id="causeDetailContent">
        <div
          style={{
            background: `linear-gradient(135deg,${meta.color},${meta.color2})`,
            borderRadius: 'var(--r)',
            margin: '24px 0',
            padding: '40px 36px',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              right: 32,
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: '6rem',
              opacity: 0.18,
              pointerEvents: 'none',
            }}
            aria-hidden
          >
            {meta.emoji}
          </div>
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, alignItems: 'center' }}>
              {erkendJaar ? (
                <span className="chip chip-green">CBF-erkend · {jarenErkend}+ jaar in register</span>
              ) : (
                <span className="chip chip-blue">CBF-erkend goed doel</span>
              )}
              {c.categorie ? (
                <span className="chip" style={{ background: 'rgba(255,255,255,.7)', color: 'var(--dark)' }}>
                  Cat. {c.categorie} — {CAT_LABEL[c.categorie] || ''}
                </span>
              ) : null}
            </div>
            <h1
              style={{
                fontFamily: 'Fraunces,serif',
                fontSize: 'clamp(1.8rem,4vw,2.8rem)',
                fontWeight: 900,
                color: 'var(--dark)',
                lineHeight: 1.1,
                marginBottom: 8,
              }}
            >
              {c.naam}
            </h1>
            {c.naam_statutair && c.naam_statutair !== c.naam ? (
              <div style={{ fontSize: '.88rem', color: 'var(--mid)', marginBottom: 6 }}>{c.naam_statutair}</div>
            ) : null}
            <div style={{ fontSize: '.85rem', color: 'var(--mid)' }}>
              📍 {c.plaats || 'Nederland'} &nbsp;·&nbsp; {meta.emoji} {meta.label} &nbsp;·&nbsp; 🌍 {activityScope}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 32 }}>
          <DonateTriggerButton label={donateLabel} onClick={onDonate} />
          <a href={paspoortUrl} target="_blank" rel="noreferrer" className="btn btn-outline">
            📋 CBF-paspoort
          </a>
          {website ? (
            <a href={website} target="_blank" rel="noreferrer" className="btn btn-outline">
              🌐 Website
            </a>
          ) : null}
        </div>

        <div className="detail-main-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, marginBottom: 64 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 12,
              }}
            >
              <div
                style={{
                  background: 'linear-gradient(135deg, #eff6ff 0%, #fff 100%)',
                  border: '1.5px solid #93c5fd',
                  borderRadius: 14,
                  padding: '16px 18px',
                  display: 'flex',
                  gap: 14,
                  alignItems: 'flex-start',
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.1rem',
                    fontWeight: 800,
                    flexShrink: 0,
                  }}
                  aria-hidden
                >
                  CBF
                </div>
                <div>
                  <div
                    style={{
                      fontSize: '.72rem',
                      fontWeight: 800,
                      letterSpacing: '.1em',
                      textTransform: 'uppercase',
                      color: '#1e40af',
                      marginBottom: 4,
                    }}
                  >
                    CBF-erkend
                  </div>
                  <p style={{ fontSize: '.85rem', color: '#1e3a5f', lineHeight: 1.5, margin: 0 }}>
                    Onafhankelijk getoetst door het Centraal Bureau Fondsenwerving. Inzage in besteding en
                    transparantie via het CBF-paspoort.
                  </p>
                </div>
              </div>
              <div
                style={{
                  background: 'linear-gradient(135deg, #f0fdf4 0%, #fff 100%)',
                  border: '1.5px solid #86efac',
                  borderRadius: 14,
                  padding: '16px 18px',
                  display: 'flex',
                  gap: 14,
                  alignItems: 'flex-start',
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: 'linear-gradient(135deg, #15803d, #22c55e)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '.75rem',
                    fontWeight: 800,
                    flexShrink: 0,
                    letterSpacing: '0.02em',
                  }}
                  aria-hidden
                >
                  ANBI
                </div>
                <div>
                  <div
                    style={{
                      fontSize: '.72rem',
                      fontWeight: 800,
                      letterSpacing: '.1em',
                      textTransform: 'uppercase',
                      color: '#166534',
                      marginBottom: 4,
                    }}
                  >
                    ANBI
                  </div>
                  <p style={{ fontSize: '.85rem', color: '#14532d', lineHeight: 1.5, margin: 0 }}>
                    Algemeen nut beogende instelling: giften kunnen onder voorwaarden fiscaal voordelig zijn (Belastingdienst
                    &mdash; controleer je eigen situatie).
                  </p>
                </div>
              </div>
            </div>

            {descriptionSentences.length ? (
              <div style={{ display: 'grid', gap: 16 }}>
                <div
                  style={{
                    background: '#fff',
                    borderRadius: 16,
                    border: '1.5px solid var(--border)',
                    padding: '28px 30px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        background: `linear-gradient(135deg,${meta.color},${meta.color2})`,
                        borderRadius: 10,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.1rem',
                        flexShrink: 0,
                      }}
                    >
                      {meta.emoji}
                    </div>
                    <h3
                      style={{
                        fontFamily: 'Fraunces,serif',
                        fontSize: '1.1rem',
                        fontWeight: 900,
                        color: 'var(--dark)',
                        margin: 0,
                      }}
                    >
                      Over {c.naam}
                    </h3>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 14,
                    }}
                  >
                    {descriptionSentences.map((line, i) => (
                      <p
                        key={i}
                        style={{
                          fontSize: '.95rem',
                          color: '#374151',
                          lineHeight: 1.85,
                          margin: 0,
                        }}
                      >
                        {line}
                      </p>
                    ))}
                  </div>
                </div>
                {c.missie ? (
                  <div
                    style={{
                      background: 'linear-gradient(135deg,var(--blue-light),#e0f2fe)',
                      border: '1.5px solid #bfdbfe',
                      borderRadius: 16,
                      padding: '24px 28px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <span style={{ fontSize: '1.3rem' }}>🎯</span>
                      <h3
                        style={{
                          fontFamily: 'Fraunces,serif',
                          fontSize: '1rem',
                          fontWeight: 900,
                          color: '#1a237e',
                          margin: 0,
                        }}
                      >
                        Missie in één zin
                      </h3>
                    </div>
                    <p
                      style={{
                        fontSize: '1rem',
                        fontStyle: 'italic',
                        fontWeight: 600,
                        color: '#1e40af',
                        lineHeight: 1.7,
                        margin: 0,
                      }}
                    >
                      &quot;{c.missie}&quot;
                    </p>
                  </div>
                ) : null}
                {niches.length ? (
                  <div
                    style={{
                      background: '#f8faff',
                      borderRadius: 14,
                      border: '1.5px solid #e5e7eb',
                      padding: '20px 24px',
                    }}
                  >
                    <h3
                      style={{
                        fontSize: '.82rem',
                        fontWeight: 800,
                        color: '#6b7280',
                        letterSpacing: '.08em',
                        textTransform: 'uppercase',
                        margin: '0 0 12px',
                      }}
                    >
                      Focusgebieden
                    </h3>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {niches.map((n) => (
                        <span
                          key={n}
                          style={{
                            background: '#eff6ff',
                            color: '#1d4ed8',
                            border: '1px solid #bfdbfe',
                            borderRadius: 20,
                            padding: '5px 13px',
                            fontSize: '.8rem',
                            fontWeight: 600,
                          }}
                        >
                          {n}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 12 }}>
                  {erkendJaar ? (
                    <div
                      style={{
                        background: '#f0fdf4',
                        border: '1px solid #86efac',
                        borderRadius: 12,
                        padding: '14px 16px',
                        textAlign: 'center',
                      }}
                    >
                      <div
                        style={{
                          fontFamily: 'Fraunces,serif',
                          fontSize: '1.3rem',
                          fontWeight: 900,
                          color: '#16a34a',
                        }}
                      >
                        {new Date().getFullYear() - erkendJaar}+
                      </div>
                      <div style={{ fontSize: '.74rem', color: '#15803d', fontWeight: 600, marginTop: 2 }}>
                        jaar CBF-erkend
                      </div>
                    </div>
                  ) : null}
                  {c.plaats ? (
                    <div
                      style={{
                        background: '#faf5ff',
                        border: '1px solid #ddd6fe',
                        borderRadius: 12,
                        padding: '14px 16px',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ fontSize: '1.1rem', marginBottom: 2 }}>📍</div>
                      <div style={{ fontSize: '.78rem', color: '#6d28d9', fontWeight: 600 }}>{c.plaats}</div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 0 }}>
              <div
                style={{
                  background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)',
                  border: '1.5px solid #86efac',
                  borderRadius: 14,
                  padding: 20,
                }}
              >
                <div style={{ fontSize: '1.3rem', marginBottom: 8 }}>💝</div>
                <div
                  style={{
                    fontFamily: 'Fraunces,serif',
                    fontSize: '.9rem',
                    fontWeight: 900,
                    color: '#15803d',
                    marginBottom: 6,
                  }}
                >
                  Doneer aan {firstWord}
                </div>
                <div style={{ fontSize: '.78rem', color: '#166534', lineHeight: 1.5 }}>
                  Elke bijdrage helpt direct. Jouw donatie is fiscaal aftrekbaar (ANBI) en wordt volledig ingezet voor de
                  missie.
                </div>
              </div>
              <div
                style={{
                  background: 'linear-gradient(135deg,#faf5ff,#f3e8ff)',
                  border: '1.5px solid #c4b5fd',
                  borderRadius: 14,
                  padding: 20,
                }}
              >
                <div style={{ fontSize: '1.3rem', marginBottom: 8 }}>⭐</div>
                <div
                  style={{
                    fontFamily: 'Fraunces,serif',
                    fontSize: '.9rem',
                    fontWeight: 900,
                    color: '#7c3aed',
                    marginBottom: 6,
                  }}
                >
                  Verdien punten
                </div>
                <div style={{ fontSize: '.78rem', color: '#6d28d9', lineHeight: 1.5 }}>
                  Doneer via Donatie.eu en verdien 10 punten per €1. Maandelijkse donaties geven dubbele punten!
                </div>
              </div>
            </div>

            <div style={{ background: '#fff', borderRadius: 'var(--r)', border: '1.5px solid var(--border)', padding: 28 }}>
              <h3 className="ff" style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: 16 }}>
                🔍 Focusgebieden
              </h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {niches.map((n) => (
                  <span key={n} className={`chip ${meta.chipClass}`} style={{ fontSize: '.82rem', padding: '5px 12px' }}>
                    {n}
                  </span>
                ))}
              </div>
              <div style={{ fontSize: '.85rem', color: 'var(--mid)' }}>
                Sector: <strong>{meta.label}</strong> &nbsp;·&nbsp; Werkgebied: <strong>{activityScope}</strong>
              </div>
            </div>

            <div style={{ background: '#fff', borderRadius: 'var(--r)', border: '1.5px solid var(--border)', padding: 28 }}>
              <h3 className="ff" style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: 16 }}>
                🏢 Organisatiegegevens
              </h3>
              <table style={{ width: '100%', fontSize: '.88rem', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 0', color: 'var(--mid)', width: '45%' }}>Naam</td>
                    <td style={{ padding: '10px 0', fontWeight: 600 }}>{c.naam}</td>
                  </tr>
                  {c.naam_statutair ? (
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 0', color: 'var(--mid)' }}>Statutaire naam</td>
                      <td style={{ padding: '10px 0' }}>{c.naam_statutair}</td>
                    </tr>
                  ) : null}
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 0', color: 'var(--mid)' }}>Vestigingsplaats</td>
                    <td style={{ padding: '10px 0' }}>{c.plaats || '—'}</td>
                  </tr>
                  {website ? (
                    <tr>
                      <td style={{ padding: '10px 0', color: 'var(--mid)' }}>Website</td>
                      <td style={{ padding: '10px 0' }}>
                        <a
                          href={website}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: 'var(--blue)', fontWeight: 600 }}
                        >
                          {website.replace(/^https?:\/\//, '').replace(/\/.*/, '')}
                        </a>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ background: 'var(--dark)', borderRadius: 'var(--r)', padding: 24, color: '#fff' }}>
              <div style={{ fontSize: '2rem', marginBottom: 12 }}>🏅</div>
              <div
                style={{
                  fontSize: '.72rem',
                  fontWeight: 700,
                  letterSpacing: '.1em',
                  textTransform: 'uppercase',
                  color: 'rgba(255,255,255,.4)',
                  marginBottom: 6,
                }}
              >
                CBF-ERKENNING
              </div>
              <div style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 4 }}>Erkend Goed Doel</div>
              {erkendJaar ? (
                <div style={{ fontSize: '.82rem', color: 'rgba(255,255,255,.55)', marginBottom: 16 }}>
                  Erkend sinds {erkendJaar} ({jarenErkend} jaar)
                </div>
              ) : null}
              {c.categorie ? (
                <div
                  style={{
                    background: 'rgba(255,255,255,.08)',
                    borderRadius: 'var(--r-sm)',
                    padding: '12px 14px',
                    marginBottom: 12,
                  }}
                >
                  <div style={{ fontSize: '.7rem', color: 'rgba(255,255,255,.4)', marginBottom: 4 }}>
                    ORGANISATIEGROOTTE
                  </div>
                  <div style={{ fontSize: '.88rem', fontWeight: 700 }}>Cat. {c.categorie}</div>
                  <div style={{ fontSize: '.75rem', color: 'rgba(255,255,255,.5)' }}>{CAT_LABEL[c.categorie] || ''}</div>
                </div>
              ) : null}
              <a
                href={paspoortUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  background: 'rgba(255,255,255,.12)',
                  color: '#fff',
                  borderRadius: 'var(--r-sm)',
                  padding: '12px 14px',
                  fontSize: '.83rem',
                  fontWeight: 700,
                  textDecoration: 'none',
                  border: '1px solid rgba(255,255,255,.15)',
                }}
              >
                <span>📋 Bekijk CBF-paspoort</span>
                <span style={{ opacity: 0.6, fontSize: '.75rem' }}>↗</span>
              </a>
            </div>

            <div
              style={{
                background: 'var(--green-light)',
                border: '1.5px solid rgba(93,232,176,.3)',
                borderRadius: 'var(--r)',
                padding: 24,
              }}
            >
              <div
                style={{
                  fontSize: '.72rem',
                  fontWeight: 700,
                  letterSpacing: '.1em',
                  textTransform: 'uppercase',
                  color: 'var(--green-dark)',
                  marginBottom: 8,
                }}
              >
                DONEER NU
              </div>
              <div style={{ fontFamily: 'Fraunces,serif', fontSize: '1.15rem', fontWeight: 900, color: 'var(--dark)', marginBottom: 8 }}>
                Elke euro telt
              </div>
              <div style={{ fontSize: '.83rem', color: 'var(--mid)', marginBottom: 16 }}>
                Je verdient punten bij elke donatie en klimt op de ranglijst.
              </div>
              <DonateTriggerButton label={donateShort} className="btn btn-green btn-full" onClick={onDonate} />
            </div>

            <div style={{ background: '#fff', borderRadius: 'var(--r)', border: '1.5px solid var(--border)', padding: 20 }}>
              <div
                style={{
                  fontSize: '.72rem',
                  fontWeight: 700,
                  letterSpacing: '.1em',
                  textTransform: 'uppercase',
                  color: 'var(--light)',
                  marginBottom: 14,
                }}
              >
                WAAROM VERTROUWD?
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: '.83rem' }}>
                  <span style={{ flexShrink: 0 }}>✅</span>
                  <span>
                    <strong>CBF-keurmerk</strong> — onafhankelijk getoetst op transparantie
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: '.83rem' }}>
                  <span style={{ flexShrink: 0 }}>📊</span>
                  <span>
                    <strong>Jaarverslagen</strong> openbaar via{' '}
                    <a href={paspoortUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--blue-dark)', textDecoration: 'underline' }}>
                      CBF-paspoort ↗
                    </a>
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: '.83rem' }}>
                  <span style={{ flexShrink: 0 }}>🇳🇱</span>
                  <span>
                    <strong>ANBI-status</strong> — donaties fiscaal aftrekbaar
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <style>{`
          @media(max-width:768px){
            .detail-main-grid{grid-template-columns:1fr!important;}
          }
        `}</style>
      </div>
    </div>
  )
}
