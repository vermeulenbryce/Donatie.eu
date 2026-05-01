import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchAdminCommunitiesList,
  fetchAdminCommunityMemberDetails,
  fetchAdminCommunityPosts,
  subscribeToTableChanges,
  type AdminCommunityListRow,
  type AdminCommunityMemberDetailRow,
  type AdminCommunityPostRow,
} from '../../../../features/admin/adminContentService'
import {
  fetchCommunityShopItems,
  fetchProjectsForCommunity,
  type CommunityShopItem,
} from '../../../../features/community/communityProjectsService'
import type { Project } from '../../../../types/domain'

type TabId = 'leden' | 'posts' | 'shop' | 'projecten'

function memberLabel(m: AdminCommunityMemberDetailRow) {
  const n = [m.first_name, m.last_name]
    .map((s) => (s ?? '').trim())
    .filter(Boolean)
    .join(' ')
  if (n) return n
  return m.email ?? m.user_id
}

function bodyPreview(s: string, max = 160) {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length <= max ? t : `${t.slice(0, max)}…`
}

export function AdminCommunitiesSection() {
  const [list, setList] = useState<AdminCommunityListRow[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [listErr, setListErr] = useState<string | null>(null)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tab, setTab] = useState<TabId>('leden')

  const [members, setMembers] = useState<AdminCommunityMemberDetailRow[]>([])
  const [posts, setPosts] = useState<AdminCommunityPostRow[]>([])
  const [shop, setShop] = useState<CommunityShopItem[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailErr, setDetailErr] = useState<string | null>(null)

  const loadList = useCallback(async () => {
    try {
      const rows = await fetchAdminCommunitiesList()
      setList(rows)
      setListErr(null)
    } catch (e) {
      setListErr(e instanceof Error ? e.message : 'Laden mislukt.')
    } finally {
      setListLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadList()
    const u1 = subscribeToTableChanges('communities', loadList)
    return () => u1()
  }, [loadList])

  const loadDetail = useCallback(async (communityId: string) => {
    setDetailLoading(true)
    setDetailErr(null)
    try {
      const [m, p, s, pr] = await Promise.all([
        fetchAdminCommunityMemberDetails(communityId),
        fetchAdminCommunityPosts(communityId),
        fetchCommunityShopItems(communityId),
        fetchProjectsForCommunity(communityId),
      ])
      setMembers(m)
      setPosts(p)
      setShop(s)
      setProjects(pr)
    } catch (e) {
      setDetailErr(e instanceof Error ? e.message : 'Details laden mislukt.')
      setMembers([])
      setPosts([])
      setShop([])
      setProjects([])
    } finally {
      setDetailLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!selectedId) {
      setMembers([])
      setPosts([])
      setShop([])
      setProjects([])
      setDetailErr(null)
      return
    }
    void loadDetail(selectedId)
  }, [selectedId, loadDetail])

  useEffect(() => {
    if (!selectedId) return
    const u1 = subscribeToTableChanges('community_members', () => void loadDetail(selectedId))
    const u2 = subscribeToTableChanges('community_posts', () => void loadDetail(selectedId))
    const u3 = subscribeToTableChanges('community_shop_items', () => void loadDetail(selectedId))
    const u4 = subscribeToTableChanges('projects', () => void loadDetail(selectedId))
    const u5 = subscribeToTableChanges('profiles', () => void loadDetail(selectedId))
    return () => {
      u1()
      u2()
      u3()
      u4()
      u5()
    }
  }, [selectedId, loadDetail])

  const selected = useMemo(() => list.find((c) => c.id === selectedId) ?? null, [list, selectedId])

  return (
    <div>
      {listErr ? (
        <div className="admin-portal-card" style={{ borderLeft: '4px solid #dc2626' }}>
          <strong>Fout:</strong> {listErr}
        </div>
      ) : null}

      <div className="admin-portal-card">
        <h2 className="admin-portal-card-title">Community beheer</h2>
        <p className="admin-portal-card-sub">
          Kies een community om leden, feedberichten, community shop-items en gekoppelde projecten te bekijken
          (read-only). Voor volledige bewerking blijft de community-eigenaar de publieke/kanaal-UI gebruiken.
        </p>
        <p className="admin-portal-card-sub" style={{ fontSize: '.82rem', color: '#6b7280' }}>
          RLS: draai <code>docs/SQL_ADMIN_COMMUNITY_BEHEER_READ.sql</code> in Supabase (posts, shop-items, projecten).
          Leden: zelfde als bij Influencers — <code>SQL_ADMIN_INFLUENCERS_COMMUNITIES_READ.sql</code>.
        </p>
      </div>

      <div className="admin-communities-admin-grid">
        <div className="admin-portal-card" style={{ maxHeight: '75vh', overflow: 'auto' }}>
          <h3 className="admin-portal-card-title" style={{ fontSize: '1rem' }}>
            Communities
          </h3>
          {listLoading ? (
            <p>Laden…</p>
          ) : list.length === 0 ? (
            <div className="admin-portal-empty">Geen communities.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {list.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(c.id)
                    setTab('leden')
                  }}
                  className="admin-portal-btn is-ghost"
                  style={{
                    justifyContent: 'flex-start',
                    textAlign: 'left',
                    borderColor: selectedId === c.id ? '#283593' : undefined,
                    fontWeight: selectedId === c.id ? 800 : 500,
                    flexDirection: 'column',
                    alignItems: 'stretch',
                  }}
                >
                  <span>{c.name}</span>
                  <span style={{ fontSize: '.72rem', color: '#6b7280', fontWeight: 500 }}>
                    {c.kind} · {c.member_count} leden
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="admin-portal-card" style={{ minHeight: 360 }}>
          {!selectedId ? (
            <div className="admin-portal-empty">Selecteer links een community.</div>
          ) : (
            <>
              <div style={{ marginBottom: 14 }}>
                <h3 className="admin-portal-card-title" style={{ fontSize: '1.05rem', marginBottom: 6 }}>
                  {selected?.name ?? 'Community'}
                </h3>
                <div style={{ fontSize: '.82rem', color: '#6b7280' }}>
                  {selected?.kind} · join <code>{selected?.join_code}</code>
                  {selected?.slug ? (
                    <>
                      {' '}
                      · slug <code>{selected.slug}</code>
                    </>
                  ) : null}
                </div>
                <div style={{ fontSize: '.72rem', color: '#9ca3af', fontFamily: 'ui-monospace, monospace', marginTop: 4 }}>
                  {selectedId}
                </div>
              </div>

              {detailErr ? (
                <div style={{ borderLeft: '4px solid #dc2626', padding: '8px 12px', marginBottom: 12, background: '#fef2f2' }}>
                  <strong>Fout:</strong> {detailErr}
                  {/permission|policy|row-level|rls/i.test(detailErr) ? (
                    <p style={{ margin: '6px 0 0', fontSize: '.85rem' }}>
                      Voer <code>docs/SQL_ADMIN_COMMUNITY_BEHEER_READ.sql</code> uit.
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                {(
                  [
                    ['leden', `Leden (${members.length})`],
                    ['posts', `Feed (${posts.length})`],
                    ['shop', `Shop (${shop.length})`],
                    ['projecten', `Projecten (${projects.length})`],
                  ] as [TabId, string][]
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={`admin-portal-btn ${tab === id ? '' : 'is-ghost'}`}
                    onClick={() => setTab(id)}
                    style={{ padding: '6px 12px' }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {detailLoading ? (
                <p>Details laden…</p>
              ) : tab === 'leden' ? (
                members.length === 0 ? (
                  <div className="admin-portal-empty">Geen leden.</div>
                ) : (
                  <div className="admin-portal-table-wrap">
                    <table className="admin-portal-table">
                      <thead>
                        <tr>
                          <th>Rol</th>
                          <th>Naam / e-mail</th>
                          <th>Lid sinds</th>
                        </tr>
                      </thead>
                      <tbody>
                        {members.map((m) => (
                          <tr key={m.user_id}>
                            <td>
                              <span
                                className={`admin-portal-badge ${
                                  m.role === 'owner' ? 'ok' : m.role === 'sponsor' ? 'info' : ''
                                }`}
                              >
                                {m.role}
                              </span>
                            </td>
                            <td>
                              {memberLabel(m)}
                              {m.email ? <div style={{ fontSize: '.76rem', color: '#6b7280' }}>{m.email}</div> : null}
                              <div style={{ fontSize: '.7rem', color: '#9ca3af' }}>{m.user_id}</div>
                            </td>
                            <td style={{ whiteSpace: 'nowrap', fontSize: '.78rem', color: '#6b7280' }}>
                              {new Date(m.joined_at).toLocaleString('nl-NL')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : tab === 'posts' ? (
                posts.length === 0 ? (
                  <div className="admin-portal-empty">Geen feedberichten.</div>
                ) : (
                  <div className="admin-portal-table-wrap">
                    <table className="admin-portal-table">
                      <thead>
                        <tr>
                          <th>Datum</th>
                          <th>Auteur</th>
                          <th>Tekst</th>
                        </tr>
                      </thead>
                      <tbody>
                        {posts.map((p) => (
                          <tr key={p.id}>
                            <td style={{ whiteSpace: 'nowrap', fontSize: '.78rem', color: '#6b7280' }}>
                              {new Date(p.created_at).toLocaleString('nl-NL')}
                            </td>
                            <td style={{ fontSize: '.86rem' }}>{p.author_label}</td>
                            <td>
                              <span title={p.body}>{bodyPreview(p.body)}</span>
                              {p.project_id ? (
                                <div style={{ fontSize: '.72rem', color: '#6b7280' }}>
                                  project: {p.project_id}
                                </div>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : tab === 'shop' ? (
                shop.length === 0 ? (
                  <div className="admin-portal-empty">Geen community shop-items.</div>
                ) : (
                  <div className="admin-portal-table-wrap">
                    <table className="admin-portal-table">
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Punten</th>
                          <th>Voorraad</th>
                          <th>Actief</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shop.map((i) => (
                          <tr key={i.id}>
                            <td>
                              <strong>
                                {i.emoji ? `${i.emoji} ` : ''}
                                {i.title}
                              </strong>
                              {i.description ? (
                                <div style={{ fontSize: '.78rem', color: '#6b7280' }}>{bodyPreview(i.description, 100)}</div>
                              ) : null}
                            </td>
                            <td>{i.cost}</td>
                            <td>{i.stock}</td>
                            <td>
                              <span className={`admin-portal-badge ${i.active ? 'ok' : 'err'}`}>
                                {i.active ? 'ja' : 'nee'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : projects.length === 0 ? (
                <div className="admin-portal-empty">Geen projecten met community_id={selectedId}.</div>
              ) : (
                <div className="admin-portal-table-wrap">
                  <table className="admin-portal-table">
                    <thead>
                      <tr>
                        <th>Project</th>
                        <th>Status</th>
                        <th>Zichtbaarheid</th>
                        <th>Link</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projects.map((pr) => (
                        <tr key={pr.id}>
                          <td>
                            <strong>{pr.title}</strong>
                            <div style={{ fontSize: '.72rem', color: '#9ca3af' }}>{pr.id}</div>
                          </td>
                          <td>{pr.status}</td>
                          <td>{pr.visibility ?? '—'}</td>
                          <td>
                            <a href={`/community-project/${pr.id}`} target="_blank" rel="noreferrer" className="admin-portal-btn is-ghost" style={{ padding: '4px 10px', display: 'inline-block' }}>
                              Open
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
