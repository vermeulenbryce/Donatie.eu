import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLegacyUiSession } from '../../context/LegacyUiSessionContext'
import { appendDonationToDnlAccounts, readDnlAccounts } from '../../features/account/legacyDashboardModel'
import { DEMO_PROJECTS } from '../../features/public/demoPublicData'
import {
  dnlProjectsUpdatedEvent,
  readLegacyProjects,
  writeLegacyProjects,
  type LegacyStoredProject,
} from '../../features/public/legacyStorage'
import { ProjectImagePicker } from '../../components/public/ProjectImagePicker'
import { ProjectBanner } from '../../components/public/ProjectBanner'
import {
  fetchMyCommunityProjects,
  type MyCommunityProject,
} from '../../features/community/communityProjectsService'
import { charityLabelFromCauseKey, communityProjectShareUrl } from '../../features/community/communityProjectsService'
import { fetchPublicProjectsForRanklist } from '../../features/public/liveLeaderboardService'
import { isSupabaseConfigured } from '../../lib/supabase'
import { Link, useSearchParams } from 'react-router-dom'

type Section = 'browse' | 'create'

type BrowseCard = {
  id: string
  title: string
  category: string
  raised: number
  goal: number
  ownerEmail?: string
  desc: string
  deadline: string
  imageUrl: string | null
  banner: string
  fromSupabase: boolean
  ownerUserId?: string | null
  donors?: number
}

function mapDbProjectToBrowse(row: Record<string, unknown>): BrowseCard | null {
  const vis = row.visibility
  if (vis === 'members_only') return null
  const st = String(row.status ?? '').toLowerCase()
  if (st === 'verlopen' || st === 'cancelled' || st === 'draft') return null
  const charityKey = typeof row.charity_cause_key === 'string' ? row.charity_cause_key : ''
  const category = charityLabelFromCauseKey(charityKey || null) || 'Overig'
  const title = String(row.name ?? row.title ?? 'Project').trim()
  const goal = Math.max(50, Number(row.target_amount ?? row.goal ?? 0))
  const raised = Math.max(0, Number(row.raised_amount ?? row.amount_raised ?? row.raised ?? 0))
  const donors = Math.max(0, Number(row.donor_count ?? row.donors ?? 0))
  return {
    id: String(row.id),
    title,
    category,
    raised,
    goal,
    ownerEmail: typeof row.owner_email === 'string' ? row.owner_email : undefined,
    desc: typeof row.description === 'string' ? row.description : '',
    deadline: '',
    imageUrl: typeof row.image_url === 'string' ? row.image_url : null,
    banner: 'linear-gradient(135deg,#3a98f8,#6d28d9)',
    fromSupabase: true,
    ownerUserId: typeof row.owner_id === 'string' ? row.owner_id : null,
    donors,
  }
}

export function StartProjectPage() {
  const { shell } = useLegacyUiSession()
  const [searchParams, setSearchParams] = useSearchParams()
  const [section, setSection] = useState<Section>('browse')
  const [q, setQ] = useState('')
  const [browseCat, setBrowseCat] = useState('')
  const [formCat, setFormCat] = useState('Overig')
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [goal, setGoal] = useState('')
  const [deadline, setDeadline] = useState('')
  const [image, setImage] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const [formMsg, setFormMsg] = useState<string | null>(null)
  const [communityProjects, setCommunityProjects] = useState<MyCommunityProject[]>([])
  const [publicProjectRows, setPublicProjectRows] = useState<Record<string, unknown>[] | null>(null)

  useEffect(() => {
    const raw = searchParams.get('edit')?.trim()
    if (!raw || !shell?.email) return
    const rows = readLegacyProjects()
    const row = rows.find((r) => r.id === raw)

    function stripEditQuery() {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete('edit')
          return next
        },
        { replace: true },
      )
    }

    if (!row) {
      setFormMsg('Project niet gevonden.')
      stripEditQuery()
      return
    }

    const owner = (row.ownerEmail || '').toLowerCase()
    if (owner && shell.email.toLowerCase() !== owner) {
      setFormMsg('Dit project hoort niet bij jouw account.')
      stripEditQuery()
      return
    }

    setEditingId(raw)
    setName(row.title || row.name || '')
    setDesc(row.desc || '')
    setFormCat(row.category || 'Overig')
    setGoal(String(Number(row.goal ?? 0) || ''))
    setDeadline(row.deadline || '')
    setImage(typeof row.imageUrl === 'string' ? row.imageUrl : null)
    setSection('create')
    stripEditQuery()
  }, [searchParams, setSearchParams, shell?.email])

  const browseSupabaseCards = useMemo(() => {
    if (!isSupabaseConfigured || publicProjectRows === null) return []
    return publicProjectRows.map(mapDbProjectToBrowse).filter((x): x is BrowseCard => x !== null)
  }, [publicProjectRows])

  const projects = useMemo((): BrowseCard[] => {
    if (isSupabaseConfigured) {
      let list = browseSupabaseCards
      if (browseCat) list = list.filter((p) => p.category === browseCat)
      if (q.trim()) list = list.filter((p) => p.title.toLowerCase().includes(q.trim().toLowerCase()))
      return list
    }
    void tick
    const localRows: BrowseCard[] = readLegacyProjects()
      .map((p) => ({
        id: p.id,
        title: p.title || p.name || 'Project',
        category: p.category || 'Overig',
        raised: Number(p.raised) || 0,
        goal: Number(p.goal) || 1,
        ownerEmail: p.ownerEmail,
        desc: p.desc || '',
        deadline: p.deadline || '',
        imageUrl: p.imageUrl || null,
        banner: 'linear-gradient(135deg,#3a98f8,#6d28d9)',
        fromSupabase: false,
        donors: Number(p.donors) || 0,
      }))
      .sort((a, b) => b.raised - a.raised)
    const demoRows: BrowseCard[] = DEMO_PROJECTS.filter((d) => !localRows.some((l) => l.id === d.id)).map((d) => ({
      ...d,
      ownerEmail: '',
      desc: '',
      deadline: '',
      imageUrl: null as string | null,
      banner: d.banner || 'linear-gradient(135deg,#3a98f8,#6d28d9)',
      fromSupabase: false,
      donors: 0,
    }))
    let list = [...localRows, ...demoRows]
    if (browseCat) list = list.filter((p) => p.category === browseCat)
    if (q.trim()) list = list.filter((p) => p.title.toLowerCase().includes(q.trim().toLowerCase()))
    return list
  }, [browseCat, browseSupabaseCards, isSupabaseConfigured, q, tick])

  const stats = useMemo(() => {
    if (isSupabaseConfigured) {
      if (publicProjectRows === null) {
        return { projectCount: 0, raisedTotal: 0, donorTotal: 0 }
      }
      const cards = browseSupabaseCards
      const projectCount = cards.length
      const raisedTotal = cards.reduce((sum, p) => sum + (Number(p.raised) || 0), 0)
      const donorTotal = cards.reduce((sum, p) => sum + (Number(p.donors) || 0), 0)
      return {
        projectCount,
        raisedTotal,
        donorTotal,
      }
    }
    void tick
    const all = readLegacyProjects()
    const demoList = DEMO_PROJECTS.filter((d) => !all.some((l) => l.id === d.id))
    const demoRaised = demoList.reduce((s, d) => s + (Number(d.raised) || 0), 0)
    const projectCount = all.length + demoList.length
    const raisedTotal = all.reduce((sum, p) => sum + (Number(p.raised) || 0), 0) + demoRaised
    const donorTotal = all.reduce((sum, p) => sum + (Number(p.donors) || 0), 0)
    return {
      projectCount,
      raisedTotal,
      donorTotal,
    }
  }, [browseSupabaseCards, isSupabaseConfigured, publicProjectRows, tick])

  useEffect(() => {
    const bump = () => setTick((n) => n + 1)
    window.addEventListener('storage', bump)
    window.addEventListener(dnlProjectsUpdatedEvent, bump)
    return () => {
      window.removeEventListener('storage', bump)
      window.removeEventListener(dnlProjectsUpdatedEvent, bump)
    }
  }, [])

  const loadCommunityProjects = useCallback(async () => {
    if (!shell?.user?.id || !isSupabaseConfigured) {
      setCommunityProjects([])
      return
    }
    try {
      const rows = await fetchMyCommunityProjects()
      setCommunityProjects(rows)
    } catch {
      setCommunityProjects([])
    }
  }, [shell?.user?.id])

  useEffect(() => {
    void loadCommunityProjects()
  }, [loadCommunityProjects])

  const loadPublicBrowse = useCallback(async () => {
    if (!isSupabaseConfigured) return
    try {
      const raw = await fetchPublicProjectsForRanklist(300)
      setPublicProjectRows(raw)
    } catch {
      setPublicProjectRows([])
    }
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured) return
    void loadPublicBrowse()
    const id = window.setInterval(() => void loadPublicBrowse(), 30_000)
    const onVis = () => {
      if (document.visibilityState === 'visible') void loadPublicBrowse()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [loadPublicBrowse])

  useEffect(() => {
    if (!isSupabaseConfigured) return
    const t = window.setTimeout(() => void loadPublicBrowse(), 450)
    return () => window.clearTimeout(t)
  }, [loadPublicBrowse, shell?.points, shell?.totalDonated])

  const groupedCommunityProjects = useMemo(() => {
    const byCommunity = new Map<string, { name: string; kind: MyCommunityProject['community_kind']; items: MyCommunityProject[] }>()
    for (const p of communityProjects) {
      const g = byCommunity.get(p.community_id)
      if (g) {
        g.items.push(p)
      } else {
        byCommunity.set(p.community_id, { name: p.community_name, kind: p.community_kind, items: [p] })
      }
    }
    return Array.from(byCommunity.entries()).map(([id, v]) => ({ id, ...v }))
  }, [communityProjects])

  const pct = (raised: number, goal: number) => Math.min(100, Math.round((raised / goal) * 100))

  function saveProject() {
    const title = name.trim()
    const goalNum = Number(goal)
    if (!title || !goalNum || goalNum < 50) {
      setFormMsg('Vul minimaal een projectnaam en doelbedrag (>= €50) in.')
      return
    }
    const rows = readLegacyProjects()
    if (editingId) {
      const idx = rows.findIndex((r) => r.id === editingId)
      if (idx >= 0) {
        rows[idx] = {
          ...rows[idx],
          title,
          name: title,
          goal: goalNum,
          category: formCat || rows[idx].category || 'Overig',
          desc: desc.trim() || undefined,
          deadline: deadline || undefined,
          imageUrl: image || undefined,
        }
        writeLegacyProjects(rows)
        setFormMsg('Project bijgewerkt en direct live zichtbaar.')
      }
    } else {
      const now = new Date().toISOString()
      const row: LegacyStoredProject = {
        id: `p-${Date.now()}`,
        title,
        name: title,
        raised: 0,
        goal: goalNum,
        donors: 0,
        ownerEmail: shell?.email || undefined,
        category: formCat || 'Overig',
        desc: desc.trim() || undefined,
        deadline: deadline || undefined,
        imageUrl: image || undefined,
        createdAt: now,
      }
      writeLegacyProjects([row, ...rows])
      setFormMsg('Project opgeslagen en live toegevoegd aan de ranglijst-tab Projecten.')
    }
    setSection('browse')
    setEditingId(null)
    setName('')
    setDesc('')
    setGoal('')
    setDeadline('')
    setImage(null)
    setFormCat('Overig')
    setTick((n) => n + 1)
  }

  function deleteProject(projectId: string) {
    const ok = window.confirm('Weet je zeker dat je dit project wilt verwijderen?')
    if (!ok) return
    const rows = readLegacyProjects().filter((r) => r.id !== projectId)
    writeLegacyProjects(rows)
    if (editingId === projectId) {
      setEditingId(null)
      setName('')
      setDesc('')
      setGoal('')
      setDeadline('')
    }
    setFormMsg('Project verwijderd.')
    setTick((n) => n + 1)
  }

  function supportProject(p: BrowseCard) {
    if (p.fromSupabase) return
    if (!shell?.email) {
      setFormMsg('Log in om een project te steunen.')
      return
    }
    const raw = window.prompt(`Bedrag om te doneren aan "${p.title}" (EUR)`, '10')
    if (!raw) return
    const amount = Number(raw.replace(',', '.'))
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormMsg('Voer een geldig bedrag in.')
      return
    }

    const rows = readLegacyProjects()
    const idx = rows.findIndex((r) => r.id === p.id)
    if (idx >= 0) {
      rows[idx] = {
        ...rows[idx],
        raised: (Number(rows[idx].raised) || 0) + amount,
        donors: (Number(rows[idx].donors) || 0) + 1,
        title: rows[idx].title || p.title,
        name: rows[idx].name || p.title,
        category: rows[idx].category || p.category,
        goal: Number(rows[idx].goal) || p.goal,
      }
    } else {
      rows.unshift({
        id: p.id,
        title: p.title,
        name: p.title,
        raised: p.raised + amount,
        goal: p.goal,
        donors: 1,
        category: p.category,
        createdAt: new Date().toISOString(),
      })
    }
    writeLegacyProjects(rows)

    const acc = readDnlAccounts()[shell.email] || {}
    const pts = Math.round(amount * 0.5)
    const currentPoints = Number(acc.points ?? shell.points ?? 0)
    const currentTotal = Number(acc.totalDonated ?? shell.totalDonated ?? 0)
    appendDonationToDnlAccounts(
      shell.email,
      {
        cause: p.title,
        org: 'Projectdonatie',
        amount,
        pts,
        monthly: false,
        date: new Date().toLocaleDateString('nl-NL'),
      },
      {
        points: currentPoints + pts,
        totalDonated: currentTotal + amount,
        firstName: shell.firstName,
        lastName: shell.lastName,
        anonymous: shell.anonymous,
      },
    )
    setFormMsg(`Donatie van EUR ${amount.toFixed(2)} verwerkt voor "${p.title}" (+${pts} punten).`)
    setTick((n) => n + 1)
  }

  return (
    <main role="main" id="mainContent">
      <div className="sp-hero">
        <div className="container" style={{ position: 'relative' }}>
          <div className="sp-badge">Start project</div>
          <h1
            style={{
              fontFamily: 'Fraunces,serif',
              fontSize: 'clamp(2.2rem, 5vw, 3.5rem)',
              fontWeight: 900,
              lineHeight: 1.05,
              letterSpacing: '-0.025em',
              marginBottom: 16,
            }}
          >
            Start jouw eigen
            <br />
            donatie-challenge
          </h1>
          <p style={{ fontSize: '1.05rem', color: 'rgba(255,255,255,.68)', maxWidth: 530, margin: '0 auto 36px', lineHeight: 1.65 }}>
            Kies een doel, stel een doelbedrag in en deel je project. Vrienden, familie en vreemden kunnen direct bijdragen — elke euro
            telt.
          </p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              style={{
                background: '#fff',
                color: 'var(--blue)',
                border: 'none',
                borderRadius: 50,
                padding: '14px 32px',
                fontSize: '0.97rem',
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 4px 24px rgba(0,0,0,.15)',
              }}
              onClick={() => setSection('create')}
            >
              ✏️ Maak een project
            </button>
            <button
              type="button"
              style={{
                background: 'rgba(255,255,255,.15)',
                color: '#fff',
                border: '1.5px solid rgba(255,255,255,.4)',
                borderRadius: 50,
                padding: '14px 32px',
                fontSize: '0.97rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
              onClick={() => setSection('browse')}
            >
              🔍 Bekijk projecten
            </button>
          </div>
          <div style={{ display: 'flex', gap: 40, justifyContent: 'center', marginTop: 52, flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'Fraunces,serif', fontSize: '1.8rem', fontWeight: 900, color: '#fff' }}>
                {stats.projectCount.toLocaleString('nl-NL')}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,.5)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Actieve projecten
              </div>
            </div>
            <div style={{ width: 1, background: 'rgba(255,255,255,.1)' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'Fraunces,serif', fontSize: '1.8rem', fontWeight: 900, color: '#fff' }}>
                €{stats.raisedTotal.toLocaleString('nl-NL')}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,.5)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Totaal opgehaald
              </div>
            </div>
            <div style={{ width: 1, background: 'rgba(255,255,255,.1)' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'Fraunces,serif', fontSize: '1.8rem', fontWeight: 900, color: '#fff' }}>
                {stats.donorTotal.toLocaleString('nl-NL')}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,.5)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Donateurs
              </div>
            </div>
          </div>
        </div>
      </div>

      {section === 'browse' ? (
        <div style={{ background: '#f8fafc', padding: '64px 0' }}>
          <div className="container">
            {groupedCommunityProjects.length > 0 ? (
              <section
                style={{
                  background: 'linear-gradient(135deg,#eef2ff,#e0e7ff)',
                  border: '1.5px solid #c7d2fe',
                  borderRadius: 18,
                  padding: 22,
                  marginBottom: 32,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    flexWrap: 'wrap',
                    marginBottom: 14,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: '.72rem',
                        fontWeight: 800,
                        letterSpacing: '.1em',
                        color: '#4338ca',
                      }}
                    >
                      JOUW COMMUNITIES
                    </div>
                    <h2
                      style={{
                        fontFamily: 'Fraunces,serif',
                        fontSize: '1.4rem',
                        fontWeight: 900,
                        color: '#1e1b4b',
                        margin: '4px 0 0',
                      }}
                    >
                      Community projecten
                    </h2>
                    <p style={{ fontSize: '.86rem', color: '#4338ca', margin: '4px 0 0' }}>
                      Actieve projecten van communities waar jij lid van bent. Alleen zichtbaar voor jou en andere leden.
                    </p>
                  </div>
                  <Link
                    to="/communities"
                    style={{
                      fontSize: '.82rem',
                      fontWeight: 700,
                      color: '#4338ca',
                      textDecoration: 'none',
                      padding: '8px 14px',
                      border: '1.5px solid #c7d2fe',
                      borderRadius: 999,
                      background: '#fff',
                    }}
                  >
                    Bekijk alle communities →
                  </Link>
                </div>

                {groupedCommunityProjects.map((g) => (
                  <div key={g.id} style={{ marginBottom: 18 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginBottom: 10,
                      }}
                    >
                      <span style={{ fontSize: '1.1rem' }}>{g.kind === 'bedrijf' ? '🏢' : '⭐'}</span>
                      <div style={{ fontWeight: 800, color: '#1e1b4b' }}>{g.name}</div>
                      <span
                        style={{
                          fontSize: '.7rem',
                          fontWeight: 800,
                          background: '#fff',
                          color: '#4338ca',
                          padding: '2px 8px',
                          borderRadius: 999,
                        }}
                      >
                        {g.items.length} {g.items.length === 1 ? 'project' : 'projecten'}
                      </span>
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gap: 12,
                        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                      }}
                    >
                      {g.items.map((cp) => (
                        <article
                          key={cp.id}
                          style={{
                            border: '1.5px solid #c7d2fe',
                            borderRadius: 14,
                            overflow: 'hidden',
                            background: '#fff',
                            display: 'flex',
                            flexDirection: 'column',
                          }}
                        >
                          <ProjectBanner imageUrl={cp.image_url} height={130}>
                            <span
                              style={{
                                fontSize: '.7rem',
                                fontWeight: 800,
                                padding: '4px 10px',
                                borderRadius: 999,
                                background: cp.image_url ? 'rgba(255,255,255,.92)' : '#fff',
                                color: '#0f172a',
                              }}
                            >
                              {cp.visibility === 'members_only' ? '🔒 Alleen community' : '🌍 Publiek'}
                            </span>
                          </ProjectBanner>
                          <div
                            style={{
                              padding: 14,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 6,
                              flex: 1,
                            }}
                          >
                            <div style={{ fontWeight: 800, color: '#1e1b4b' }}>{cp.title}</div>
                            <div style={{ fontSize: '.78rem', color: '#64748b' }}>
                              {charityLabelFromCauseKey(cp.charity_cause_key)} · doel €
                              {Number(cp.target_amount || 0).toLocaleString('nl-NL')}
                            </div>
                            {cp.description ? (
                              <p
                                style={{
                                  fontSize: '.82rem',
                                  color: '#475569',
                                  margin: 0,
                                  lineHeight: 1.5,
                                }}
                              >
                                {cp.description}
                              </p>
                            ) : null}
                            <a
                              href={communityProjectShareUrl(cp.id)}
                              style={{
                                marginTop: 'auto',
                                display: 'inline-block',
                                padding: '8px 12px',
                                background: 'linear-gradient(135deg,#6c47ff,#4f46e5)',
                                color: '#fff',
                                borderRadius: 10,
                                fontSize: '.82rem',
                                fontWeight: 700,
                                textAlign: 'center',
                                textDecoration: 'none',
                              }}
                            >
                              Bekijk & doneer
                            </a>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            ) : null}

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 220, position: 'relative' }}>
                <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontSize: '1rem' }} aria-hidden>
                  🔍
                </span>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Zoek een project…"
                  aria-label="Zoek een project"
                  style={{
                    width: '100%',
                    padding: '11px 14px 11px 40px',
                    border: '1.5px solid #e2e8f0',
                    borderRadius: 12,
                    fontSize: '0.88rem',
                    fontFamily: 'Outfit,sans-serif',
                    background: '#fff',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <select
                value={browseCat}
                onChange={(e) => setBrowseCat(e.target.value)}
                style={{
                  padding: '11px 16px',
                  border: '1.5px solid #e2e8f0',
                  borderRadius: 12,
                  fontSize: '0.85rem',
                  fontFamily: 'Outfit,sans-serif',
                  background: '#fff',
                  cursor: 'pointer',
                }}
              >
                <option value="">Alle categorieën</option>
                <option value="Natuur">🌿 Natuur</option>
                <option value="Kinderen">👧 Kinderen</option>
                <option value="Gezondheid">❤️ Gezondheid</option>
                <option value="Dieren">🐾 Dieren</option>
              </select>
              <button
                type="button"
                onClick={() => setSection('create')}
                style={{
                  background: 'linear-gradient(135deg,#7c3aed,#6d28d9)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 12,
                  padding: '11px 22px',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                + Nieuw project
              </button>
            </div>

            {projects.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: '#9ca3af' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🔍</div>
                <div style={{ fontSize: '1rem', fontWeight: 600 }}>Geen projecten gevonden</div>
              </div>
            ) : (
              <div className="sp-projects-grid">
                {projects.map((p) => {
                  const pcent = pct(p.raised, p.goal)
                  const isOwner = p.fromSupabase
                    ? !!(shell?.user?.id && p.ownerUserId && shell.user.id === p.ownerUserId)
                    : !!shell?.email && (p.ownerEmail || '').toLowerCase() === shell.email.toLowerCase()
                  return (
                    <article key={p.id} className="sp-card">
                      <ProjectBanner imageUrl={p.imageUrl} fallbackGradient={p.banner} height={140}>
                        <span
                          style={{
                            fontSize: '.72rem',
                            fontWeight: 800,
                            padding: '4px 10px',
                            borderRadius: 999,
                            background: p.imageUrl ? 'rgba(255,255,255,.92)' : '#fef3c7',
                            color: '#1a1a2e',
                          }}
                        >
                          {p.category}
                        </span>
                      </ProjectBanner>
                      <div className="sp-card-body">
                        <h3 style={{ fontFamily: 'Fraunces,serif', fontSize: '1.1rem', fontWeight: 800, margin: '0 0 8px' }}>{p.title}</h3>
                        <div style={{ fontSize: '0.82rem', color: '#6b7280' }}>
                          €{p.raised.toLocaleString('nl-NL')} van €{p.goal.toLocaleString('nl-NL')}
                        </div>
                        <div className="sp-progress-bar-bg">
                          <div className="sp-progress-bar-fill" style={{ width: `${pcent}%`, background: 'var(--blue)' }} />
                        </div>
                        {p.fromSupabase ? (
                          <Link
                            to={`/community-project/${p.id}`}
                            className="btn btn-blue btn-sm"
                            style={{ marginTop: 14, width: '100%', justifyContent: 'center', display: 'inline-flex' }}
                          >
                            Steun dit project
                          </Link>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-blue btn-sm"
                            style={{ marginTop: 14, width: '100%', justifyContent: 'center' }}
                            onClick={() => supportProject(p)}
                          >
                            Steun dit project
                          </button>
                        )}
                        {!p.fromSupabase && isOwner ? (
                          <>
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              style={{ marginTop: 8, width: '100%', justifyContent: 'center' }}
                              onClick={() => {
                                setEditingId(p.id)
                                setName(p.title)
                                setDesc(p.desc || '')
                                setFormCat(p.category || 'Overig')
                                setGoal(String(p.goal))
                                setDeadline(p.deadline || '')
                                setImage(p.imageUrl || null)
                                setSection('create')
                              }}
                            >
                              ✏️ Bewerk project
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm"
                              style={{ marginTop: 8, width: '100%', justifyContent: 'center', background: '#fff', color: '#dc2626', border: '1.5px solid #fca5a5' }}
                              onClick={() => deleteProject(p.id)}
                            >
                              🗑️ Verwijder project
                            </button>
                          </>
                        ) : null}
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ background: '#f8fafc', padding: '64px 0' }}>
          <div className="container">
            <div style={{ textAlign: 'center', marginBottom: 40 }}>
              <h2 style={{ fontFamily: 'Fraunces,serif', fontSize: 'clamp(1.5rem, 2.5vw, 2.1rem)', fontWeight: 900, color: '#0f172a', marginBottom: 8 }}>
                {editingId ? 'Bewerk jouw project' : 'Maak jouw project'}
              </h2>
              <p style={{ color: '#6b7280', fontSize: '0.93rem' }}>
                {editingId ? 'Werk je details bij en publiceer direct opnieuw.' : 'Vul de details in — je project is binnen 2 minuten live.'}
              </p>
            </div>
            <div className="sp-create-grid">
              <div className="sp-form-card">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 14, borderBottom: '1.5px solid #f1f5f9' }}>
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        background: 'linear-gradient(135deg,#7c3aed,#6d28d9)',
                        borderRadius: 8,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        fontSize: '0.85rem',
                        fontWeight: 800,
                      }}
                    >
                      1
                    </div>
                    <span style={{ fontFamily: 'Fraunces,serif', fontSize: '1rem', fontWeight: 900, color: '#0f172a' }}>Basisinformatie</span>
                  </div>
                  <div className="sp-field">
                    <label htmlFor="sp-name">Projectnaam *</label>
                    <input id="sp-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Bijv. 'Marathon voor het dierenasiel'" />
                  </div>
                  <div className="sp-field">
                    <label htmlFor="sp-desc">Beschrijving *</label>
                    <textarea id="sp-desc" rows={4} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Vertel waarom dit project belangrijk is…" />
                  </div>
                  <div className="sp-field">
                    <label htmlFor="sp-cat">Categorie *</label>
                    <select id="sp-cat" value={formCat} onChange={(e) => setFormCat(e.target.value)}>
                      <option value="Overig">Overig</option>
                      <option value="Natuur">🌿 Natuur</option>
                      <option value="Kinderen">👧 Kinderen</option>
                      <option value="Gezondheid">❤️ Gezondheid</option>
                      <option value="Dieren">🐾 Dieren</option>
                    </select>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div className="sp-field">
                      <label htmlFor="sp-goal">Doelbedrag (€) *</label>
                      <input id="sp-goal" type="number" min={50} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="1000" />
                    </div>
                    <div className="sp-field">
                      <label htmlFor="sp-deadline">Einddatum *</label>
                      <input id="sp-deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
                    </div>
                  </div>
                  <div className="sp-field">
                    <label>Projectfoto (optioneel)</label>
                    <ProjectImagePicker value={image} onChange={setImage} label="Upload een beeld voor je project" />
                  </div>
                  <button type="button" className="btn btn-dark" style={{ justifyContent: 'center', marginTop: 8 }} onClick={saveProject}>
                    Opslaan & publiceren →
                  </button>
                  {formMsg ? <div style={{ fontSize: '0.8rem', color: '#166534' }}>{formMsg}</div> : null}
                  <button type="button" className="btn btn-outline" style={{ justifyContent: 'center' }} onClick={() => setSection('browse')}>
                    ← Terug naar overzicht
                  </button>
                </div>
              </div>
              <div className="sp-card" style={{ position: 'sticky', top: 'calc(var(--nav-h) + 16px)' }}>
                <ProjectBanner
                  imageUrl={image}
                  fallbackGradient="linear-gradient(135deg,var(--blue-light),#eef2ff)"
                  height={120}
                >
                  <span
                    style={{
                      fontSize: '.72rem',
                      fontWeight: 800,
                      padding: '4px 10px',
                      borderRadius: 999,
                      background: image ? 'rgba(255,255,255,.92)' : '#dbeafe',
                      color: '#1e3a8a',
                    }}
                  >
                    Live preview
                  </span>
                </ProjectBanner>
                <div className="sp-card-body">
                  <h3 style={{ fontFamily: 'Fraunces,serif', fontSize: '1.05rem', fontWeight: 800, margin: '0 0 8px' }}>
                    {name || 'Jouw projectnaam'}
                  </h3>
                  <p style={{ fontSize: '0.84rem', color: '#6b7280', lineHeight: 1.6, margin: 0 }}>
                    {desc || 'Hier verschijnt je beschrijving zodra je begint te typen.'}
                  </p>
                  <div style={{ marginTop: 12, fontSize: '0.8rem', color: '#64748b' }}>
                    Doel: {goal ? `€${Number(goal).toLocaleString('nl-NL')}` : '—'} · Deadline: {deadline || '—'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
