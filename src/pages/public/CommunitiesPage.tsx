import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLegacyUiSession } from '../../context/LegacyUiSessionContext'
import {
  communityProjectShareUrl,
  createCommunityProject,
  ensureOwnedCommunity,
  fetchMyMembershipCommunities,
  fetchOwnedCommunity,
  fetchProjectsForCommunity,
  updateProjectStatusForOwner,
  type CommunityMembershipRow,
  type CommunityRow,
} from '../../features/community/communityProjectsService'
import { CBF_CAUSES } from '../../features/legacy/cbfCauses.generated'
import {
  causeKeyFromCbfId,
  charityLabelFromCauseKey,
} from '../../features/community/communityProjectsService'
import type { Project } from '../../types/domain'
import { isSupabaseConfigured } from '../../lib/supabase'
import {
  CommunityFeedPanel,
  CommunityMembersPanel,
  CommunityRedemptionsPanel,
  CommunityShopManagerPanel,
  CommunityShopViewPanel,
} from './CommunityPanels'
import { ProjectSharePanel } from '../../components/public/ProjectSharePanel'
import { ProjectImagePicker } from '../../components/public/ProjectImagePicker'
import { ProjectBanner } from '../../components/public/ProjectBanner'
import { updateProjectImage } from '../../features/community/communityProjectsService'
import { getPublicProfileInfo } from '../../features/profile/profileImageService'

type ViewMode = 'owner' | 'member'

type TabId =
  | 'overzicht'
  | 'activiteit'
  | 'leden'
  | 'shop'
  | 'inwisselingen'

type CommunityContext = {
  view: ViewMode
  /** Eigenaar-context bevat dezelfde velden als een membership (dus role = 'owner'). */
  community: CommunityMembershipRow
}

function CopyBtn({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="btn btn-outline btn-sm"
      style={{ padding: '6px 12px', fontSize: '.78rem', fontWeight: 700, whiteSpace: 'nowrap' }}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1800)
        } catch {
          /* ignore */
        }
      }}
    >
      {copied ? 'Gekopieerd ✓' : label}
    </button>
  )
}

function isActive(p: Project): boolean {
  const s = String(p.status || '').toLowerCase()
  return s === 'actief' || s === 'active'
}
function isCompleted(p: Project): boolean {
  const s = String(p.status || '').toLowerCase()
  return s === 'verlopen' || s === 'cancelled'
}

export function CommunitiesPage() {
  const { shell, refreshSession } = useLegacyUiSession()
  const navigate = useNavigate()

  const [ownerCommunity, setOwnerCommunity] = useState<CommunityRow | null>(null)
  const [memberships, setMemberships] = useState<CommunityMembershipRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [tab, setTab] = useState<TabId>('overzicht')
  const [ownerAvatars, setOwnerAvatars] = useState<Record<string, string | null>>({})

  const isOwnerAccount = shell?.user?.type === 'bedrijf' || shell?.user?.type === 'influencer'
  const ownerKind: 'bedrijf' | 'influencer' | undefined =
    shell?.user?.type === 'bedrijf' ? 'bedrijf' : shell?.user?.type === 'influencer' ? 'influencer' : undefined

  const refresh = useCallback(async () => {
    if (!shell?.user?.id) {
      setOwnerCommunity(null)
      setMemberships([])
      setLoading(false)
      return
    }
    setLoading(true)
    setErr(null)
    try {
      const [owned, member] = await Promise.all([
        isOwnerAccount ? fetchOwnedCommunity(shell.user.id, ownerKind) : Promise.resolve(null),
        fetchMyMembershipCommunities(),
      ])
      setOwnerCommunity(owned)
      setMemberships(member)
      // Default selectie: eigen community, anders eerste lidmaatschap
      setSelectedId((prev) => {
        if (prev) return prev
        if (owned) return owned.id
        if (member.length > 0) return member[0].id
        return null
      })

      // Haal owner-avatars op voor alle communities die we zien
      const ownerIds: string[] = []
      if (owned) ownerIds.push(owned.owner_user_id)
      for (const m of member) if (m.owner_user_id) ownerIds.push(m.owner_user_id)
      if (ownerIds.length > 0) {
        const info = await getPublicProfileInfo(ownerIds)
        const next: Record<string, string | null> = {}
        for (const p of info) next[p.id] = p.avatar_url
        setOwnerAvatars(next)
      } else {
        setOwnerAvatars({})
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Kon community-data niet laden.')
    } finally {
      setLoading(false)
    }
  }, [shell?.user?.id, isOwnerAccount, ownerKind])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const activeContext: CommunityContext | null = useMemo(() => {
    if (!selectedId) return null
    if (ownerCommunity && ownerCommunity.id === selectedId) {
      return {
        view: 'owner',
        community: { ...ownerCommunity, role: 'owner' },
      }
    }
    const m = memberships.find((x) => x.id === selectedId)
    if (!m) return null
    return { view: m.role === 'owner' ? 'owner' : 'member', community: m }
  }, [selectedId, ownerCommunity, memberships])

  // Beschikbare communities = eigen community + overige lidmaatschappen (geen duplicate)
  const allCommunities = useMemo(() => {
    const list: CommunityMembershipRow[] = []
    if (ownerCommunity) {
      list.push({ ...ownerCommunity, role: 'owner' })
    }
    for (const m of memberships) {
      if (!list.some((x) => x.id === m.id)) list.push(m)
    }
    return list
  }, [ownerCommunity, memberships])

  async function onCreateCommunity() {
    if (!shell) return
    setCreating(true)
    setErr(null)
    try {
      const comm = await ensureOwnedCommunity(shell.displayName)
      if (!comm) {
        setErr('Community aanmaken mislukt.')
        return
      }
      setOwnerCommunity(comm)
      setSelectedId(comm.id)
      await refreshSession?.()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Community aanmaken mislukt.')
    } finally {
      setCreating(false)
    }
  }

  if (!shell) {
    return (
      <main className="page" style={{ padding: '48px 0' }}>
        <div className="container" style={{ textAlign: 'center' }}>
          <p style={{ color: '#6b7280' }}>Je bent niet ingelogd.</p>
          <Link to="/auth" className="btn btn-dark" style={{ marginTop: 16, display: 'inline-block' }}>
            Naar inloggen
          </Link>
        </div>
      </main>
    )
  }

  if (!isSupabaseConfigured) {
    return (
      <main className="page" style={{ padding: '48px 0' }}>
        <div className="container">
          <p style={{ color: '#6b7280' }}>Supabase is niet geconfigureerd.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="page" style={{ padding: '32px 0 64px', background: '#f8fafc', minHeight: 'calc(100vh - 200px)' }}>
      <div className="container">
        {/* Header-banner */}
        <div
          style={{
            background: 'linear-gradient(135deg,#1a237e,#3a98f8)',
            borderRadius: 20,
            padding: '26px 28px',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            flexWrap: 'wrap',
            marginBottom: 22,
            boxShadow: '0 10px 30px rgba(26,35,126,.15)',
          }}
        >
          <div style={{ fontSize: '2.4rem' }}>👥</div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 900 }}>Communities</h1>
            <p style={{ margin: '4px 0 0', fontSize: '.9rem', color: 'rgba(255,255,255,.86)' }}>
              Beheer je eigen community of bekijk communities waar je lid van bent. Jouw community-punten: {' '}
              <strong>{(shell.communityPoints ?? 0).toLocaleString('nl-NL')}</strong>
            </p>
          </div>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => navigate('/account')}
            style={{
              background: 'rgba(255,255,255,.18)',
              color: '#fff',
              border: '1.5px solid rgba(255,255,255,.4)',
              fontWeight: 700,
            }}
          >
            Terug naar dashboard
          </button>
        </div>

        {err ? (
          <div
            style={{
              background: '#fef2f2',
              border: '1.5px solid #fecaca',
              color: '#991b1b',
              borderRadius: 12,
              padding: '10px 14px',
              marginBottom: 14,
              fontSize: '.88rem',
            }}
          >
            {err}
          </div>
        ) : null}

        {loading ? (
          <p style={{ color: '#6b7280' }}>Laden…</p>
        ) : allCommunities.length === 0 ? (
          isOwnerAccount ? (
            <div
              style={{
                background: 'linear-gradient(135deg,#ecfeff,#cffafe)',
                border: '1.5px solid #a5f3fc',
                borderRadius: 20,
                padding: 36,
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '2.4rem', marginBottom: 12 }}>🚀</div>
              <h2 style={{ margin: '0 0 6px', color: '#155e75' }}>
                Start je {ownerKind === 'bedrijf' ? 'bedrijfscommunity' : 'influencer-community'}
              </h2>
              <p style={{ color: '#0e7490', fontSize: '.9rem', maxWidth: 520, margin: '0 auto 20px' }}>
                Maak in één klik een community aan. Je krijgt een uitnodigingscode die je kunt delen met leden, en een
                eigen puntenwinkel om ze te belonen.
              </p>
              <button
                type="button"
                className="btn btn-dark"
                disabled={creating}
                onClick={() => void onCreateCommunity()}
                style={{ minWidth: 220 }}
              >
                {creating ? 'Bezig…' : 'Community aanmaken'}
              </button>
            </div>
          ) : (
            <div
              style={{
                background: '#fff',
                border: '1.5px solid #e5e7eb',
                borderRadius: 16,
                padding: 28,
                textAlign: 'center',
                color: '#475569',
              }}
            >
              <div style={{ fontSize: '2rem', marginBottom: 8 }}>✨</div>
              <h2 style={{ margin: '0 0 6px', color: '#0f172a' }}>Nog geen community</h2>
              <p style={{ fontSize: '.9rem', margin: '0 0 14px' }}>
                Vraag een uitnodigingscode van een bedrijf of influencer en sluit je aan via je dashboard.
              </p>
              <Link to="/account?tab=mijn-community" className="btn btn-dark">
                Aansluiten met code
              </Link>
            </div>
          )
        ) : (
          <div
            style={{
              display: 'grid',
              gap: 20,
              gridTemplateColumns: 'minmax(0, 320px) 1fr',
              alignItems: 'start',
            }}
          >
            {/* Sidebar: lijst van communities */}
            <aside
              style={{
                background: '#fff',
                border: '1.5px solid #e5e7eb',
                borderRadius: 16,
                padding: 14,
                position: 'sticky',
                top: 90,
              }}
            >
              <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#64748b', letterSpacing: '.08em', marginBottom: 8 }}>
                JOUW COMMUNITIES
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                {allCommunities.map((c) => {
                  const selected = selectedId === c.id
                  const badgeBg = c.role === 'owner' ? '#fef3c7' : c.role === 'sponsor' ? '#fae8ff' : '#e0f2fe'
                  const badgeColor = c.role === 'owner' ? '#854d0e' : c.role === 'sponsor' ? '#701a75' : '#075985'
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setSelectedId(c.id)
                        setTab('overzicht')
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 12px',
                        background: selected ? 'linear-gradient(135deg,#eef2ff,#e0e7ff)' : '#f8fafc',
                        border: selected ? '1.5px solid #818cf8' : '1px solid #e5e7eb',
                        borderRadius: 12,
                        cursor: 'pointer',
                        textAlign: 'left',
                        width: '100%',
                      }}
                    >
                      <div
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 10,
                          background:
                            c.kind === 'bedrijf'
                              ? 'linear-gradient(135deg,#0f766e,#14b8a6)'
                              : 'linear-gradient(135deg,#7c3aed,#8b5cf6)',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 900,
                          flexShrink: 0,
                          overflow: 'hidden',
                        }}
                      >
                        {ownerAvatars[c.owner_user_id] ? (
                          <img
                            src={ownerAvatars[c.owner_user_id] as string}
                            alt=""
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : c.kind === 'bedrijf' ? (
                          '🏢'
                        ) : (
                          '⭐'
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 800,
                            color: '#0f172a',
                            fontSize: '.92rem',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {c.name}
                        </div>
                        <div style={{ fontSize: '.7rem', color: '#64748b' }}>
                          {c.kind === 'bedrijf' ? 'Bedrijf' : 'Influencer'}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: '.66rem',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          letterSpacing: '.04em',
                          background: badgeBg,
                          color: badgeColor,
                          borderRadius: 999,
                          padding: '3px 8px',
                        }}
                      >
                        {c.role === 'owner' ? 'Eigenaar' : c.role === 'sponsor' ? 'Sponsor' : 'Lid'}
                      </span>
                    </button>
                  )
                })}
              </div>
            </aside>

            {/* Main content */}
            <div>
              {activeContext ? (
                <CommunityDetail
                  context={activeContext}
                  tab={tab}
                  setTab={setTab}
                  shell={shell}
                  ownerAvatarUrl={ownerAvatars[activeContext.community.owner_user_id] ?? null}
                />
              ) : null}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

function CommunityDetail({
  context,
  tab,
  setTab,
  shell,
  ownerAvatarUrl,
}: {
  context: CommunityContext
  tab: TabId
  setTab: (t: TabId) => void
  shell: NonNullable<ReturnType<typeof useLegacyUiSession>['shell']>
  ownerAvatarUrl?: string | null
}) {
  const { community, view } = context
  const isOwner = view === 'owner'
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchProjectsForCommunity(community.id)
      .then((list) => {
        if (!cancelled) setProjects(list)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [community.id])

  const tabs: { id: TabId; label: string; icon: string; ownerOnly?: boolean }[] = [
    { id: 'overzicht', label: 'Overzicht', icon: '📊' },
    { id: 'activiteit', label: 'Activiteit', icon: '📣' },
    { id: 'shop', label: 'Puntenwinkel', icon: '🛍️' },
  ]
  if (isOwner) {
    tabs.splice(2, 0, { id: 'leden', label: 'Leden', icon: '👥' })
    tabs.push({ id: 'inwisselingen', label: 'Inwisselingen', icon: '📦' })
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {/* Community header-card */}
      <div
        style={{
          background: '#fff',
          border: '1.5px solid #e5e7eb',
          borderRadius: 18,
          padding: 22,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 18,
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 16,
            background:
              community.kind === 'bedrijf'
                ? 'linear-gradient(135deg,#0f766e,#14b8a6)'
                : 'linear-gradient(135deg,#7c3aed,#8b5cf6)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '2rem',
            overflow: 'hidden',
            border: '2px solid #fff',
            boxShadow: '0 6px 16px rgba(15,23,42,.1)',
          }}
        >
          {ownerAvatarUrl ? (
            <img src={ownerAvatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : community.kind === 'bedrijf' ? (
            '🏢'
          ) : (
            '⭐'
          )}
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: '.72rem', letterSpacing: '.08em', color: '#2563eb', fontWeight: 800 }}>
            {community.kind === 'bedrijf' ? 'BEDRIJFSCOMMUNITY' : 'INFLUENCER-COMMUNITY'}
          </div>
          <h2 style={{ margin: '4px 0 8px', color: '#0f172a' }}>{community.name}</h2>
          {isOwner ? (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '.78rem', color: '#475569' }}>Uitnodigingscode:</span>
              <code
                style={{
                  background: '#f8fafc',
                  border: '1.5px solid #cbd5e1',
                  borderRadius: 10,
                  padding: '4px 10px',
                  fontSize: '.9rem',
                  fontWeight: 800,
                  letterSpacing: '.1em',
                }}
              >
                {community.join_code}
              </code>
              <CopyBtn value={community.join_code} label="Code kopiëren" />
              <CopyBtn
                value={`${typeof window !== 'undefined' ? window.location.origin : ''}/auth?code=${encodeURIComponent(community.join_code)}`}
                label="Uitnodigingslink kopiëren"
              />
            </div>
          ) : (
            <div style={{ fontSize: '.8rem', color: '#475569' }}>
              Jouw rol: <strong>{community.role === 'sponsor' ? 'Sponsor' : 'Lid'}</strong>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div
        role="tablist"
        style={{
          display: 'flex',
          gap: 6,
          background: '#fff',
          border: '1.5px solid #e5e7eb',
          borderRadius: 14,
          padding: 6,
          overflowX: 'auto',
        }}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            type="button"
            onClick={() => setTab(t.id)}
            style={{
              border: 'none',
              cursor: 'pointer',
              padding: '10px 18px',
              fontWeight: 700,
              fontSize: '.88rem',
              background: tab === t.id ? '#1a237e' : 'transparent',
              color: tab === t.id ? '#fff' : '#334155',
              borderRadius: 10,
              display: 'inline-flex',
              gap: 6,
              alignItems: 'center',
              whiteSpace: 'nowrap',
            }}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'overzicht' ? (
        <>
          <CommunityFeedPanel
            communityId={community.id}
            visible={true}
            currentUserId={shell.user?.id}
            canPost={true}
            isOwner={isOwner}
            limit={5}
            compact
          />
          <OverviewTab
            communityId={community.id}
            isOwner={isOwner}
            projects={projects}
            loading={loading}
            onRefresh={async () => setProjects(await fetchProjectsForCommunity(community.id))}
            shellUserId={shell.user?.id}
          />
        </>
      ) : null}

      {tab === 'activiteit' ? (
        <CommunityFeedPanel
          communityId={community.id}
          visible={true}
          currentUserId={shell.user?.id}
          canPost={true}
          isOwner={isOwner}
        />
      ) : null}

      {tab === 'leden' && isOwner ? (
        <CommunityMembersPanel communityId={community.id} visible={true} />
      ) : null}

      {tab === 'shop' ? (
        isOwner ? (
          <CommunityShopManagerPanel communityId={community.id} visible={true} />
        ) : (
          <CommunityShopViewPanel
            communityId={community.id}
            communityName={community.name}
            visible={true}
            userCommunityPoints={shell.communityPoints}
          />
        )
      ) : null}

      {tab === 'inwisselingen' && isOwner ? (
        <CommunityRedemptionsPanel communityId={community.id} visible={true} />
      ) : null}
    </div>
  )
}

function OverviewTab({
  communityId,
  isOwner,
  projects,
  loading,
  onRefresh,
  shellUserId,
}: {
  communityId: string
  isOwner: boolean
  projects: Project[]
  loading: boolean
  onRefresh: () => Promise<void>
  shellUserId?: string
}) {
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newGoal, setNewGoal] = useState('500')
  const [cbfId, setCbfId] = useState(CBF_CAUSES[0]?.id ?? 1)
  const [visibility, setVisibility] = useState<'public' | 'members_only'>('public')
  const [newImage, setNewImage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const activeList = projects.filter(isActive)
  const doneList = projects.filter(isCompleted)

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    if (!shellUserId) return
    const title = newTitle.trim()
    const goal = Number(newGoal.replace(',', '.'))
    if (!title || !Number.isFinite(goal) || goal < 50) {
      setMsg('Vul een titel en doelbedrag in (min. € 50).')
      return
    }
    setSaving(true)
    try {
      await createCommunityProject({
        ownerId: shellUserId,
        communityId,
        title,
        description: newDesc.trim() || undefined,
        targetAmount: goal,
        charityCauseKey: causeKeyFromCbfId(cbfId),
        visibility,
        imageUrl: newImage,
      })
      setNewTitle('')
      setNewDesc('')
      setNewGoal('500')
      setVisibility('public')
      setNewImage(null)
      setMsg('Project aangemaakt.')
      await onRefresh()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Aanmaken mislukt.')
    } finally {
      setSaving(false)
    }
  }

  async function onComplete(projectId: string) {
    if (!shellUserId) return
    const ok = window.confirm('Project als afgerond markeren? Doneren wordt uitgeschakeld.')
    if (!ok) return
    try {
      await updateProjectStatusForOwner(projectId, shellUserId, 'verlopen')
      await onRefresh()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Bijwerken mislukt.')
    }
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {isOwner ? (
        <form
          onSubmit={(e) => void onCreate(e)}
          style={{
            background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)',
            border: '1.5px solid #bbf7d0',
            borderRadius: 16,
            padding: 18,
            display: 'grid',
            gap: 10,
          }}
        >
          <div style={{ fontWeight: 800, color: '#15803d' }}>Nieuw community-project</div>
          <input className="input" placeholder="Projecttitel" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
          <textarea
            className="input"
            placeholder="Korte omschrijving (optioneel)"
            rows={2}
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            style={{ resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ fontSize: '.82rem', color: '#374151' }}>
              Doel €
              <input
                className="input"
                type="number"
                min={50}
                value={newGoal}
                onChange={(e) => setNewGoal(e.target.value)}
                style={{ marginLeft: 8, width: 120, marginBottom: 0 }}
              />
            </label>
            <select
              className="input"
              value={cbfId}
              onChange={(e) => setCbfId(Number(e.target.value))}
              style={{ flex: 1, minWidth: 200, marginBottom: 0 }}
            >
              {CBF_CAUSES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.naam}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '.82rem', color: '#374151', fontWeight: 600 }}>Zichtbaarheid:</span>
            <button
              type="button"
              className={visibility === 'public' ? 'btn btn-dark btn-sm' : 'btn btn-outline btn-sm'}
              onClick={() => setVisibility('public')}
            >
              Publiek
            </button>
            <button
              type="button"
              className={visibility === 'members_only' ? 'btn btn-dark btn-sm' : 'btn btn-outline btn-sm'}
              onClick={() => setVisibility('members_only')}
            >
              Alleen community
            </button>
          </div>
          <ProjectImagePicker value={newImage} onChange={setNewImage} />
          <button type="submit" className="btn btn-dark btn-sm" style={{ justifySelf: 'start' }} disabled={saving}>
            {saving ? 'Bezig…' : 'Project aanmaken'}
          </button>
          {msg ? (
            <div
              style={{
                background: msg.toLowerCase().includes('mislukt') ? '#fef2f2' : '#f0fdf4',
                border: `1.5px solid ${msg.toLowerCase().includes('mislukt') ? '#fecaca' : '#bbf7d0'}`,
                color: msg.toLowerCase().includes('mislukt') ? '#991b1b' : '#166534',
                borderRadius: 10,
                padding: '8px 12px',
                fontSize: '.82rem',
              }}
            >
              {msg}
            </div>
          ) : null}
        </form>
      ) : null}

      <div style={{ background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 16, padding: 18 }}>
        <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 12 }}>Actieve projecten</div>
        {loading ? (
          <p style={{ color: '#6b7280' }}>Laden…</p>
        ) : activeList.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: '.9rem', margin: 0 }}>Nog geen actieve projecten.</p>
        ) : (
          <div
            style={{
              display: 'grid',
              gap: 14,
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            }}
          >
            {activeList.map((p) => (
              <article
                key={p.id}
                style={{
                  border: '1.5px solid #e5e7eb',
                  borderRadius: 14,
                  overflow: 'hidden',
                  background: '#fff',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <ProjectBanner imageUrl={p.image_url} height={160}>
                  <span
                    style={{
                      fontSize: '.7rem',
                      fontWeight: 800,
                      padding: '4px 10px',
                      borderRadius: 999,
                      background: p.image_url ? 'rgba(255,255,255,.9)' : '#fff',
                      color: '#0f172a',
                    }}
                  >
                    {p.visibility === 'members_only' ? '🔒 Alleen community' : '🌍 Publiek'}
                  </span>
                </ProjectBanner>
                <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                  <div style={{ fontWeight: 800, color: '#0f172a' }}>{p.title}</div>
                  <div style={{ fontSize: '.8rem', color: '#6b7280' }}>
                    {charityLabelFromCauseKey(p.charity_cause_key)} · doel €
                    {Number(p.target_amount ?? 0).toLocaleString('nl-NL')}
                  </div>
                  {p.description ? (
                    <p style={{ fontSize: '.82rem', color: '#475569', margin: '4px 0 0', lineHeight: 1.5 }}>
                      {p.description}
                    </p>
                  ) : null}
                  <a
                    href={communityProjectShareUrl(p.id)}
                    style={{ fontSize: '.8rem', color: '#2563eb', marginTop: 6, fontWeight: 600 }}
                  >
                    {p.visibility === 'members_only' ? 'Doneren (alleen communityleden) →' : 'Open donatiepagina →'}
                  </a>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 'auto', paddingTop: 10 }}>
                    <ProjectSharePanel projectTitle={p.title} shareUrl={communityProjectShareUrl(p.id)} />
                    {isOwner ? (
                      <>
                        <OwnerEditProjectImage projectId={p.id} currentImage={p.image_url} onDone={onRefresh} />
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => void onComplete(p.id)}>
                          Markeer afgerond
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {doneList.length > 0 ? (
        <div style={{ background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 16, padding: 18 }}>
          <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 12 }}>Afgeronde projecten</div>
          <div style={{ display: 'grid', gap: 10 }}>
            {doneList.map((p) => (
              <div
                key={p.id}
                style={{
                  border: '1.5px dashed #d1d5db',
                  borderRadius: 12,
                  padding: 12,
                  background: '#f9fafb',
                }}
              >
                <div style={{ fontWeight: 700 }}>{p.title}</div>
                <div style={{ fontSize: '.78rem', color: '#6b7280' }}>
                  {charityLabelFromCauseKey(p.charity_cause_key)} · status: {p.status}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function OwnerEditProjectImage({
  projectId,
  currentImage,
  onDone,
}: {
  projectId: string
  currentImage: string | null | undefined
  onDone: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [value, setValue] = useState<string | null>(currentImage ?? null)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setErr(null)
    try {
      await updateProjectImage(projectId, value)
      setOpen(false)
      await onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Opslaan mislukt.')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-outline btn-sm"
        onClick={() => {
          setValue(currentImage ?? null)
          setErr(null)
          setOpen(true)
        }}
      >
        📷 Foto
      </button>
    )
  }

  return (
    <div
      style={{
        width: '100%',
        marginTop: 8,
        padding: 10,
        background: '#f8fafc',
        border: '1.5px solid #e2e8f0',
        borderRadius: 10,
      }}
    >
      <ProjectImagePicker value={value} onChange={setValue} label="Projectfoto wijzigen" />
      {err ? <div style={{ color: '#991b1b', fontSize: '.8rem', marginTop: 6 }}>{err}</div> : null}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
        <button type="button" className="btn btn-dark btn-sm" disabled={busy} onClick={() => void save()}>
          {busy ? 'Bezig…' : 'Opslaan'}
        </button>
        <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => setOpen(false)}>
          Annuleren
        </button>
      </div>
    </div>
  )
}
