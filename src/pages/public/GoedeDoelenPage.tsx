import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CbfCauseDetail } from '../../components/public/CbfCauseDetail'
import { CbfCauseMap } from '../../components/public/CbfCauseMap'
import { CauseMatchQuizModal } from '../../components/public/CauseMatchQuizModal'
import { CbfCausesGrid } from '../../components/public/CbfCausesGrid'
import { createDonation } from '../../features/donations/donationsService'
import { filterAndSortCauses, type CauseSortMode } from '../../features/legacy/filterCbfCauses'
import type { LegacyDonateFreq } from '../../features/legacy/legacyCbfConstants'
import { DonateModal } from '../../components/public/DonateModal'
import { PublicPageHeader } from '../../components/public/PublicPageHeader'
import { useLegacyUiSession } from '../../context/LegacyUiSessionContext'
import { isSupabaseConfigured } from '../../lib/supabase'
import type { LegacyCbfCause } from '../../features/legacy/cbfCauses.generated'
import { useMyCauseQuiz } from '../../features/causeQuiz/causeQuizService'
import { useLiveCharityCauses } from '../../features/public/charityCausesLive'

const FILTERS: { cat: string; label: string }[] = [
  { cat: 'alle', label: 'Alle' },
  { cat: 'NEDERLAND', label: 'Nederland' },
  { cat: 'GEZONDHEID', label: '💊 Gezondheid' },
  { cat: 'DIEREN EN NATUUR', label: '🐾 Dieren' },
  { cat: 'MILIEU EN NATUUR', label: '🌱 Milieu' },
  { cat: 'SOCIAAL EN WELZIJN', label: '🤝 Welzijn' },
  { cat: 'INTERNATIONALE HULP EN MENSENRECHTEN', label: '🌍 Internationaal' },
  { cat: 'CULTUUR EN EDUCATIE', label: '📚 Onderwijs' },
]

export function GoedeDoelenPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { shell, recordLegacyDonation } = useLegacyUiSession()
  const sessionUserId =
    shell?.source === 'session' && shell.user?.id ? (shell.user.id as string) : null
  const { completed: quizDone, loading: quizStatusLoading, refetch: refetchMyQuiz } =
    useMyCauseQuiz(sessionUserId)

  const [view, setView] = useState<'grid' | 'map'>('grid')
  const [cardSize, setCardSize] = useState<'large' | 'small'>('large')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('alle')
  const [sort, setSort] = useState<CauseSortMode>('bekendheid')

  const [donateOpen, setDonateOpen] = useState(false)
  const [donateOrg, setDonateOrg] = useState('')
  const [donateTitle, setDonateTitle] = useState('')
  const [toast, setToast] = useState<{ msg: string; variant: 'success' | 'error' } | null>(null)
  const [quizOpen, setQuizOpen] = useState(false)
  const [quizHighlightIds, setQuizHighlightIds] = useState<number[]>([])
  const causes = useLiveCharityCauses()

  const recordDonationWithSupabase = useCallback(
    async (input: {
      amount: number
      pts: number
      causeTitle: string
      org: string
      frequency: LegacyDonateFreq
    }): Promise<{ cloudOk: boolean; cloudError?: string }> => {
      const payload = {
        amount: input.amount,
        pts: input.pts,
        causeTitle: input.causeTitle,
        org: input.org,
        frequency: input.frequency,
      }
      const s = shell
      const sessionUser =
        s?.source === 'session' && s.user && isSupabaseConfigured ? s.user : null
      if (sessionUser && s) {
        const type = input.frequency === 'maandelijks' ? 'maandelijks' : 'eenmalig'
        try {
          await createDonation({
            donorUserId: sessionUser.id,
            donorEmail: s.email,
            donorName: `${s.firstName} ${s.lastName}`.trim() || undefined,
            charityName: input.org,
            amount: input.amount,
            type,
          })
          /* Alleen lokaal tellen na geslaagde cloud-insert (anders lopen punten/totaal op bij RLS/validatiefout). */
          recordLegacyDonation(payload)
          return { cloudOk: true }
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Donatie opslaan mislukt.'
          console.warn('[goede-doelen] createDonation', msg)
          return { cloudOk: false, cloudError: msg }
        }
      }
      recordLegacyDonation(payload)
      return { cloudOk: true }
    },
    [shell, recordLegacyDonation],
  )

  const detailIdRaw = searchParams.get('causeId')
  const detailId = detailIdRaw ? parseInt(detailIdRaw, 10) : NaN
  const detailCause = useMemo(
    () => (Number.isFinite(detailId) ? causes.find((c) => c.id === detailId) : undefined),
    [detailId, causes],
  )

  const filtered = useMemo(
    () => filterAndSortCauses(causes, { filterCat: filter, search, sort }),
    [causes, filter, search, sort],
  )

  const openDonate = useCallback((c: LegacyCbfCause) => {
    setDonateOrg(c.naam)
    setDonateTitle(c.naam)
    setDonateOpen(true)
  }, [])

  const openDetail = useCallback(
    (id: number) => {
      setSearchParams({ causeId: String(id) }, { replace: false })
    },
    [setSearchParams],
  )

  const closeDetail = useCallback(() => {
    setSearchParams({}, { replace: true })
  }, [setSearchParams])

  const applyCauseQuiz = useCallback(
    (r: { filterCat: string; topIds: number[] }) => {
      setFilter(r.filterCat)
      setSort('bekendheid')
      setSearch('')
      setQuizHighlightIds(r.topIds)
      if (searchParams.get('causeId')) {
        setSearchParams({}, { replace: true })
      }
      setView('grid')
      window.setTimeout(() => {
        document.getElementById('causesGrid')?.scrollIntoView({ behavior: 'smooth' })
      }, 100)
    },
    [searchParams, setSearchParams],
  )

  const quizQ = searchParams.get('quiz')
  useEffect(() => {
    if (quizQ !== '1') return
    if (sessionUserId && quizStatusLoading) return
    if (sessionUserId && quizDone) {
      setToast({ msg: 'Je hebt de quiz al gedaan. Je uitslag is opgeslagen.', variant: 'success' })
    } else {
      setQuizOpen(true)
    }
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev)
        n.delete('quiz')
        return n
      },
      { replace: true },
    )
  }, [quizQ, setSearchParams, sessionUserId, quizDone, quizStatusLoading])

  useEffect(() => {
    if (searchParams.get('donate') !== '1') return
    const raw = searchParams.get('causeId')
    const id = raw ? parseInt(raw, 10) : NaN
    const c = Number.isFinite(id) ? causes.find((x) => x.id === id) : undefined
    const t = window.setTimeout(() => {
      if (c) {
        setDonateOrg(c.naam)
        setDonateTitle(c.naam)
        setDonateOpen(true)
      }
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete('donate')
          return next
        },
        { replace: true },
      )
    }, 0)
    return () => window.clearTimeout(t)
  }, [searchParams, setSearchParams, causes])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 4200)
    return () => window.clearTimeout(t)
  }, [toast])

  const openToolbarQuiz = useCallback(() => {
    if (sessionUserId && quizDone) {
      setToast({ msg: 'Je hebt de quiz al gedaan. Je uitslag is opgeslagen.', variant: 'success' })
      return
    }
    setQuizOpen(true)
  }, [sessionUserId, quizDone])

  const causeQuizModal = (
    <CauseMatchQuizModal
      open={quizOpen}
      onClose={() => setQuizOpen(false)}
      causes={causes}
      onApply={applyCauseQuiz}
      canPersist={!!sessionUserId}
      userId={sessionUserId}
      hasAlreadyCompleted={!!sessionUserId && quizDone}
      onSaved={() => void refetchMyQuiz()}
    />
  )

  if (detailCause) {
    return (
      <>
        <main role="main" id="mainContent">
          <div id="page-goede-doelen" className="page active">
            {toast ? (
              <div
                style={{
                  position: 'fixed',
                  bottom: 24,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  zIndex: 950,
                  background: toast.variant === 'error' ? '#fef2f2' : '#ecfdf5',
                  color: toast.variant === 'error' ? '#991b1b' : '#065f46',
                  border: `1.5px solid ${toast.variant === 'error' ? '#fecaca' : '#6ee7b7'}`,
                  padding: '12px 18px',
                  borderRadius: 12,
                  fontWeight: 600,
                  fontSize: '.88rem',
                  maxWidth: 420,
                  textAlign: 'center',
                  boxShadow: '0 8px 30px rgba(0,0,0,.12)',
                }}
              >
                {toast.msg}
              </div>
            ) : null}
            <CbfCauseDetail
              c={detailCause}
              onBack={closeDetail}
              onDonate={() => openDonate(detailCause)}
            />
            <DonateModal
              open={donateOpen}
              onClose={() => setDonateOpen(false)}
              org={donateOrg}
              title={donateTitle}
              shell={shell}
              onRequireLogin={() => navigate('/auth')}
              recordDonation={recordDonationWithSupabase}
              onToast={(msg, variant) => setToast({ msg, variant })}
            />
          </div>
        </main>
        {causeQuizModal}
      </>
    )
  }

  return (
    <>
    <main role="main" id="mainContent">
      <div id="page-goede-doelen" className="page active">
        {toast ? (
          <div
            style={{
              position: 'fixed',
              bottom: 24,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 950,
              background: toast.variant === 'error' ? '#fef2f2' : '#ecfdf5',
              color: toast.variant === 'error' ? '#991b1b' : '#065f46',
              border: `1.5px solid ${toast.variant === 'error' ? '#fecaca' : '#6ee7b7'}`,
              padding: '12px 18px',
              borderRadius: 12,
              fontWeight: 600,
              fontSize: '.88rem',
              maxWidth: 420,
              textAlign: 'center',
              boxShadow: '0 8px 30px rgba(0,0,0,.12)',
            }}
          >
            {toast.msg}
          </div>
        ) : null}
        <PublicPageHeader
          eyebrow="CBF-Erkend"
          title="Alle Goede Doelen"
          subtitle={
            <>
              Alle organisaties met een officieel <strong>CBF-keurmerk</strong> — onafhankelijk getoetst op transparantie
              en betrouwbaarheid.
            </>
          }
        />

        <div className="container section-sm">
          {quizHighlightIds.length > 0 ? (
            <div
              id="goede-doelen-quiz-banner"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
                marginBottom: 16,
                padding: '14px 18px',
                background: 'linear-gradient(135deg, #ecfdf5, #d1fae5)',
                border: '1.5px solid #6ee7b7',
                borderRadius: 14,
              }}
            >
              <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: 600, color: '#065f46' }}>
                🎯 Quiz: de <strong>groen omlijnde</strong> kaarten = jouw top 10 (in volgorde). Filter = eerste
                thema-keuze.
              </p>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() => setQuizHighlightIds([])}
                style={{ fontWeight: 700, flexShrink: 0 }}
              >
                Uit
              </button>
            </div>
          ) : null}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
              marginBottom: 20,
            }}
          >
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="view-toggle">
                <button
                  type="button"
                  className={`view-toggle-btn${view === 'grid' ? ' active' : ''}`}
                  id="btnGrid"
                  onClick={() => setView('grid')}
                >
                  ☰ Overzicht
                </button>
                <button
                  type="button"
                  className={`view-toggle-btn${view === 'map' ? ' active' : ''}`}
                  id="btnMap"
                  onClick={() => setView('map')}
                >
                  🗺️ Kaart
                </button>
              </div>
              <div className="view-toggle" style={{ marginLeft: 4 }}>
                <button
                  type="button"
                  className={`view-toggle-btn${cardSize === 'large' ? ' active' : ''}`}
                  id="btnCardLarge"
                  onClick={() => setCardSize('large')}
                  title="Grote kaarten"
                >
                  ▦ Groot
                </button>
                <button
                  type="button"
                  className={`view-toggle-btn${cardSize === 'small' ? ' active' : ''}`}
                  id="btnCardSmall"
                  onClick={() => setCardSize('small')}
                  title="Kleine kaarten"
                >
                  ⊞ Klein
                </button>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={openToolbarQuiz}
                style={{ fontWeight: 700, borderRadius: 12, borderColor: '#1a237e', color: '#1a237e' }}
                title="Persoonlijkheidsquiz"
              >
                🎯 Persoonlijkheidsquiz
              </button>
            </div>
            <span className="causes-count" id="causesCount">
              {filtered.length} CBF-erkende goede doelen
            </span>
          </div>

          <div id="causesToolbar" style={{ display: view === 'grid' ? undefined : 'none' }}>
            <div className="causes-toolbar">
              <div className="search-wrap">
                <span className="search-icon" aria-hidden>
                  🔍
                </span>
                <input
                  type="text"
                  className="input"
                  id="causeSearch"
                  placeholder="Zoek een goed doel…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Zoek een goed doel"
                />
              </div>
              <div className="filter-bar">
                {FILTERS.map((f) => (
                  <button
                    key={f.cat}
                    type="button"
                    className={`filter-btn${filter === f.cat ? ' active' : ''}`}
                    data-cat={f.cat}
                    onClick={() => setFilter(f.cat)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <select
                className="sort-select"
                value={sort}
                onChange={(e) => setSort(e.target.value as CauseSortMode)}
                aria-label="Sorteren"
              >
                <option value="bekendheid">Bekendheid (meest herkenbaar eerst)</option>
                <option value="name">Naam A–Z</option>
                <option value="cat">Op sector</option>
                <option value="cat-E">Grootste eerst (CBF-rang)</option>
              </select>
            </div>
          </div>

          <div id="causesGridView" style={{ display: view === 'grid' ? undefined : 'none' }}>
            <CbfCausesGrid
              causes={filtered}
              compact={cardSize === 'small'}
              highlightIds={quizHighlightIds}
              onOpenDetail={openDetail}
              onDonate={openDonate}
            />
          </div>

          <div id="causesMapView" style={{ display: view === 'map' ? undefined : 'none' }}>
            {view === 'map' ? <CbfCauseMap causes={filtered} onOpenDetail={openDetail} /> : null}
          </div>
        </div>

        <DonateModal
          open={donateOpen}
          onClose={() => setDonateOpen(false)}
          org={donateOrg}
          title={donateTitle}
          shell={shell}
          onRequireLogin={() => navigate('/auth')}
          recordDonation={recordDonationWithSupabase}
          onToast={(msg, variant) => setToast({ msg, variant })}
        />
      </div>
    </main>
    {causeQuizModal}
    </>
  )
}
