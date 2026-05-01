import { Link } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchBedrijven,
  fetchIndividuen,
  fetchInfluencers,
  fetchProfileCounts,
  type ProfileBedrijf,
  type ProfileCount,
  type ProfileIndividu,
  type ProfileInfluencer,
} from '../services/profileViews'
import { supabase } from '../lib/supabase'

type TabKey = 'individu' | 'bedrijf' | 'influencer'
type SortDirection = 'asc' | 'desc'

export function ProfilesOverviewPage() {
  const [counts, setCounts] = useState<ProfileCount[]>([])
  const [individuen, setIndividuen] = useState<ProfileIndividu[]>([])
  const [bedrijven, setBedrijven] = useState<ProfileBedrijf[]>([])
  const [influencers, setInfluencers] = useState<ProfileInfluencer[]>([])
  const [activeTab, setActiveTab] = useState<TabKey>('individu')
  const [query, setQuery] = useState('')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [liveEnabled, setLiveEnabled] = useState(false)
  const pageSize = 5

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [countsData, individuenData, bedrijvenData, influencersData] = await Promise.all([
        fetchProfileCounts(),
        fetchIndividuen(),
        fetchBedrijven(),
        fetchInfluencers(),
      ])
      setCounts(countsData)
      setIndividuen(individuenData)
      setBedrijven(bedrijvenData)
      setInfluencers(influencersData)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Data laden mislukt.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      void loadData()
    })
  }, [loadData])

  useEffect(() => {
    if (!supabase) return
    const client = supabase

    const channel = client
      .channel('profiles-overview-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => {
          void loadData()
        },
      )
      .subscribe((status) => {
        setLiveEnabled(status === 'SUBSCRIBED')
      })

    return () => {
      void client.removeChannel(channel)
    }
  }, [loadData])

  const countMap = useMemo(() => {
    return counts.reduce<Record<string, number>>((acc, item) => {
      acc[item.account_type] = item.totaal
      return acc
    }, {})
  }, [counts])

  const currentRows = useMemo(() => {
    const list = activeTab === 'individu' ? individuen : activeTab === 'bedrijf' ? bedrijven : influencers
    return list
  }, [activeTab, individuen, bedrijven, influencers])

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const base = currentRows.filter((item) => {
      const searchText = [
        item.id,
        item.email,
        'first_name' in item ? item.first_name : null,
        'last_name' in item ? item.last_name : null,
        'company_name' in item ? item.company_name : null,
        'influencer_name' in item ? item.influencer_name : null,
        'kvk' in item ? item.kvk : null,
        'niche' in item ? item.niche : null,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return searchText.includes(normalizedQuery)
    })

    return base.sort((a, b) => {
      const aVal = getPrimaryLabel(a).toLowerCase()
      const bVal = getPrimaryLabel(b).toLowerCase()
      if (aVal === bVal) return 0
      const result = aVal > bVal ? 1 : -1
      return sortDirection === 'asc' ? result : -result
    })
  }, [currentRows, query, sortDirection])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const paginatedRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const selectedRow = filteredRows.find((row) => row.id === selectedId) ?? null

  function goToPrevPage() {
    setPage((prev) => Math.max(1, Math.min(prev, totalPages) - 1))
  }

  function goToNextPage() {
    setPage((prev) => Math.min(totalPages, prev + 1))
  }

  return (
    <main className="app-shell">
      <header>
        <h1>Profiles overzicht</h1>
        <p>Live data uit Supabase views met zoek-, sorteer- en pagineeropties.</p>
        <p className="hint">
          Live updates: {liveEnabled ? 'actief' : 'inactief'}
        </p>
      </header>

      <section className="card">
        <h2>Aantallen per type</h2>
        {loading ? <p>Laden...</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
        {!loading && !error ? (
          <div className="stats-grid">
            <div className="stat-tile">
              <strong>Individuen</strong>
              <span>{countMap.individu ?? 0}</span>
            </div>
            <div className="stat-tile">
              <strong>Bedrijven</strong>
              <span>{countMap.bedrijf ?? 0}</span>
            </div>
            <div className="stat-tile">
              <strong>Influencers</strong>
              <span>{countMap.influencer ?? 0}</span>
            </div>
          </div>
        ) : null}
      </section>

      <section className="card">
        <div className="tabs-row">
          <button
            type="button"
            className={`tab-button ${activeTab === 'individu' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('individu')
              setPage(1)
              setSelectedId(null)
            }}
          >
            Individuen
          </button>
          <button
            type="button"
            className={`tab-button ${activeTab === 'bedrijf' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('bedrijf')
              setPage(1)
              setSelectedId(null)
            }}
          >
            Bedrijven
          </button>
          <button
            type="button"
            className={`tab-button ${activeTab === 'influencer' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('influencer')
              setPage(1)
              setSelectedId(null)
            }}
          >
            Influencers
          </button>
        </div>

        <div className="toolbar-row">
          <input
            className="input"
            type="text"
            placeholder="Zoek op naam, e-mail, id, niche..."
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setPage(1)
              setSelectedId(null)
            }}
          />
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
              setPage(1)
              setSelectedId(null)
            }}
          >
            Sorteer: {sortDirection === 'asc' ? 'A-Z' : 'Z-A'}
          </button>
          <button type="button" className="button secondary" onClick={() => void loadData()} disabled={loading}>
            {loading ? 'Laden...' : 'Verversen'}
          </button>
        </div>

        <h2>
          {tabTitle(activeTab)} ({filteredRows.length})
        </h2>
        {filteredRows.length === 0 ? <p className="hint">Geen resultaten voor deze filter.</p> : null}
        {filteredRows.length > 0 ? (
          <div className="overview-layout">
            <div className="table-wrap">
              <table className="overview-table">
                <thead>{renderTableHead(activeTab)}</thead>
                <tbody>
                  {paginatedRows.map((item) => (
                    <tr
                      key={item.id}
                      className={item.id === selectedId ? 'row-active' : ''}
                      onClick={() => setSelectedId(item.id)}
                    >
                      {renderTableRow(activeTab, item)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <aside className="detail-panel">
              <h3>Details</h3>
              {!selectedRow ? (
                <p className="hint">Selecteer een rij om details te bekijken.</p>
              ) : (
                <div className="detail-grid">
                  {renderDetails(activeTab, selectedRow)}
                </div>
              )}
            </aside>
          </div>
        ) : null}

        <div className="action-row">
          <button type="button" className="button secondary" onClick={goToPrevPage} disabled={page <= 1}>
            Vorige
          </button>
          <p className="hint">
            Pagina {currentPage} van {totalPages}
          </p>
          <button
            type="button"
            className="button secondary"
            onClick={goToNextPage}
            disabled={currentPage >= totalPages}
          >
            Volgende
          </button>
        </div>
      </section>

      <section className="card">
        <Link to="/">Terug naar home</Link>
      </section>
    </main>
  )
}

function tabTitle(tab: TabKey): string {
  if (tab === 'bedrijf') return 'Bedrijven'
  if (tab === 'influencer') return 'Influencers'
  return 'Individuen'
}

function getPrimaryLabel(item: ProfileIndividu | ProfileBedrijf | ProfileInfluencer): string {
  if ('company_name' in item) return item.company_name ?? item.first_name ?? item.email ?? item.id
  if ('influencer_name' in item) return item.influencer_name ?? item.first_name ?? item.email ?? item.id
  return item.first_name ?? item.email ?? item.id
}

function renderTableHead(tab: TabKey) {
  if (tab === 'bedrijf') {
    return (
      <tr>
        <th>Naam</th>
        <th>E-mail</th>
        <th>KVK</th>
        <th>Contact</th>
        <th>Punten</th>
      </tr>
    )
  }

  if (tab === 'influencer') {
    return (
      <tr>
        <th>Naam</th>
        <th>E-mail</th>
        <th>Niche</th>
        <th>Punten</th>
        <th>Totaal</th>
      </tr>
    )
  }

  return (
    <tr>
      <th>Naam</th>
      <th>E-mail</th>
      <th>Anoniem</th>
      <th>Punten</th>
      <th>Totaal</th>
    </tr>
  )
}

function renderTableRow(tab: TabKey, item: ProfileIndividu | ProfileBedrijf | ProfileInfluencer) {
  if (tab === 'bedrijf' && 'company_name' in item) {
    return (
      <>
        <td>{item.company_name ?? item.first_name ?? '-'}</td>
        <td>{item.email ?? '-'}</td>
        <td>{item.kvk ?? '-'}</td>
        <td>{item.contact_name ?? '-'}</td>
        <td>{item.points ?? 0}</td>
      </>
    )
  }

  if (tab === 'influencer' && 'influencer_name' in item) {
    return (
      <>
        <td>{item.influencer_name ?? item.first_name ?? '-'}</td>
        <td>{item.email ?? '-'}</td>
        <td>{item.niche ?? '-'}</td>
        <td>{item.points ?? 0}</td>
        <td>{item.total_donated ?? 0}</td>
      </>
    )
  }

  if ('anonymous' in item) {
    return (
      <>
        <td>{item.first_name ?? '-'}</td>
        <td>{item.email ?? '-'}</td>
        <td>{item.anonymous ? 'Ja' : 'Nee'}</td>
        <td>{item.points ?? 0}</td>
        <td>{item.total_donated ?? 0}</td>
      </>
    )
  }

  return (
    <>
      <td>{getPrimaryLabel(item)}</td>
      <td>{item.email ?? '-'}</td>
      <td>-</td>
      <td>-</td>
      <td>-</td>
    </>
  )
}

function renderDetails(tab: TabKey, item: ProfileIndividu | ProfileBedrijf | ProfileInfluencer) {
  if (tab === 'bedrijf' && 'company_name' in item) {
    return (
      <>
        <DetailItem label="ID" value={item.id} />
        <DetailItem label="Naam" value={item.company_name ?? item.first_name ?? '-'} />
        <DetailItem label="E-mail" value={item.email ?? '-'} />
        <DetailItem label="KVK" value={item.kvk ?? '-'} />
        <DetailItem label="Contactpersoon" value={item.contact_name ?? '-'} />
        <DetailItem label="Punten" value={String(item.points ?? 0)} />
        <DetailItem label="Totaal gedoneerd" value={String(item.total_donated ?? 0)} />
      </>
    )
  }

  if (tab === 'influencer' && 'influencer_name' in item) {
    return (
      <>
        <DetailItem label="ID" value={item.id} />
        <DetailItem label="Naam" value={item.influencer_name ?? item.first_name ?? '-'} />
        <DetailItem label="E-mail" value={item.email ?? '-'} />
        <DetailItem label="Niche" value={item.niche ?? '-'} />
        <DetailItem label="Punten" value={String(item.points ?? 0)} />
        <DetailItem label="Totaal gedoneerd" value={String(item.total_donated ?? 0)} />
      </>
    )
  }

  if ('anonymous' in item) {
    return (
      <>
        <DetailItem label="ID" value={item.id} />
        <DetailItem label="Voornaam" value={item.first_name ?? '-'} />
        <DetailItem label="Achternaam" value={item.last_name ?? '-'} />
        <DetailItem label="E-mail" value={item.email ?? '-'} />
        <DetailItem label="Anoniem" value={item.anonymous ? 'Ja' : 'Nee'} />
        <DetailItem label="Punten" value={String(item.points ?? 0)} />
        <DetailItem label="Totaal gedoneerd" value={String(item.total_donated ?? 0)} />
      </>
    )
  }

  return (
    <>
      <DetailItem label="ID" value={item.id} />
      <DetailItem label="E-mail" value={item.email ?? '-'} />
    </>
  )
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-item">
      <span className="detail-label">{label}</span>
      <strong className="detail-value">{value}</strong>
    </div>
  )
}
