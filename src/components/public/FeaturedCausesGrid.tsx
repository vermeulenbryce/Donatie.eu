import { useMemo, type CSSProperties, type MouseEvent } from 'react'
import { useNavigate, type NavigateFunction } from 'react-router-dom'
import { CBF_CAUSES, type LegacyCbfCause } from '../../features/legacy/cbfCauses.generated'
import { useLiveFeaturedCauseIds } from '../../features/public/featuredCausesLive'
import { sectorMeta } from '../../features/legacy/legacySectorMeta'
import { CauseBrandLogo } from './CauseBrandLogo'

const DONATE_ICON_SRC = '/legacy-cause-donate-icon.jpg'

function pickFeatured(ids: readonly number[]): LegacyCbfCause[] {
  return ids.map((id) => CBF_CAUSES.find((c) => c.id === id)).filter((c): c is LegacyCbfCause => Boolean(c))
}

type FeaturedCausesGridProps = {
  /** Als gezet overschrijft dit de live Supabase-bron. */
  featuredIds?: readonly number[]
  /** When embedded (e.g. dashboard), omit duplicate id from homepage grid. */
  rootId?: string
  rootStyle?: CSSProperties
}

export function FeaturedCausesGrid({
  featuredIds,
  rootId = 'featuredCausesGrid',
  rootStyle,
}: FeaturedCausesGridProps) {
  const navigate = useNavigate()
  const liveIds = useLiveFeaturedCauseIds()
  const effectiveIds = featuredIds ?? liveIds
  const picks = useMemo(() => pickFeatured(effectiveIds), [effectiveIds])

  return (
    <div className="fcauses-grid" style={rootStyle} {...(rootId ? { id: rootId } : {})}>
      {picks.map((c) => (
        <FeaturedCauseCard
          key={c.id}
          c={c}
          navigate={navigate}
          onOpenDetail={() => navigate(`/goede-doelen?causeId=${c.id}`)}
        />
      ))}
    </div>
  )
}

function FeaturedCauseCard({
  c,
  navigate,
  onOpenDetail,
}: {
  c: LegacyCbfCause
  navigate: NavigateFunction
  onOpenDetail: () => void
}) {
  const meta = sectorMeta(c.sector)

  const thumbStyle: CSSProperties = {
    background: `linear-gradient(135deg,${meta.color},${meta.color2})`,
  }

  const openDonate = (e: MouseEvent) => {
    e.stopPropagation()
    navigate(`/goede-doelen?causeId=${c.id}&donate=1`)
  }

  return (
    <div
      className="cause-card"
      role="link"
      tabIndex={0}
      onClick={onOpenDetail}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpenDetail()
        }
      }}
    >
      <div className="cause-thumb" style={thumbStyle} data-website={c.website || ''}>
        <div className="logo-wrap">
          <CauseBrandLogo
            website={c.website}
            alt={`${c.naam} logo`}
            width={80}
            height={80}
            style={{ width: 80, height: 80, objectFit: 'contain' }}
            fallback={<span style={{ fontSize: '2.2rem' }}>{meta.emoji}</span>}
            loading="eager"
          />
        </div>
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
          {c.missie}
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
        <button type="button" className="cause-donate-btn mt16" onClick={openDonate}>
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
