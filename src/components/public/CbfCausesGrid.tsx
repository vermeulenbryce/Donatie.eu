import { useMemo, type CSSProperties } from 'react'
import type { LegacyCbfCause } from '../../features/legacy/cbfCauses.generated'
import { isNLFocused } from '../../features/legacy/legacyCbfConstants'
import { CauseBrandLogo } from './CauseBrandLogo'
import { sectorMeta } from '../../features/legacy/legacySectorMeta'

const DONATE_ICON_SRC = '/legacy-cause-donate-icon.jpg'

type CbfCausesGridProps = {
  causes: LegacyCbfCause[]
  compact: boolean
  onOpenDetail: (id: number) => void
  onDonate: (c: LegacyCbfCause) => void
  /** Quiz-match: omlijning op deze doelen-id’s */
  highlightIds?: number[]
}

export function CbfCausesGrid({ causes, compact, onOpenDetail, onDonate, highlightIds }: CbfCausesGridProps) {
  const high = highlightIds && highlightIds.length ? new Set(highlightIds) : null
  const { intlList, nlList } = useMemo(() => {
    const nlList = causes.filter((c) => isNLFocused(c))
    const intlList = causes.filter((c) => !isNLFocused(c))
    return { intlList, nlList }
  }, [causes])

  if (!causes.length) {
    return (
      <div className="causes-main-grid" id="causesGrid" style={{ gridColumn: '1 / -1' }}>
        <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '60px 20px', color: '#9ca3af' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🔍</div>
          <div style={{ fontSize: '1rem', fontWeight: 600 }}>Geen resultaten gevonden</div>
          <div style={{ fontSize: '.85rem', marginTop: 4 }}>Probeer een andere zoekterm of filter</div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`causes-main-grid${compact ? ' cause-grid-compact' : ''}`}
      id="causesGrid"
      style={
        compact
          ? { gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', gap: 10 }
          : undefined
      }
    >
      {intlList.length ? (
        <>
          <div
            style={{
              gridColumn: '1 / -1',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              marginBottom: 8,
              marginTop: 4,
              padding: '14px 18px',
              background: 'linear-gradient(135deg,#eff6ff,#dbeafe)',
              borderRadius: 14,
              border: '1.5px solid #bfdbfe',
            }}
          >
            <div
              style={{
                width: 42,
                height: 42,
                background: 'linear-gradient(135deg,#1a237e,#3a98f8)',
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.4rem',
                flexShrink: 0,
              }}
            >
              🌍
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'Fraunces,serif', fontSize: '1rem', fontWeight: 900, color: '#1a237e' }}>
                Internationaal
              </div>
              <div style={{ fontSize: '.78rem', color: '#3b82f6' }}>
                {intlList.length} internationale organisaties · CBF-erkend · ANBI-status
              </div>
            </div>
            <span style={{ background: '#d1fae5', color: '#065f46', borderRadius: 20, padding: '3px 10px', fontSize: '.72rem', fontWeight: 700 }}>
              ✅ CBF
            </span>
          </div>
          {intlList.map((c) => (
            <CauseCard
              key={c.id}
              c={c}
              compact={compact}
              highlight={high?.has(c.id) ?? false}
              onOpenDetail={onOpenDetail}
              onDonate={onDonate}
            />
          ))}
        </>
      ) : null}

      {nlList.length ? (
        <>
          <div
            style={{
              gridColumn: '1 / -1',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              marginBottom: 8,
              marginTop: intlList.length ? 24 : 4,
              padding: '14px 18px',
              background: 'linear-gradient(135deg,#fff7ed,#fed7aa)',
              borderRadius: 14,
              border: '1.5px solid #fdba74',
            }}
          >
            <div
              style={{
                width: 42,
                height: 42,
                background: 'linear-gradient(135deg,#e65100,#f97316)',
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.2rem',
                flexShrink: 0,
                color: '#fff',
                fontWeight: 900,
                fontFamily: 'Fraunces,serif',
              }}
            >
              NL
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'Fraunces,serif', fontSize: '1rem', fontWeight: 900, color: '#92400e' }}>
                Nederland
              </div>
              <div style={{ fontSize: '.78rem', color: '#b45309' }}>
                {nlList.length} organisaties primair actief in Nederland · CBF · ANBI
              </div>
            </div>
            <span style={{ background: '#d1fae5', color: '#065f46', borderRadius: 20, padding: '3px 10px', fontSize: '.72rem', fontWeight: 700 }}>
              ✅ CBF
            </span>
          </div>
          {nlList.map((c) => (
            <CauseCard
              key={c.id}
              c={c}
              compact={compact}
              highlight={high?.has(c.id) ?? false}
              onOpenDetail={onOpenDetail}
              onDonate={onDonate}
            />
          ))}
        </>
      ) : null}
    </div>
  )
}

function CauseCard({
  c,
  compact,
  highlight,
  onOpenDetail,
  onDonate,
}: {
  c: LegacyCbfCause
  compact: boolean
  highlight: boolean
  onOpenDetail: (id: number) => void
  onDonate: (c: LegacyCbfCause) => void
}) {
  const meta = sectorMeta(c.sector)

  if (compact) {
    return (
      <div
        className="cause-card-slim"
        role="link"
        tabIndex={0}
        title={c.naam}
        style={
          highlight
            ? { boxShadow: '0 0 0 2px #22c55e', borderRadius: 12, outline: '2px solid rgba(34,197,94,.4)' }
            : undefined
        }
        onClick={() => onOpenDetail(c.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onOpenDetail(c.id)
          }
        }}
      >
        <SlimLogo c={c} meta={meta} />
        <div className="cause-card-slim-name">{c.naam}</div>
      </div>
    )
  }

  return (
    <div
      className="cause-card"
      role="link"
      tabIndex={0}
      style={highlight ? { boxShadow: '0 0 0 2px #22c55e, 0 8px 24px rgba(34,197,94,.12)' } : undefined}
      onClick={() => onOpenDetail(c.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpenDetail(c.id)
        }
      }}
    >
      <div
        className="cause-thumb"
        style={{ background: `linear-gradient(135deg,${meta.color},${meta.color2})` } as CSSProperties}
        data-website={c.website || ''}
      >
        <LargeLogo c={c} meta={meta} />
        <div className="cause-cat-badge">
          <span className={`chip ${meta.chipClass}`}>{meta.label}</span>
        </div>
      </div>
      <div className="cause-body">
        <div className="cause-org">
          {c.naam_statutair || c.naam}{' '}
          <span className="chip chip-blue" style={{ marginLeft: 4, fontSize: '.65rem' }}>
            CBF
          </span>
          <span className="chip" style={{ marginLeft: 4, fontSize: '.65rem', background: '#dcfce7', color: '#166534' }}>
            ANBI
          </span>
        </div>
        <h3>{c.naam}</h3>
        <p
          style={{
            fontSize: '.83rem',
            color: 'var(--mid)',
            marginBottom: 10,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {c.missie || ''}
        </p>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${50 + c.id}%` }} />
        </div>
        <div className="progress-meta">
          <span>
            <strong>Doneer nu</strong>
          </span>
          <span>CBF · ANBI</span>
        </div>
        <button
          type="button"
          className="cause-donate-btn mt16"
          onClick={(e) => {
            e.stopPropagation()
            onDonate(c)
          }}
        >
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
          Doneer nu
        </button>
      </div>
    </div>
  )
}

function LargeLogo({ c, meta }: { c: LegacyCbfCause; meta: ReturnType<typeof sectorMeta> }) {
  return (
    <div className="logo-wrap">
      <CauseBrandLogo
        website={c.website}
        alt={`${c.naam} logo`}
        width={80}
        height={80}
        style={{ width: 80, height: 80, objectFit: 'contain' }}
        fallback={<span style={{ fontSize: '2.2rem' }}>{meta.emoji}</span>}
      />
    </div>
  )
}

function SlimLogo({ c, meta }: { c: LegacyCbfCause; meta: ReturnType<typeof sectorMeta> }) {
  return (
    <div className="cause-card-slim-logo">
      <CauseBrandLogo
        website={c.website}
        alt={c.naam}
        width={52}
        height={52}
        style={{ width: 52, height: 52, objectFit: 'contain', borderRadius: 10, flexShrink: 0 }}
        fallback={<div style={{ fontSize: '1.8rem' }}>{meta.emoji}</div>}
      />
    </div>
  )
}

