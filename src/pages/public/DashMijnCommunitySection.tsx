import { useCallback, useEffect, useMemo, useState } from 'react'
import { CBF_CAUSES } from '../../features/legacy/cbfCauses.generated'
import {
  causeKeyFromCbfId,
  charityLabelFromCauseKey,
  communityProjectShareUrl,
  createCommunityProject,
  ensureOwnedCommunity,
  fetchMyMembershipCommunities,
  fetchOwnedCommunity,
  fetchProjectsForCommunities,
  fetchProjectsForCommunity,
  formatJoinCommunityError,
  joinCommunityAsSponsor,
  joinCommunityWithCode,
  syncProfileAccountTypeIndividu,
  updateProjectStatusForOwner,
  type CommunityMembershipRow,
  type CommunityRow,
} from '../../features/community/communityProjectsService'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'
import type { LegacyShellUser } from '../../context/LegacyUiSessionContext'
import type { Project } from '../../types/domain'
import { ProjectSharePanel } from '../../components/public/ProjectSharePanel'
import {
  CommunityFeedPanel,
  CommunityMembersPanel,
  CommunityRedemptionsPanel,
  CommunityShopManagerPanel,
  CommunityShopViewPanel,
} from './CommunityPanels'
import { ProjectImagePicker } from '../../components/public/ProjectImagePicker'
import { ProjectBanner } from '../../components/public/ProjectBanner'

function isProjectActive(p: Project): boolean {
  const s = String(p.status || '').toLowerCase()
  return s === 'actief' || s === 'active'
}

function isProjectCompleted(p: Project): boolean {
  const s = String(p.status || '').toLowerCase()
  return s === 'verlopen' || s === 'cancelled'
}

function CopyButton({ value, label = 'Kopieer' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="btn btn-outline btn-sm"
      style={{
        padding: '6px 12px',
        fontSize: '.78rem',
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
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

export function DashMijnCommunitySection({
  visible,
  shell,
  onSessionReload,
}: {
  visible: boolean
  shell: LegacyShellUser
  /** Na profielherstel (eigenaar): shell opnieuw laden */
  onSessionReload?: () => Promise<void>
}) {
  const [ownedCommunity, setOwnedCommunity] = useState<CommunityRow | null>(null)
  const [memberCommunities, setMemberCommunities] = useState<CommunityMembershipRow[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [creatingCommunity, setCreatingCommunity] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinAsSponsor, setJoinAsSponsor] = useState(false)
  const [sponsorCode, setSponsorCode] = useState('')
  const [sponsoring, setSponsoring] = useState(false)

  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newGoal, setNewGoal] = useState('500')
  const [cbfId, setCbfId] = useState(CBF_CAUSES[0]?.id ?? 1)
  const [projectVisibility, setProjectVisibility] = useState<'public' | 'members_only'>('public')
  const [newProjectImage, setNewProjectImage] = useState<string | null>(null)

  const ownerId = shell.user?.id
  const isOwnerAccount = shell.user?.type === 'bedrijf' || shell.user?.type === 'influencer'
  const isIndividual = shell.user?.type === 'individu'
  const ownerKind: 'bedrijf' | 'influencer' | undefined =
    shell.user?.type === 'bedrijf' ? 'bedrijf' : shell.user?.type === 'influencer' ? 'influencer' : undefined

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured || !ownerId || !shell.user?.type) {
      setOwnedCommunity(null)
      setMemberCommunities([])
      setProjects([])
      setLoading(false)
      return
    }
    setLoading(true)
    setErr(null)
    try {
      if (isOwnerAccount) {
        const comm = await fetchOwnedCommunity(ownerId, ownerKind)
        setOwnedCommunity(comm)
        setMemberCommunities([])
        if (comm) {
          const list = await fetchProjectsForCommunity(comm.id)
          setProjects(list)
        } else {
          setProjects([])
        }
        setLoading(false)
        return
      }

      if (!isOwnerAccount) {
        const communities = await fetchMyMembershipCommunities()
        setOwnedCommunity(null)
        setMemberCommunities(communities)
        if (communities.length > 0) {
          const list = await fetchProjectsForCommunities(communities.map((c) => c.id))
          setProjects(list)
        } else {
          setProjects([])
        }
      }
    } catch (e) {
      setProjects([])
      setOwnedCommunity(null)
      setMemberCommunities([])
      setErr(e instanceof Error ? e.message : 'Community ophalen mislukt.')
    } finally {
      setLoading(false)
    }
  }, [ownerId, shell.user?.type, isOwnerAccount, ownerKind])

  useEffect(() => {
    if (visible) void refresh()
  }, [visible, refresh])

  useEffect(() => {
    if (!visible || !ownerId || !supabase || !isOwnerAccount) return
    const client = supabase
    const ch = client
      .channel(`community-owner-${ownerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'communities', filter: `owner_user_id=eq.${ownerId}` }, () => {
        void refresh()
      })
      .subscribe()
    return () => {
      void client.removeChannel(ch)
    }
  }, [visible, ownerId, refresh, isOwnerAccount])

  useEffect(() => {
    if (!visible || !supabase) return
    const client = supabase
    const ch = client
      .channel(`community-projects-${ownerId || 'anon'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => {
        void refresh()
      })
      .subscribe()
    return () => {
      void client.removeChannel(ch)
    }
  }, [visible, ownerId, refresh])

  useEffect(() => {
    if (!visible || !ownerId || !supabase || !isIndividual) return
    const client = supabase
    const ch = client
      .channel(`community-members-${ownerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'community_members', filter: `user_id=eq.${ownerId}` }, () => {
        void refresh()
      })
      .subscribe()
    return () => {
      void client.removeChannel(ch)
    }
  }, [visible, ownerId, refresh, isIndividual])

  async function onCreateCommunity() {
    setCreatingCommunity(true)
    setMsg(null)
    setErr(null)
    try {
      const next = await ensureOwnedCommunity(shell.displayName)
      if (!next) {
        setErr('Community aanmaken mislukt. Probeer opnieuw.')
        return
      }
      setOwnedCommunity(next)
      setMsg('Community aangemaakt. Deel de uitnodigingscode hieronder.')
      const list = await fetchProjectsForCommunity(next.id)
      setProjects(list)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Community aanmaken mislukt.')
    } finally {
      setCreatingCommunity(false)
    }
  }

  async function onCreateProject(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    if (!ownerId || !ownedCommunity) return
    const title = newTitle.trim()
    const goal = Number(newGoal.replace(',', '.'))
    if (!title || !Number.isFinite(goal) || goal < 50) {
      setMsg('Vul een titel en doelbedrag in (min. € 50).')
      return
    }
    try {
      await createCommunityProject({
        ownerId,
        communityId: ownedCommunity.id,
        title,
        description: newDesc.trim() || undefined,
        targetAmount: goal,
        charityCauseKey: causeKeyFromCbfId(cbfId),
        visibility: projectVisibility,
        imageUrl: newProjectImage,
      })
      setNewProjectImage(null)
      setNewTitle('')
      setNewDesc('')
      setNewGoal('500')
      setProjectVisibility('public')
      setMsg('Project aangemaakt. Deel de link om te doneren.')
      await refresh()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Aanmaken mislukt.')
    }
  }

  async function onComplete(projectId: string) {
    if (!ownerId) return
    const ok = window.confirm('Project als afgerond markeren? Doneren wordt uitgeschakeld.')
    if (!ok) return
    try {
      await updateProjectStatusForOwner(projectId, ownerId, 'verlopen')
      setMsg('Project afgerond.')
      await refresh()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Bijwerken mislukt.')
    }
  }

  const activeList = useMemo(() => projects.filter(isProjectActive), [projects])
  const doneList = useMemo(() => projects.filter(isProjectCompleted), [projects])

  async function onJoinCommunity() {
    const code = joinAsSponsor ? joinCode.trim() : joinCode.trim()
    if (!code) {
      setMsg('Vul een communitycode in.')
      return
    }
    setJoining(true)
    setMsg(null)
    try {
      if (joinAsSponsor) {
        const result = await joinCommunityAsSponsor(code)
        if (!result.ok) {
          setMsg(`Sponsoren mislukt: ${formatJoinCommunityError(result.error)}`)
          return
        }
        setJoinCode('')
        setMsg('Succesvol aangesloten als sponsor.')
        await refresh()
        return
      }
      if (isIndividual) {
        await syncProfileAccountTypeIndividu()
      }
      const result = await joinCommunityWithCode(code)
      if (!result.ok) {
        setMsg(`Aansluiten mislukt: ${formatJoinCommunityError(result.error)}`)
        return
      }
      setJoinCode('')
      if (result.alreadyMember) {
        if (result.membershipRole === 'owner') {
          setMsg(
            'Je bent al eigenaar van deze community (vaak je eigen code). Het profiel is zo nodig bijgewerkt — een moment geduld terwijl het dashboard vernieuwt.',
          )
          await onSessionReload?.()
        } else if (result.membershipRole === 'sponsor') {
          setMsg('Je bent al sponsor van deze community.')
        } else {
          setMsg('Je bent al lid van deze community.')
        }
      } else if (result.alreadyOwner) {
        setMsg('Dit is je eigen community (eigenaar).')
        await onSessionReload?.()
      } else {
        setMsg('Succesvol aangesloten bij community.')
      }
      await refresh()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Aansluiten mislukt.')
    } finally {
      setJoining(false)
    }
  }

  async function onSponsorCommunity() {
    const code = sponsorCode.trim()
    if (!code) {
      setMsg('Vul een communitycode in.')
      return
    }
    setSponsoring(true)
    setMsg(null)
    try {
      const result = await joinCommunityAsSponsor(code)
      if (!result.ok) {
        setMsg(`Sponsoren mislukt: ${formatJoinCommunityError(result.error)}`)
        return
      }
      setSponsorCode('')
      setMsg('Succesvol aangesloten als sponsor.')
      await refresh()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Sponsoren mislukt.')
    } finally {
      setSponsoring(false)
    }
  }

  const msgIsError = !!msg && (msg.toLowerCase().includes('mislukt') || msg.toLowerCase().includes('fout'))

  return (
    <section className={`dash-section${visible ? ' active' : ''}`} id="dash-mijn-community">
      <h2 className="dash-title">Mijn community</h2>

      {!isSupabaseConfigured ? (
        <p style={{ color: '#6b7280' }}>Supabase is niet geconfigureerd — community werkt pas met backend.</p>
      ) : loading ? (
        <p style={{ color: '#6b7280' }}>Laden…</p>
      ) : (
        <>
          {/* Globale meldingen */}
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
          {msg ? (
            <div
              style={{
                background: msgIsError ? '#fef2f2' : '#f0fdf4',
                border: `1.5px solid ${msgIsError ? '#fecaca' : '#bbf7d0'}`,
                color: msgIsError ? '#991b1b' : '#166534',
                borderRadius: 12,
                padding: '10px 14px',
                marginBottom: 14,
                fontSize: '.88rem',
              }}
            >
              {msg}
            </div>
          ) : null}

          {isIndividual ? (
            /* ============================ PARTICULIER ============================ */
            <>
              <div
                style={{
                  background: 'linear-gradient(135deg,#eef2ff,#e0e7ff)',
                  border: '1.5px solid #c7d2fe',
                  borderRadius: 16,
                  padding: 18,
                  marginBottom: 18,
                }}
              >
                <div style={{ fontWeight: 800, marginBottom: 4, color: '#3730a3' }}>Aansluiten met communitycode</div>
                <p style={{ fontSize: '.82rem', color: '#4338ca', margin: '0 0 12px' }}>
                  Heb je van een bedrijf of influencer een code gekregen? Vul hem hier in.
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input
                    className="input"
                    placeholder="Bijv. BU-C60861C6 of IN-EE93616B"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    style={{ flex: 1, minWidth: 240, marginBottom: 0, letterSpacing: '.06em', fontWeight: 600 }}
                  />
                  <button type="button" className="btn btn-dark btn-sm" disabled={joining} onClick={() => void onJoinCommunity()}>
                    {joining ? 'Bezig…' : joinAsSponsor ? 'Aansluiten als sponsor' : 'Aansluiten'}
                  </button>
                </div>
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    marginTop: 10,
                    fontSize: '.82rem',
                    color: '#4338ca',
                    fontWeight: 600,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={joinAsSponsor}
                    onChange={(e) => setJoinAsSponsor(e.target.checked)}
                  />
                  Aansluiten als sponsor (voor bedrijven of actieve ondersteuners)
                </label>
                <p style={{ fontSize: '.76rem', color: '#4f46e5', marginTop: 10, marginBottom: 0 }}>
                  Je kunt 1 bedrijfscommunity en maximaal 5 influencer-communities joinen. Sponsoren heeft geen limiet.
                </p>
              </div>

              <div style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: '1rem', marginBottom: 12 }}>Mijn communities</h3>
                {memberCommunities.length === 0 ? (
                  <p style={{ color: '#6b7280', fontSize: '.9rem' }}>Je bent nog geen onderdeel van een community.</p>
                ) : (
                  <div style={{ display: 'grid', gap: 14 }}>
                    {memberCommunities.map((c) => (
                      <div
                        key={c.id}
                        style={{
                          background: '#fff',
                          border: '1.5px solid #e5e7eb',
                          borderRadius: 14,
                          padding: 14,
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 10,
                            flexWrap: 'wrap',
                            marginBottom: 10,
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 800, color: '#0f172a' }}>{c.name}</div>
                            <div style={{ fontSize: '.76rem', color: '#64748b' }}>
                              {c.kind === 'bedrijf' ? 'Bedrijf' : 'Influencer'}
                            </div>
                          </div>
                          <span
                            style={{
                              fontSize: '.7rem',
                              fontWeight: 800,
                              textTransform: 'uppercase',
                              letterSpacing: '.05em',
                              background:
                                c.role === 'owner' ? '#fef3c7' : c.role === 'sponsor' ? '#fae8ff' : '#e0f2fe',
                              color:
                                c.role === 'owner' ? '#854d0e' : c.role === 'sponsor' ? '#701a75' : '#075985',
                              borderRadius: 999,
                              padding: '4px 10px',
                            }}
                          >
                            {c.role === 'owner' ? 'Eigenaar' : c.role === 'sponsor' ? 'Sponsor' : 'Lid'}
                          </span>
                        </div>
                        <CommunityFeedPanel
                          communityId={c.id}
                          visible={visible}
                          currentUserId={ownerId}
                          canPost={true}
                          isOwner={c.role === 'owner'}
                          limit={3}
                          compact
                        />

                        <CommunityShopViewPanel
                          communityId={c.id}
                          communityName={c.name}
                          visible={visible}
                          userCommunityPoints={shell.communityPoints}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 style={{ fontSize: '1rem', marginBottom: 12 }}>Projecten uit mijn communities</h3>
                {projects.length === 0 ? (
                  <p style={{ color: '#6b7280', fontSize: '.9rem' }}>Nog geen projecten zichtbaar.</p>
                ) : (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {projects.map((p) => (
                      <div key={p.id} style={{ background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 12, padding: 12 }}>
                        <div style={{ fontWeight: 800 }}>{p.title}</div>
                        <div style={{ fontSize: '.78rem', color: '#6b7280' }}>
                          {charityLabelFromCauseKey(p.charity_cause_key)} · {p.visibility === 'members_only' ? 'Alleen community' : 'Publiek'}
                        </div>
                        <a href={communityProjectShareUrl(p.id)} style={{ fontSize: '.78rem', color: '#2563eb' }}>
                          {p.visibility === 'members_only' ? 'Doneren (community) →' : 'Open projectpagina →'}
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : !ownedCommunity ? (
            /* ============================ OWNER ZONDER COMMUNITY ============================ */
            <div
              style={{
                background: 'linear-gradient(135deg,#ecfeff,#cffafe)',
                border: '1.5px solid #a5f3fc',
                borderRadius: 16,
                padding: 22,
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '2rem', marginBottom: 8 }}>🚀</div>
              <div style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: 6, color: '#155e75' }}>
                Start je {ownerKind === 'bedrijf' ? 'bedrijfscommunity' : 'influencer-community'}
              </div>
              <p style={{ color: '#0e7490', fontSize: '.9rem', marginTop: 0, marginBottom: 16 }}>
                Maak in één klik een community aan. Je krijgt een unieke uitnodigingscode die je kunt delen
                met je volgers of medewerkers — zij kunnen daarmee bij jouw community aansluiten.
              </p>
              <button
                type="button"
                className="btn btn-dark"
                disabled={creatingCommunity}
                onClick={() => void onCreateCommunity()}
                style={{ minWidth: 220 }}
              >
                {creatingCommunity ? 'Bezig met aanmaken…' : 'Community aanmaken'}
              </button>
              <p style={{ fontSize: '.76rem', color: '#0891b2', marginTop: 12, marginBottom: 0 }}>
                Je kunt 1 community per account hebben. Projecten voeg je later toe.
              </p>
            </div>
          ) : (
            /* ============================ OWNER MET COMMUNITY ============================ */
            <>
              <div
                style={{
                  background: 'linear-gradient(135deg,#f8fafc,#eff6ff)',
                  border: '1.5px solid #dbeafe',
                  borderRadius: 16,
                  padding: 18,
                  marginBottom: 20,
                }}
              >
                <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: 14,
                      background:
                        ownedCommunity.kind === 'bedrijf'
                          ? 'linear-gradient(135deg,#0f766e,#14b8a6)'
                          : 'linear-gradient(135deg,#7c3aed,#8b5cf6)',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.8rem',
                      overflow: 'hidden',
                      flexShrink: 0,
                      border: '2px solid #fff',
                      boxShadow: '0 4px 12px rgba(15,23,42,.1)',
                    }}
                    aria-hidden
                  >
                    {!shell.anonymous && shell.avatarUrl ? (
                      <img
                        src={shell.avatarUrl}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : ownedCommunity.kind === 'bedrijf' ? (
                      '🏢'
                    ) : (
                      '⭐'
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: '.72rem', fontWeight: 800, letterSpacing: '.1em', color: '#2563eb' }}>
                      JOUW COMMUNITY
                    </div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800, marginTop: 4, color: '#0f172a' }}>
                      {ownedCommunity.name}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 14,
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <div style={{ fontSize: '.78rem', color: '#334155', fontWeight: 600 }}>Uitnodigingscode:</div>
                  <code
                    style={{
                      background: '#fff',
                      border: '1.5px solid #cbd5e1',
                      borderRadius: 10,
                      padding: '6px 12px',
                      fontSize: '.95rem',
                      fontWeight: 800,
                      letterSpacing: '.1em',
                      color: '#0f172a',
                    }}
                  >
                    {ownedCommunity.join_code}
                  </code>
                  <CopyButton value={ownedCommunity.join_code} label="Code kopiëren" />
                  <CopyButton
                    value={`${typeof window !== 'undefined' ? window.location.origin : ''}/auth?code=${encodeURIComponent(
                      ownedCommunity.join_code,
                    )}`}
                    label="Uitnodigingslink kopiëren"
                  />
                </div>

                <p style={{ fontSize: '.8rem', color: '#475569', marginTop: 12, marginBottom: 0 }}>
                  Deel deze code met mensen die zich bij jouw community willen aansluiten — particulieren
                  gebruiken hem na inloggen via &quot;Aansluiten met communitycode&quot;.
                </p>
              </div>

              <CommunityFeedPanel
                communityId={ownedCommunity.id}
                visible={visible}
                currentUserId={ownerId}
                canPost={true}
                isOwner={true}
                limit={5}
                compact
              />

              <CommunityMembersPanel communityId={ownedCommunity.id} visible={visible} />

              <CommunityShopManagerPanel communityId={ownedCommunity.id} visible={visible} />

              <CommunityRedemptionsPanel communityId={ownedCommunity.id} visible={visible} />

              <div
                style={{
                  background: 'linear-gradient(135deg,#faf5ff,#f3e8ff)',
                  border: '1.5px solid #e9d5ff',
                  borderRadius: 16,
                  padding: 18,
                  marginBottom: 24,
                }}
              >
                <div style={{ fontWeight: 800, marginBottom: 6, color: '#6b21a8' }}>
                  Andere community sponsoren
                </div>
                <p style={{ fontSize: '.82rem', color: '#7e22ce', margin: '0 0 12px' }}>
                  Steun een andere community als sponsor. Jouw rol daar wordt &quot;sponsor&quot;.
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input
                    className="input"
                    placeholder="Communitycode"
                    value={sponsorCode}
                    onChange={(e) => setSponsorCode(e.target.value.toUpperCase())}
                    style={{ flex: 1, minWidth: 220, marginBottom: 0, letterSpacing: '.06em', fontWeight: 600 }}
                  />
                  <button
                    type="button"
                    className="btn btn-dark btn-sm"
                    disabled={sponsoring}
                    onClick={() => void onSponsorCommunity()}
                  >
                    {sponsoring ? 'Bezig…' : 'Sponsor worden'}
                  </button>
                </div>
              </div>

              <div
                style={{
                  background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)',
                  border: '1.5px solid #bbf7d0',
                  borderRadius: 16,
                  padding: 18,
                  marginBottom: 24,
                }}
              >
                <div style={{ fontWeight: 800, marginBottom: 12, color: '#15803d' }}>Nieuw community-project</div>
                <form onSubmit={(e) => void onCreateProject(e)} style={{ display: 'grid', gap: 10 }}>
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
                      className={projectVisibility === 'public' ? 'btn btn-dark btn-sm' : 'btn btn-outline btn-sm'}
                      onClick={() => setProjectVisibility('public')}
                    >
                      Publiek
                    </button>
                    <button
                      type="button"
                      className={projectVisibility === 'members_only' ? 'btn btn-dark btn-sm' : 'btn btn-outline btn-sm'}
                      onClick={() => setProjectVisibility('members_only')}
                    >
                      Alleen community
                    </button>
                  </div>
                  <ProjectImagePicker value={newProjectImage} onChange={setNewProjectImage} />
                  <button type="submit" className="btn btn-dark btn-sm" style={{ justifySelf: 'start' }}>
                    Project aanmaken
                  </button>
                </form>
              </div>

              <div style={{ marginBottom: 28 }}>
                <h3 style={{ fontSize: '1rem', marginBottom: 12 }}>Actieve projecten</h3>
                {activeList.length === 0 ? (
                  <p style={{ color: '#6b7280', fontSize: '.9rem' }}>Nog geen actieve projecten.</p>
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
                          <div style={{ fontWeight: 800 }}>{p.title}</div>
                          <div style={{ fontSize: '.8rem', color: '#6b7280' }}>
                            {charityLabelFromCauseKey(p.charity_cause_key)} · doel €
                            {Number(p.target_amount ?? 0).toLocaleString('nl-NL')}
                          </div>
                          {p.description ? (
                            <p style={{ fontSize: '.82rem', color: '#475569', margin: 0, lineHeight: 1.5 }}>{p.description}</p>
                          ) : null}
                          <a
                            href={communityProjectShareUrl(p.id)}
                            style={{ fontSize: '.8rem', color: '#2563eb', fontWeight: 600 }}
                          >
                            {p.visibility === 'members_only'
                              ? 'Doneren (leden/sponsors) →'
                              : 'Open donatiepagina →'}
                          </a>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 'auto', paddingTop: 10 }}>
                            <ProjectSharePanel projectTitle={p.title} shareUrl={communityProjectShareUrl(p.id)} />
                            <button type="button" className="btn btn-outline btn-sm" onClick={() => void onComplete(p.id)}>
                              Markeer afgerond
                            </button>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 style={{ fontSize: '1rem', marginBottom: 12 }}>Projectgeschiedenis (afgerond)</h3>
                {doneList.length === 0 ? (
                  <p style={{ color: '#6b7280', fontSize: '.9rem' }}>Nog geen afgeronde projecten.</p>
                ) : (
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
                        <div style={{ marginTop: 8 }}>
                          <ProjectSharePanel projectTitle={p.title} shareUrl={communityProjectShareUrl(p.id)} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </section>
  )
}
