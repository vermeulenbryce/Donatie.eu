import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  getTypeColor,
  getTypeTextColor,
  HOME_NEWS_TYPE_META,
  type HomeNewsType,
} from '../../features/public/homeNewsSeed'
import { useLiveNewsItems } from '../../features/public/newsLive'
import { resolveDonateCauseId } from '../../features/public/resolveDonateCauseId'

const NEWS_PER_PAGE = 6

function NewsDocIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
      <path d="M18 14h-8" />
      <path d="M15 18h-5" />
      <path d="M10 6h8v4h-8V6z" />
    </svg>
  )
}

function parseNewsBodyHtml(body: string) {
  const lines = (body || '').split('\n')
  const out: ReactNode[] = []
  lines.forEach((line, i) => {
    if (line.startsWith('### ')) {
      out.push(<h3 key={i}>{line.slice(4)}</h3>)
    } else if (line.startsWith('## ')) {
      out.push(
        <h3 key={i} style={{ fontSize: '1.25rem' }}>
          {line.slice(3)}
        </h3>,
      )
    } else if (line.startsWith('- ')) {
      out.push(
        <li key={i} style={{ marginBottom: 4 }}>
          {line.slice(2)}
        </li>,
      )
    } else if (line === '---') {
      out.push(<hr key={i} style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0' }} />)
    } else if (line.trim() === '') {
      return
    } else {
      out.push(<p key={i}>{line}</p>)
    }
  })
  return out
}

export function HomeNewsSection() {
  const navigate = useNavigate()
  const items = useLiveNewsItems()
  const [filter, setFilter] = useState<'all' | HomeNewsType>('all')
  const [page, setPage] = useState(1)
  const [openId, setOpenId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    if (filter === 'all') return items
    return items.filter((n) => n.type === filter)
  }, [items, filter])

  const visible = useMemo(() => filtered.slice(0, page * NEWS_PER_PAGE), [filtered, page])

  const openItem = useMemo(() => items.find((n) => n.id === openId) ?? null, [items, openId])

  useEffect(() => {
    if (!openId) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [openId])

  const setFilterType = (t: 'all' | HomeNewsType) => {
    setFilter(t)
    setPage(1)
  }

  const showLoadMore = filtered.length > visible.length

  const openModal = (id: string) => setOpenId(id)
  const closeModal = () => setOpenId(null)

  const donateNavigate = (donateTo: string) => {
    const id = resolveDonateCauseId(donateTo)
    if (id != null) {
      navigate(`/goede-doelen?donate=1&causeId=${id}`)
    } else {
      navigate('/goede-doelen')
    }
    closeModal()
  }

  return (
    <>
      <section className="news-section" id="homeNewsSection">
        <div className="container">
          <div className="news-header">
            <div className="news-header-left">
              <div className="news-eyebrow">
                <NewsDocIcon /> Nieuws & updates
              </div>
              <h2 className="news-title">
                Wat er speelt bij
                <br />
                goede doelen
              </h2>
            </div>
            <Link to="/nieuws" className="btn btn-outline">
              Alle berichten →
            </Link>
          </div>
          <div className="news-filters" id="homeNewsFilters">
            <button
              type="button"
              className={`news-filter-btn${filter === 'all' ? ' active' : ''}`}
              onClick={() => setFilterType('all')}
            >
              Alles
            </button>
            <button
              type="button"
              className={`news-filter-btn${filter === 'update' ? ' active' : ''}`}
              onClick={() => setFilterType('update')}
            >
              📱 Updates
            </button>
            <button
              type="button"
              className={`news-filter-btn${filter === 'evenement' ? ' active' : ''}`}
              onClick={() => setFilterType('evenement')}
            >
              📅 Evenementen
            </button>
            <button
              type="button"
              className={`news-filter-btn${filter === 'actie' ? ' active' : ''}`}
              onClick={() => setFilterType('actie')}
            >
              🚀 Acties
            </button>
            <button
              type="button"
              className={`news-filter-btn${filter === 'nieuws' ? ' active' : ''}`}
              onClick={() => setFilterType('nieuws')}
            >
              <NewsDocIcon /> Nieuws
            </button>
            <button
              type="button"
              className={`news-filter-btn${filter === 'succes' ? ' active' : ''}`}
              onClick={() => setFilterType('succes')}
            >
              🏆 Successen
            </button>
          </div>
          <div className="news-grid" id="homeNewsGrid">
            {!filtered.length ? (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 48, color: 'var(--mid)' }}>
                Geen berichten gevonden.
              </div>
            ) : (
              visible.map((item, idx) => {
                const meta = HOME_NEWS_TYPE_META[item.type] ?? HOME_NEWS_TYPE_META.nieuws
                const isFeatured = !!item.featured && idx === 0
                const thumb = item.img ? (
                  <img src={item.img} alt={item.title} onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
                ) : (
                  <div className="news-card-thumb-placeholder">{item.emoji}</div>
                )
                return (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    className={`news-card${isFeatured ? ' featured' : ''}`}
                    onClick={() => openModal(item.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        openModal(item.id)
                      }
                    }}
                  >
                    <div className="news-card-thumb">
                      {thumb}
                      <span className={`news-card-type ${meta.cls}`}>
                        {meta.emoji} {meta.label}
                      </span>
                    </div>
                    <div className="news-card-body">
                      <div className="news-card-org">
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: 'var(--blue)',
                            display: 'inline-block',
                            flexShrink: 0,
                          }}
                        />
                        {item.org}
                      </div>
                      <div className="news-card-title">{item.title}</div>
                      <div className="news-card-excerpt">{item.excerpt}</div>
                      <div className="news-card-footer">
                        <span className="news-card-date">{item.date}</span>
                        <span className="news-card-action">Lees meer →</span>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
          <div className="news-load-more">
            <button
              type="button"
              className="btn btn-outline"
              id="newsLoadMoreBtn"
              style={{ display: showLoadMore ? '' : 'none' }}
              onClick={() => setPage((p) => p + 1)}
            >
              Meer laden
            </button>
          </div>
        </div>
      </section>

      <div
        className={`news-modal-overlay${openId ? ' open' : ''}`}
        id="newsModalOverlay"
        role="presentation"
        onClick={(e) => {
          if (e.target === e.currentTarget) closeModal()
        }}
      >
        <div className="news-modal" id="newsModalBox" role="dialog" aria-modal="true" aria-labelledby="newsModalTitle">
          {openItem ? (
            <>
              <div className="news-modal-hero" id="newsModalHero">
                <button type="button" className="news-modal-close" onClick={closeModal} aria-label="Sluiten">
                  ✕
                </button>
                {openItem.img ? (
                  <>
                    <div className="news-modal-hero-placeholder" id="newsModalEmoji" style={{ display: 'none' }} />
                    <img id="newsModalImg" src={openItem.img} alt="" style={{ display: 'block', position: 'absolute', inset: 0 }} />
                  </>
                ) : (
                  <>
                    <div className="news-modal-hero-placeholder" id="newsModalEmoji">
                      {openItem.emoji || '📰'}
                    </div>
                    <img id="newsModalImg" src="" alt="" style={{ display: 'none', position: 'absolute', inset: 0 }} />
                  </>
                )}
              </div>
              <div className="news-modal-body">
                <div className="news-modal-meta" id="newsModalMeta">
                  <span
                    style={{
                      background: getTypeColor(openItem.type),
                      color: getTypeTextColor(openItem.type),
                      borderRadius: 'var(--r-full)',
                      padding: '4px 12px',
                      fontSize: '0.72rem',
                      fontWeight: 800,
                    }}
                  >
                    {(HOME_NEWS_TYPE_META[openItem.type] ?? HOME_NEWS_TYPE_META.nieuws).emoji}{' '}
                    {(HOME_NEWS_TYPE_META[openItem.type] ?? HOME_NEWS_TYPE_META.nieuws).label}
                  </span>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--blue)' }}>{openItem.org}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--light)' }}>{openItem.date}</span>
                </div>
                <h2
                  style={{
                    fontFamily: 'Fraunces,serif',
                    fontSize: '1.5rem',
                    fontWeight: 900,
                    color: 'var(--dark)',
                    marginBottom: 12,
                  }}
                  id="newsModalTitle"
                >
                  {openItem.title}
                </h2>
                <div className="news-modal-content" id="newsModalContent">
                  {parseNewsBodyHtml(openItem.body || openItem.excerpt)}
                </div>
                <div className="news-modal-donate" id="newsModalDonate">
                  {openItem.donateTo ? (
                    <div
                      style={{
                        background: 'var(--green-light)',
                        borderRadius: 14,
                        padding: '18px 20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 16,
                        flexWrap: 'wrap',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, color: 'var(--green-dark)', marginBottom: 2 }}>
                          💚 Doneer aan {openItem.org}
                        </div>
                        <div style={{ fontSize: '0.82rem', color: 'var(--mid)' }}>
                          Steun dit goede doel direct via Donatie.eu
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn btn-green"
                        style={{ flexShrink: 0 }}
                        onClick={() => donateNavigate(openItem.donateTo)}
                      >
                        Doneer nu →
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </>
  )
}
