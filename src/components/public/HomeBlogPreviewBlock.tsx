import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CAT_ICONS, getHomeBlogPreviewPosts, type LegacyBlogPost } from '../../features/public/homeBlogPreviewSeed'
import {
  fetchTopCommunityIdeasByVotesLive,
  parseThinkCategory,
  subscribeCommunityIdeasLive,
  type ThinkPost,
} from '../../features/public/denkMeeService'
import { isSupabaseConfigured } from '../../lib/supabase'

type PreviewCard =
  | { source: 'live'; post: ThinkPost }
  | { source: 'seed'; post: LegacyBlogPost }

function liveToPreviewCards(posts: ThinkPost[]): PreviewCard[] {
  return posts.map((post) => ({
    source: 'live' as const,
    post: { ...post, category: parseThinkCategory(post.category) },
  }))
}

function seedToPreviewCards(posts: LegacyBlogPost[]): PreviewCard[] {
  return posts.map((post) => ({ source: 'seed' as const, post }))
}

export function HomeBlogPreviewBlock() {
  const navigate = useNavigate()
  const useLive = isSupabaseConfigured
  const [cards, setCards] = useState<PreviewCard[]>(() =>
    useLive ? [] : seedToPreviewCards(getHomeBlogPreviewPosts()),
  )
  const [loading, setLoading] = useState(useLive)

  const refresh = useCallback(async () => {
    if (!useLive) {
      setCards(seedToPreviewCards(getHomeBlogPreviewPosts()))
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const top = await fetchTopCommunityIdeasByVotesLive(3)
      setCards(liveToPreviewCards(top))
    } catch {
      setCards([])
    } finally {
      setLoading(false)
    }
  }, [useLive])

  useEffect(() => {
    void refresh()
    if (!useLive) return () => {}
    const unsub = subscribeCommunityIdeasLive(() => {
      void refresh()
    })
    return unsub
  }, [useLive, refresh])

  return (
    <section style={{ padding: '64px 0', background: 'linear-gradient(180deg,#f8faff 0%,#fff 100%)' }}>
      <div className="container">
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: '#eff6ff',
              borderRadius: 50,
              padding: '5px 14px',
              fontSize: '0.78rem',
              fontWeight: 700,
              color: '#1a237e',
              marginBottom: 12,
            }}
          >
            💡 COMMUNITY IDEEËN
          </div>
          <h2 className="section-title" style={{ marginBottom: 10 }}>
            Denk mee aan <em>betere wereld</em>
          </h2>
          <p style={{ color: '#6b7280', fontSize: '0.95rem', maxWidth: 520, margin: '0 auto' }}>
            Jouw idee kan het volgende grote project van Donatie.eu worden. Stem, reageer en win punten.
          </p>
        </div>

        {loading && useLive ? (
          <div style={{ textAlign: 'center', color: '#6b7280', fontSize: '0.9rem', marginBottom: 28 }}>Ideeën laden…</div>
        ) : null}

        {!loading && useLive && cards.length === 0 ? (
          <div style={{ textAlign: 'center', marginBottom: 28, color: '#6b7280' }}>
            <p style={{ marginBottom: 14 }}>Nog geen ideeën — wees de eerste op Denk mee.</p>
            <button
              type="button"
              className="btn btn-blue btn-sm"
              onClick={() => navigate('/denk-mee')}
              style={{ fontWeight: 700 }}
            >
              Naar Denk mee
            </button>
          </div>
        ) : null}

        {cards.length > 0 ? (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: 18,
              marginBottom: 28,
              maxWidth: 1080,
              marginLeft: 'auto',
              marginRight: 'auto',
            }}
            id="blogHomePreview"
          >
            {cards.map((wrap) => {
              const isLive = wrap.source === 'live'
              const cat = isLive ? wrap.post.category : wrap.post.categorie
              const title = isLive ? wrap.post.title : wrap.post.titel
              const excerpt = isLive ? wrap.post.excerpt : wrap.post.omschrijving
              const votes = isLive ? wrap.post.votes : wrap.post.stemmen || 0
              const author = isLive ? wrap.post.author_display_name || 'Community' : wrap.post.auteur
              const tag = isLive ? wrap.post.tag : wrap.post.type
              const featured = !isLive && wrap.post.featured
              const key = isLive ? wrap.post.id : wrap.post.id

              return (
                <div
                  key={key}
                  role="button"
                  tabIndex={0}
                  style={{
                    background: '#fff',
                    border: '1.5px solid #e5e7eb',
                    borderRadius: 16,
                    padding: 20,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    cursor: 'pointer',
                    width: '100%',
                    maxWidth: 320,
                    flex: '1 1 280px',
                    boxSizing: 'border-box',
                  }}
                  onClick={() => navigate('/denk-mee')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      navigate('/denk-mee')
                    }
                  }}
                >
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: '1.3rem' }}>{CAT_ICONS[cat] ?? '💡'}</span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>
                      {cat || 'overig'}
                    </span>
                    {tag === 'winnaar' ? (
                      <span
                        style={{
                          background: '#fef3c7',
                          color: '#92400e',
                          borderRadius: 6,
                          padding: '2px 8px',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          marginLeft: 'auto',
                        }}
                      >
                        🏆 Winnaar
                      </span>
                    ) : featured ? (
                      <span
                        style={{
                          background: '#eff6ff',
                          color: '#1d4ed8',
                          borderRadius: 6,
                          padding: '2px 8px',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          marginLeft: 'auto',
                        }}
                      >
                        🔥 Trending
                      </span>
                    ) : null}
                  </div>
                  <div style={{ fontFamily: 'Fraunces,serif', fontWeight: 800, fontSize: '0.97rem', color: '#1f2937', lineHeight: 1.3 }}>
                    {title}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
                    {(excerpt || '').trim().length > 80 ? `${(excerpt || '').substring(0, 80)}…` : excerpt || '—'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid #f1f5f9' }}>
                    <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Door {author}</span>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#059669' }}>👍 {votes}</span>
                  </div>
                </div>
              )
            })}
          </div>
        ) : null}

        <div
          style={{
            textAlign: 'center',
            padding: 28,
            background: 'linear-gradient(135deg,#1a237e,#3a98f8)',
            borderRadius: 20,
            color: '#fff',
          }}
        >
          <div style={{ fontFamily: 'Fraunces,serif', fontSize: '1.3rem', fontWeight: 900, marginBottom: 8 }}>Klaar om mee te denken?</div>
          <div style={{ fontSize: '0.88rem', color: 'rgba(255,255,255,.8)', marginBottom: 18 }}>
            Login en deel jouw idee voor een goed doel project. De community beslist welk idee Donatie.eu realiseert. 🏆
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => navigate('/denk-mee')}
              style={{
                background: '#fff',
                color: '#1a237e',
                border: 'none',
                borderRadius: 10,
                padding: '11px 24px',
                fontWeight: 800,
                cursor: 'pointer',
                fontSize: '0.88rem',
              }}
            >
              💡 Alle ideeën bekijken
            </button>
            <button
              type="button"
              onClick={() => navigate('/auth')}
              style={{
                background: 'rgba(255,255,255,.15)',
                color: '#fff',
                border: '1.5px solid rgba(255,255,255,.4)',
                borderRadius: 10,
                padding: '11px 24px',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: '0.88rem',
              }}
            >
              Inloggen & deelnemen →
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
