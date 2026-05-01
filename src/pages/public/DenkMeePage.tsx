import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLegacyUiSession } from '../../context/LegacyUiSessionContext'
import { readDnlAccounts, upsertDnlAccountProfile } from '../../features/account/legacyDashboardModel'
import { isSupabaseConfigured } from '../../lib/supabase'
import {
  type ThinkCategory,
  type ThinkPost,
  fetchCommunityIdeasLive,
  fetchMyThinkVoteIdsLive,
  parseThinkCategory,
  subscribeCommunityIdeasLive,
  submitCommunityIdeaRpc,
  toggleCommunityIdeaVoteRpc,
} from '../../features/public/denkMeeService'

type Filter = 'recent' | 'populair' | 'poll' | 'winnaar'

const THINK_STORAGE_KEY = 'dnl_think_posts'
const THINK_VOTES_KEY = 'dnl_think_votes'
const THINK_LAST_SUBMIT_KEY = 'dnl_think_last_submit_at'
const THINK_UPDATED_EVENT = 'dnl:think-posts-updated'
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

function readThinkPostsLocal(): ThinkPost[] {
  try {
    const raw = localStorage.getItem(THINK_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as ThinkPost[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeThinkPosts(rows: ThinkPost[]) {
  localStorage.setItem(THINK_STORAGE_KEY, JSON.stringify(rows))
  window.dispatchEvent(new CustomEvent(THINK_UPDATED_EVENT))
}

function readThinkVotes(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(THINK_VOTES_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, string[]>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeThinkVotes(rows: Record<string, string[]>) {
  localStorage.setItem(THINK_VOTES_KEY, JSON.stringify(rows))
}

function readLastSubmitAt(email: string): number | null {
  try {
    const raw = localStorage.getItem(THINK_LAST_SUBMIT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, number>
    const k = email.toLowerCase()
    const t = parsed[k]
    return typeof t === 'number' && Number.isFinite(t) ? t : null
  } catch {
    return null
  }
}

function writeLastSubmitAt(email: string, at: number) {
  try {
    const raw = localStorage.getItem(THINK_LAST_SUBMIT_KEY)
    const parsed = raw ? (JSON.parse(raw) as Record<string, number>) : {}
    parsed[email.toLowerCase()] = at
    localStorage.setItem(THINK_LAST_SUBMIT_KEY, JSON.stringify(parsed))
  } catch {
    /* ignore */
  }
}

function canSubmitLocalWeekly(email: string | undefined): boolean {
  if (!email) return false
  const last = readLastSubmitAt(email)
  if (last == null) return true
  return Date.now() - last >= WEEK_MS
}

export function DenkMeePage() {
  const { shell, refreshSession } = useLegacyUiSession()
  const [filter, setFilter] = useState<Filter>('recent')
  const [cat, setCat] = useState('')
  const [newCategory, setNewCategory] = useState<ThinkCategory>('sociaal')
  const [allPosts, setAllPosts] = useState<ThinkPost[]>([])
  const [voteMap, setVoteMap] = useState<Record<string, string[]>>({})
  const [newTitle, setNewTitle] = useState('')
  const [newExcerpt, setNewExcerpt] = useState('')
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [liveLoading, setLiveLoading] = useState(isSupabaseConfigured)
  const [myVoteIds, setMyVoteIds] = useState<Set<string>>(() => new Set())

  const voteKey = shell?.email?.toLowerCase() || 'guest'
  const userId = shell?.user?.id ?? null
  const useLive = isSupabaseConfigured

  const loadLive = useCallback(async () => {
    if (!useLive) return
    setLiveLoading(true)
    try {
      const [posts, voted] = await Promise.all([fetchCommunityIdeasLive(), fetchMyThinkVoteIdsLive()])
      setAllPosts(posts.map((p) => ({ ...p, category: parseThinkCategory(p.category) })))
      setMyVoteIds(voted)
    } catch (e) {
      console.warn('[DenkMee]', e)
      setMsg({ ok: false, text: 'Kon ideeën niet laden. Controleer je verbinding.' })
    } finally {
      setLiveLoading(false)
    }
  }, [useLive])

  useEffect(() => {
    if (!useLive) {
      setAllPosts(readThinkPostsLocal())
      setVoteMap(readThinkVotes())
      return
    }
    void loadLive()
    const unsub = subscribeCommunityIdeasLive(() => {
      void loadLive()
    })
    return unsub
  }, [useLive, loadLive])

  useEffect(() => {
    if (useLive) return
    const refresh = () => {
      setAllPosts(readThinkPostsLocal())
      setVoteMap(readThinkVotes())
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key === THINK_STORAGE_KEY || e.key === THINK_VOTES_KEY) refresh()
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener(THINK_UPDATED_EVENT, refresh)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(THINK_UPDATED_EVENT, refresh)
    }
  }, [useLive])

  const posts = useMemo(() => {
    let list = [...allPosts]
    if (filter === 'poll') list = list.filter((p) => p.tag === 'poll')
    if (filter === 'winnaar') list = list.filter((p) => p.tag === 'winnaar')
    if (filter === 'populair') list.sort((a, b) => b.votes - a.votes)
    else list.sort((a, b) => {
      const ta = new Date(a.created_at ?? 0).getTime()
      const tb = new Date(b.created_at ?? 0).getTime()
      return tb - ta
    })
    if (cat) list = list.filter((p) => p.category === cat)
    return list
  }, [allPosts, cat, filter])

  const votedOn = useCallback(
    (postId: string) => {
      if (useLive) return myVoteIds.has(postId)
      return new Set(voteMap[voteKey] || []).has(postId)
    },
    [useLive, myVoteIds, voteMap, voteKey],
  )

  async function submitIdea() {
    const title = newTitle.trim()
    const excerpt = newExcerpt.trim()
    if (!title || !excerpt) {
      setMsg({ ok: false, text: 'Vul een titel en korte toelichting in.' })
      return
    }
    if (!shell?.email) {
      setMsg({ ok: false, text: 'Log in om een idee in te dienen.' })
      return
    }

    if (useLive) {
      const res = await submitCommunityIdeaRpc(title, excerpt, newCategory)
      if (!res.ok) {
        const map: Record<string, string> = {
          not_authenticated: 'Log in om een idee in te dienen.',
          title_excerpt_required: 'Vul een titel en toelichting in.',
          text_too_long: 'Tekst is te lang.',
          invalid_category: 'Ongeldige categorie.',
          weekly_submit_limit: 'Je kunt maximaal 1 idee per week indienen. Probeer het volgende week opnieuw.',
          unknown: 'Indienen mislukt.',
        }
        setMsg({ ok: false, text: map[res.reason] ?? 'Indienen mislukt.' })
        return
      }
      setNewTitle('')
      setNewExcerpt('')
      setMsg({ ok: true, text: 'Idee geplaatst. +50 punten op je account.' })
      await refreshSession()
      void loadLive()
      return
    }

    if (!canSubmitLocalWeekly(shell.email)) {
      setMsg({ ok: false, text: 'Je kunt maximaal één idee per 7 dagen indienen (offline modus).' })
      return
    }

    const next: ThinkPost = {
      id: `u-${Date.now()}`,
      title,
      excerpt,
      votes: 0,
      tag: 'idee',
      category: newCategory,
      author_display_name: shell.displayName,
      author_id: userId ?? undefined,
      created_at: new Date().toISOString(),
    }
    const rows = [next, ...allPosts]
    setAllPosts(rows)
    writeThinkPosts(rows)
    writeLastSubmitAt(shell.email, Date.now())

    const stored = readDnlAccounts()[shell.email] || {}
    const basePoints = Number(stored.points ?? shell.points ?? 0)
    upsertDnlAccountProfile(shell.email, { points: basePoints + 50 })

    setNewTitle('')
    setNewExcerpt('')
    setMsg({ ok: true, text: 'Idee toegevoegd aan de communitylijst (lokaal op dit apparaat).' })
  }

  async function toggleVote(postId: string, _authorId: string | null | undefined, isOwnIdea: boolean) {
    if (!shell?.email) {
      setMsg({ ok: false, text: 'Log in om te stemmen of je stem aan te passen.' })
      return
    }
    if (isOwnIdea) {
      setMsg({ ok: false, text: 'Je kunt niet op je eigen idee stemmen.' })
      return
    }

    if (useLive) {
      try {
        const res = await toggleCommunityIdeaVoteRpc(postId)
        if (!res.ok) {
          const map: Record<string, string> = {
            not_authenticated: 'Log opnieuw in om te stemmen.',
            idea_not_found: 'Dit idee bestaat niet (meer).',
            own_idea: 'Je kunt niet op je eigen idee stemmen.',
            unknown: 'Stemmislukt.',
          }
          setMsg({ ok: false, text: map[res.reason] ?? 'Stemmislukt.' })
          return
        }

        setMyVoteIds((prev) => {
          const next = new Set(prev)
          if (res.voted) next.add(postId)
          else next.delete(postId)
          return next
        })

        if (typeof res.vote_count === 'number') {
          setAllPosts((rows) =>
            rows.map((r) =>
              r.id === postId
                ? { ...r, votes: res.vote_count ?? r.votes }
                : r,
            ),
          )
        }

        setMsg({
          ok: true,
          text: res.voted ? 'Stem toegepast. +2 punten voor jou; +10 voor de ideemaker.' : 'Stem ingetrokken (punten aangepast).',
        })
        await refreshSession()
        void loadLive()
      } catch (e) {
        setMsg({ ok: false, text: e instanceof Error ? e.message : 'Stemmislukt.' })
      }
      return
    }

    /* Offline: toggle in localStorage */
    const already = new Set(voteMap[voteKey] || [])
    const rows = [...allPosts]
    const idx = rows.findIndex((p) => p.id === postId)
    if (idx === -1) return

    if (already.has(postId)) {
      already.delete(postId)
      rows[idx] = { ...rows[idx], votes: Math.max(0, rows[idx].votes - 1) }
      const stored = readDnlAccounts()[shell.email] || {}
      const basePoints = Number(stored.points ?? shell.points ?? 0)
      upsertDnlAccountProfile(shell.email, { points: Math.max(0, basePoints - 2) })
      setMsg({ ok: true, text: 'Stem ingetrokken.' })
    } else {
      already.add(postId)
      rows[idx] = { ...rows[idx], votes: rows[idx].votes + 1 }
      const stored = readDnlAccounts()[shell.email] || {}
      const basePoints = Number(stored.points ?? shell.points ?? 0)
      upsertDnlAccountProfile(shell.email, { points: basePoints + 2 })
      setMsg({ ok: true, text: 'Stem uitgebracht. +2 punten toegevoegd.' })
    }

    const nextMap = { ...voteMap, [voteKey]: [...already] }
    setVoteMap(nextMap)
    writeThinkVotes(nextMap)
    setAllPosts(rows)
    writeThinkPosts(rows)
  }

  const canSubmitWeeklyHint = (): string | null => {
    if (!shell?.email || useLive) return null
    if (canSubmitLocalWeekly(shell.email)) return null
    const last = readLastSubmitAt(shell.email)
    if (last == null) return null
    const days = Math.max(0, Math.ceil((last + WEEK_MS - Date.now()) / 86400000))
    return `Je kunt nog geen nieuw idee indienen (${days} ${days === 1 ? 'dag' : 'dagen'} resterend, offline teller).`
  }

  const hintWeekly = canSubmitWeeklyHint()

  return (
    <main role="main" id="mainContent">
      <div id="page-blog" className="page active">
        <section
          style={{
            background: 'linear-gradient(135deg,#1a237e 0%,#3a98f8 60%,#43A3FA 100%)',
            padding: '72px 0 56px',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background:
                "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none'%3E%3Cg fill='%23ffffff' fill-opacity='0.04'%3E%3Ccircle cx='30' cy='30' r='20'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
              pointerEvents: 'none',
            }}
          />
          <div className="container" style={{ position: 'relative', textAlign: 'center' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: 'rgba(255,255,255,.15)',
                borderRadius: 50,
                padding: '6px 16px',
                fontSize: '0.78rem',
                fontWeight: 700,
                color: '#fff',
                marginBottom: 20,
              }}
            >
              💡 COMMUNITY PLATFORM {useLive ? '· live' : ''}
            </div>
            <h1
              style={{
                fontFamily: 'Fraunces,serif',
                fontSize: 'clamp(2rem, 5vw, 3.2rem)',
                fontWeight: 900,
                color: '#fff',
                marginBottom: 16,
                lineHeight: 1.1,
              }}
            >
              Denk mee.
              <br />
              <em style={{ fontStyle: 'italic', fontWeight: 300 }}>Maak het verschil.</em>
            </h1>
            <p style={{ fontSize: '1rem', color: 'rgba(255,255,255,.85)', maxWidth: 560, margin: '0 auto 28px', lineHeight: 1.7 }}>
              Heb jij een idee voor een goed doel project? Deel het hier. Het beste idee wint — en de bedenker mag meehelpen het te realiseren.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              {shell ? (
                <>
                  <button
                    type="button"
                    className="btn btn-lg"
                    style={{ background: '#fff', color: '#1a237e', fontWeight: 800, border: 'none' }}
                    onClick={() => document.getElementById('denkMeeIdeaForm')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  >
                    💡 Idee indienen
                  </button>
                  <button
                    type="button"
                    className="btn btn-lg"
                    style={{ background: 'rgba(255,255,255,.15)', color: '#fff', border: '1.5px solid rgba(255,255,255,.4)' }}
                    onClick={() => document.getElementById('denkMeePostsGrid')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  >
                    🗳️ Stemmen
                  </button>
                </>
              ) : (
                <>
                  <Link to="/auth" className="btn btn-lg" style={{ background: '#fff', color: '#1a237e', fontWeight: 800, border: 'none' }}>
                    💡 Idee indienen
                  </Link>
                  <Link
                    to="/auth"
                    className="btn btn-lg"
                    style={{ background: 'rgba(255,255,255,.15)', color: '#fff', border: '1.5px solid rgba(255,255,255,.4)' }}
                  >
                    🗳️ Stemmen
                  </Link>
                </>
              )}
            </div>
          </div>
        </section>

        <section style={{ background: '#fff', borderBottom: '1.5px solid #e5e7eb', padding: '24px 0' }}>
          <div className="container">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20, textAlign: 'center' }}>
              {[
                ['💡', '1. Idee indienen', '+50 punten bij indiening (max 1 per week per account)'],
                ['🗳️', '2. Community stemt', '+2 voor jou bij stem · +10 voor het idee — tap opnieuw om in te trekken'],
                ['🏆', '3. Winnaar realiseert', 'Winnaar helpt mee met uitvoering'],
                ['🚀', '4. Project live', 'Donatie.eu zet het project op'],
              ].map(([icon, title, sub]) => (
                <div key={String(title)}>
                  <div style={{ fontSize: '1.8rem', marginBottom: 6 }}>{icon}</div>
                  <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#1f2937', marginBottom: 3 }}>{title}</div>
                  <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{sub}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="container" style={{ padding: '40px 0 80px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14, marginBottom: 28 }}>
            <h2 style={{ fontFamily: 'Fraunces,serif', fontSize: '1.6rem', fontWeight: 900, margin: 0 }}>Alle ideeën & polls</h2>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {(
                [
                  ['recent', '🕐 Recent'],
                  ['populair', '🔥 Populair'],
                  ['poll', '📊 Polls'],
                  ['winnaar', '🏆 Winnaars'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(id)}
                  style={{
                    padding: '7px 16px',
                    border: 'none',
                    borderRadius: 20,
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    background: filter === id ? '#1a237e' : '#f3f4f6',
                    color: filter === id ? '#fff' : '#374151',
                  }}
                >
                  {label}
                </button>
              ))}
              <select
                value={cat}
                onChange={(e) => setCat(e.target.value)}
                style={{ border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '7px 14px', fontSize: '0.82rem', background: '#fff' }}
              >
                <option value="">Alle categorieën</option>
                <option value="natuur">🌿 Natuur</option>
                <option value="gezondheid">❤️ Gezondheid</option>
                <option value="kinderen">👶 Kinderen</option>
                <option value="dieren">🐾 Dieren</option>
                <option value="sociaal">🤝 Sociaal</option>
                <option value="innovatie">🚀 Innovatie</option>
              </select>
            </div>
          </div>

          {liveLoading && useLive ? (
            <p style={{ color: '#6b7280', marginBottom: 20 }}>Ideeën laden…</p>
          ) : null}

          <div
            id="denkMeePostsGrid"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20, marginBottom: 32 }}
          >
            {posts.length === 0 && !liveLoading ? (
              <p style={{ color: '#6b7280', gridColumn: '1 / -1' }}>
                {useLive ? 'Nog geen ideeën. Wees de eerste die een idee indient.' : 'Nog geen ideeën in je lokale opslag.'}
              </p>
            ) : null}
            {posts.map((p) => {
              const own = useLive && userId && p.author_id === userId
              const voted = votedOn(p.id)
              return (
                <article
                  key={p.id}
                  className="blog-post-card"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    textAlign: 'center',
                  }}
                >
                  <div
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      color: '#6b7280',
                      marginBottom: 10,
                      lineHeight: 1.5,
                      maxWidth: '100%',
                    }}
                  >
                    {p.tag.toUpperCase()} · {p.votes} stemmen
                    {p.author_display_name ? (
                      <>
                        {' '}
                        · door <span style={{ color: '#374151' }}>{p.author_display_name}</span>
                      </>
                    ) : null}
                  </div>
                  <h3
                    style={{
                      fontFamily: 'Fraunces,serif',
                      fontSize: '1.1rem',
                      fontWeight: 800,
                      margin: '0 0 10px',
                      lineHeight: 1.35,
                      width: '100%',
                    }}
                  >
                    {p.title}
                  </h3>
                  <p
                    style={{
                      fontSize: '0.88rem',
                      color: '#6b7280',
                      lineHeight: 1.6,
                      margin: 0,
                      maxWidth: 300,
                      width: '100%',
                    }}
                  >
                    {p.excerpt}
                  </p>
                  <div style={{ marginTop: 14, width: '100%', display: 'flex', justifyContent: 'center' }}>
                    {shell?.email ? (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline"
                        onClick={() => void toggleVote(p.id, p.author_id ?? null, Boolean(own))}
                        disabled={Boolean(own)}
                        title={
                          own
                            ? 'Je kunt niet op je eigen idee stemmen'
                            : voted
                              ? 'Klik opnieuw om je stem in te trekken'
                              : 'Stem op dit idee (+2 jou / +10 ideemaker)'
                        }
                      >
                        {own ? '🙋 Jouw idee' : voted ? '↩️ Stem intrekken' : '🗳️ Stem +1'}
                      </button>
                    ) : (
                      <Link to="/auth" className="btn btn-sm btn-outline">
                        Inloggen om te stemmen
                      </Link>
                    )}
                  </div>
                </article>
              )
            })}
          </div>

          <div
            id="denkMeeIdeaForm"
            style={{
              background: '#fff',
              border: '1.5px solid #e5e7eb',
              borderRadius: 16,
              padding: 20,
              marginBottom: 20,
              opacity: shell?.email ? 1 : 0.75,
            }}
          >
            <div style={{ fontWeight: 800, fontSize: '.95rem', marginBottom: 10, color: '#1a237e' }}>💡 Dien direct een idee in</div>
            {!shell?.email ? (
              <p style={{ fontSize: '.88rem', color: '#6b7280' }}>
                <Link to="/auth">Log in</Link> om een idee te plaatsen (max. 1 per week per account).
              </p>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                <input className="input" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Titel van je idee" />
                <textarea className="input" rows={3} value={newExcerpt} onChange={(e) => setNewExcerpt(e.target.value)} placeholder="Korte toelichting" />
                <label style={{ fontSize: '.82rem', fontWeight: 600 }}>
                  Categorie
                  <select
                    className="input"
                    style={{ marginTop: 6 }}
                    value={newCategory}
                    onChange={(e) => setNewCategory(parseThinkCategory(e.target.value))}
                  >
                    <option value="natuur">🌿 Natuur</option>
                    <option value="gezondheid">❤️ Gezondheid</option>
                    <option value="kinderen">👶 Kinderen</option>
                    <option value="dieren">🐾 Dieren</option>
                    <option value="sociaal">🤝 Sociaal</option>
                    <option value="innovatie">🚀 Innovatie</option>
                  </select>
                </label>
                {hintWeekly ? (
                  <div style={{ fontSize: '.82rem', color: '#92400e' }}>{hintWeekly}</div>
                ) : null}
                <div>
                  <button
                    type="button"
                    className="btn btn-dark btn-sm"
                    onClick={() => void submitIdea()}
                    disabled={Boolean(!useLive && hintWeekly)}
                  >
                    Idee plaatsen
                  </button>
                </div>
              </div>
            )}
          </div>

          {msg ? (
            <div style={{ marginBottom: 18, fontSize: '.9rem', color: msg.ok ? '#166534' : '#991b1b', fontWeight: 600 }}>
              {msg.text}
            </div>
          ) : null}

          <div
            style={{
              background: 'linear-gradient(135deg,#1a237e,#3a98f8)',
              borderRadius: 20,
              padding: 36,
              textAlign: 'center',
              color: '#fff',
              marginTop: 16,
            }}
          >
            <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>💡</div>
            <h3 style={{ fontFamily: 'Fraunces,serif', fontSize: '1.4rem', fontWeight: 900, marginBottom: 8 }}>Jouw idee kan het volgende project worden</h3>
            <p style={{ fontSize: '0.9rem', opacity: 0.85, marginBottom: 20, maxWidth: 440, marginLeft: 'auto', marginRight: 'auto' }}>
              Log in, dien je idee in en verdien punten. De community stemt — klik nogmaals op de knop om je stem in te trekken.
            </p>
            <Link to="/auth" className="btn btn-lg" style={{ background: '#fff', color: '#1a237e', fontWeight: 800, border: 'none' }}>
              Gratis aanmelden →
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}
