import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  HOME_NEWS_TYPE_META,
  NEWS_CATEGORY_KEYS,
  getTypeColor,
  getTypeTextColor,
} from '../../features/public/homeNewsSeed'
import { useLiveNewsItems } from '../../features/public/newsLive'
import { resolveDonateCauseId } from '../../features/public/resolveDonateCauseId'

function parseNewsBodyHtml(body: string) {
  const lines = (body || '').split('\n')
  const out: ReactNode[] = []

  lines.forEach((line, i) => {
    if (line.startsWith('### ')) {
      out.push(<h3 key={i}>{line.slice(4)}</h3>)
      return
    }
    if (line.startsWith('## ')) {
      out.push(<h3 key={i}>{line.slice(3)}</h3>)
      return
    }
    if (line.startsWith('- ')) {
      out.push(
        <p key={i} style={{ margin: '4px 0 4px 10px' }}>
          • {line.slice(2)}
        </p>,
      )
      return
    }
    if (line.trim() === '') {
      return
    }
    out.push(<p key={i}>{line}</p>)
  })

  return out
}

export function NieuwsPage() {
  const navigate = useNavigate()
  const [type, setType] = useState('')
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const liveItems = useLiveNewsItems()

  const items = useMemo(() => {
    let list = liveItems
    if (type) list = list.filter((n) => n.type === type)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((n) => n.title.toLowerCase().includes(q))
    }
    return list
  }, [liveItems, search, type])
  const openItem = useMemo(() => items.find((n) => n.id === openId) ?? null, [items, openId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenId(null)
    }
    if (!openId) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [openId])

  useEffect(() => {
    // Legacy localStorage-bump blijft overbodig; live via useLiveNewsItems.
  }, [])

  function donateNavigate(donateTo: string) {
    const id = resolveDonateCauseId(donateTo)
    if (id != null) navigate(`/goede-doelen?donate=1&causeId=${id}`)
    else navigate('/goede-doelen')
    setOpenId(null)
  }

  async function shareNewsItem() {
    if (!openItem) return
    const shareText = `${openItem.title} — ${openItem.org}`
    try {
      await navigator.clipboard.writeText(shareText)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = shareText
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
  }

  return (
    <main role="main" id="mainContent">
      <div id="page-nieuws" className="page active">
        <div className="section-lg news-section">
          <div className="container">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 28 }}>
            <div>
              <h1 style={{ fontFamily: 'Fraunces,serif', fontSize: '2rem', fontWeight: 900, color: '#1a237e', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
                  <path d="M18 14h-8" />
                  <path d="M15 18h-5" />
                  <path d="M10 6h8v4h-8V6z" />
                </svg>
                Nieuws
              </h1>
              <p style={{ color: 'var(--mid)', margin: '6px 0 0', fontSize: '0.93rem' }}>Het laatste nieuws van Donatie.eu en onze goede doelen</p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <select
                id="newsFilterType"
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="input"
                style={{ width: 150, fontSize: '0.85rem' }}
                aria-label="Filter op type"
              >
                <option value="">Alle typen</option>
                {NEWS_CATEGORY_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {HOME_NEWS_TYPE_META[k].emoji} {HOME_NEWS_TYPE_META[k].label}
                  </option>
                ))}
              </select>
              <input
                id="newsSearchFront"
                className="input"
                placeholder="🔍 Zoeken..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: 180, fontSize: '0.85rem' }}
                aria-label="Zoek in nieuws"
              />
            </div>
          </div>

            {items.length === 0 ? (
              <div id="nieuwsEmpty" style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--mid)' }}>
                <div style={{ fontSize: '3rem', marginBottom: 12 }}>📭</div>
                <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>Geen nieuwsberichten gevonden</div>
                <div style={{ fontSize: '.88rem', marginTop: 6 }}>Pas de filters aan of kom later terug.</div>
              </div>
            ) : (
              <div className="news-grid" id="nieuwsGrid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 20 }}>
                {items.map((n) => (
                  <article key={n.id} className="news-card" role="button" tabIndex={0} onClick={() => setOpenId(n.id)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setOpenId(n.id)}>
                    <div className="news-card-thumb" aria-hidden>
                      <span
                        className="news-card-type"
                        style={{
                          background: getTypeColor(n.type),
                          color: getTypeTextColor(n.type),
                        }}
                      >
                        {(HOME_NEWS_TYPE_META[n.type] ?? HOME_NEWS_TYPE_META.nieuws).label}
                      </span>
                      {n.img ? <img src={n.img} alt="" /> : <div className="news-card-thumb-placeholder">{n.emoji || '📰'}</div>}
                    </div>
                    <div className="news-card-body">
                      <div className="news-card-org">
                        {(HOME_NEWS_TYPE_META[n.type] ?? HOME_NEWS_TYPE_META.nieuws).emoji} {n.org}
                      </div>
                      <h3 className="news-card-title">{n.title}</h3>
                      <p className="news-card-excerpt">{n.excerpt}</p>
                      <div className="news-card-footer">
                        <span className="news-card-date">{n.date}</span>
                        <span className="news-card-action">Lees meer →</span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <div
        className={`news-modal-overlay${openId ? ' open' : ''}`}
        role="presentation"
        onClick={(e) => {
          if (e.target === e.currentTarget) setOpenId(null)
        }}
      >
        <div className="news-modal" role="dialog" aria-modal="true">
          {openItem ? (
            <>
              <div className="news-modal-hero">
                <button type="button" className="news-modal-close" onClick={() => setOpenId(null)} aria-label="Sluiten">
                  ✕
                </button>
                {openItem.img ? (
                  <img src={openItem.img} alt="" style={{ display: 'block', position: 'absolute', inset: 0 }} />
                ) : (
                  <div className="news-modal-hero-placeholder">{openItem.emoji || '📰'}</div>
                )}
              </div>
              <div className="news-modal-body">
                <div className="news-modal-meta">
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
                <h2 style={{ fontFamily: 'Fraunces,serif', fontSize: '1.5rem', fontWeight: 900, color: 'var(--dark)', marginBottom: 12 }}>{openItem.title}</h2>
                <div className="news-modal-content">{parseNewsBodyHtml(openItem.body || openItem.excerpt)}</div>
                {openItem.donateTo ? (
                  <div style={{ background: 'var(--green-light)', borderRadius: 14, padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--green-dark)', marginBottom: 2 }}>💚 Doneer aan {openItem.org}</div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--mid)' }}>Steun dit goede doel direct via Donatie.eu</div>
                    </div>
                    <button type="button" className="btn btn-green" style={{ flexShrink: 0 }} onClick={() => donateNavigate(openItem.donateTo as string)}>
                      Doneer nu →
                    </button>
                  </div>
                ) : null}
                <div style={{ marginTop: 10 }}>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => void shareNewsItem()}>
                    📋 Kopieer titel om te delen
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </main>
  )
}
