import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { insertUserCauseQuiz } from '../../features/causeQuiz/causeQuizService'
import type { LegacyCbfCause } from '../../features/legacy/cbfCauses.generated'
import {
  CAUSE_QUIZ_THEMES,
  type CauseQuizImpact,
  type CauseQuizMatchProfile,
  type CauseQuizMotivation,
  type CauseQuizOrgStyle,
  type CauseQuizThemeId,
  matchCausesToQuiz,
  toPersistedAnswersV1,
} from '../../features/legacy/causeMatchQuizLogic'
import { sectorMeta } from '../../features/legacy/legacySectorMeta'

type Step = 0 | 1 | 2 | 3 | 4

type CauseMatchQuizModalProps = {
  open: boolean
  onClose: () => void
  causes: LegacyCbfCause[]
  onApply: (result: { filterCat: string; topIds: number[] }) => void
  canPersist: boolean
  userId: string | null
  hasAlreadyCompleted: boolean
  onSaved?: () => void
}

const IMPACT_OPTS: { id: CauseQuizImpact; label: string; hint: string }[] = [
  { id: 'nl', label: 'Nederland', hint: 'Nederlandse impact en lokale betrokkenheid' },
  { id: 'europa', label: 'Europa (gemengd)', hint: 'Geen vaste voorkeur NL / rest van de wereld' },
  { id: 'wereld', label: 'Wereldwijd', hint: 'Focus op internationale doelen' },
]

const ORG_OPTS: { id: CauseQuizOrgStyle; label: string; hint: string }[] = [
  { id: 'bekend', label: 'Bekende erkende organisaties', hint: 'Herkenbare namen (CBF) eerst' },
  { id: 'ontdek', label: 'Nieuwe & kleinere initiatieven', hint: 'Meer kans op minder mainstream projecten' },
]

const MOTIVE_OPTS: { id: CauseQuizMotivation; label: string; hint: string }[] = [
  { id: 'acute', label: 'Acute hulp (crisis, nood, noodhulp)', hint: 'Past bij internationale / crisis-thema' },
  { id: 'structuur', label: 'Structurele verandering (welzijn, milieu, samenleving)', hint: 'Langetermijn' },
  { id: 'educatie', label: 'Onderwijs & ontwikkeling', hint: 'Cultuur en leren' },
  { id: 'dieren', label: 'Dierenwelzijn concreet', hint: 'Extra gewicht dieren' },
]

function toggleOrdered(prev: CauseQuizThemeId[], id: CauseQuizThemeId): CauseQuizThemeId[] {
  const i = prev.indexOf(id)
  if (i >= 0) return prev.filter((x) => x !== id)
  return [...prev, id]
}

export function CauseMatchQuizModal({
  open,
  onClose,
  causes,
  onApply,
  canPersist,
  userId,
  hasAlreadyCompleted,
  onSaved,
}: CauseMatchQuizModalProps) {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>(0)
  const [ordered, setOrdered] = useState<CauseQuizThemeId[]>([])
  const [impact, setImpact] = useState<CauseQuizImpact>('europa')
  const [orgStyle, setOrgStyle] = useState<CauseQuizOrgStyle>('bekend')
  const [motivation, setMotivation] = useState<CauseQuizMotivation>('structuur')
  const [result, setResult] = useState<{ filterCat: string; topIds: number[] } | null>(null)
  const [autoSave, setAutoSave] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const saveOkKeyRef = useRef<string>('')
  const saveFailedKeyRef = useRef<string>('')
  const saveInFlightRef = useRef(false)

  const profile: CauseQuizMatchProfile = useMemo(
    () => ({
      themeOrder: ordered,
      impact,
      orgStyle,
      motivation,
    }),
    [ordered, impact, orgStyle, motivation],
  )

  const reset = useCallback(() => {
    setStep(0)
    setOrdered([])
    setImpact('europa')
    setOrgStyle('bekend')
    setMotivation('structuur')
    setResult(null)
    setSaveErr(null)
    setAutoSave('idle')
    saveOkKeyRef.current = ''
    saveFailedKeyRef.current = ''
    saveInFlightRef.current = false
  }, [])

  useEffect(() => {
    if (!open) {
      const t = window.setTimeout(reset, 200)
      return () => window.clearTimeout(t)
    }
    return undefined
  }, [open, reset])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const computeResult = useCallback(() => {
    if (!ordered.length) return
    setResult(matchCausesToQuiz(causes, profile, 10))
    setStep(4)
  }, [causes, profile, ordered.length])

  const goNext = useCallback(() => {
    if (step === 0) {
      if (!ordered.length) return
      setStep(1)
      return
    }
    if (step < 3) {
      setStep((s) => (s + 1) as Step)
      return
    }
    if (step === 3) {
      computeResult()
    }
  }, [step, ordered.length, computeResult])

  const goBack = useCallback(() => {
    if (step > 0 && step < 4) setStep((s) => (s - 1) as Step)
  }, [step])

  const resultKey = useMemo(
    () => (result && result.topIds.length ? result.topIds.join(',') : ''),
    [result],
  )

  const onSavedRef = useRef(onSaved)
  onSavedRef.current = onSaved

  // Zodra de top-10 zichtbaar is: meteen opslaan (niet wachten op "Open lijst").
  useEffect(() => {
    if (!open) return
    if (step !== 4 || !result || !userId || !canPersist || !resultKey) return
    if (saveOkKeyRef.current === resultKey) return
    if (saveFailedKeyRef.current === resultKey) return
    if (saveInFlightRef.current) return

    let cancelled = false
    saveInFlightRef.current = true
    setAutoSave('saving')
    setSaveErr(null)

    const answers = toPersistedAnswersV1(profile)
    insertUserCauseQuiz({
      userId,
      answers,
      rankedCauseIds: result.topIds,
      primaryFilter: result.filterCat,
    })
      .then(() => {
        if (cancelled) return
        saveOkKeyRef.current = resultKey
        saveFailedKeyRef.current = ''
        setAutoSave('saved')
        onSavedRef.current?.()
      })
      .catch((e) => {
        if (cancelled) return
        saveFailedKeyRef.current = resultKey
        setSaveErr(e instanceof Error ? e.message : 'Opslaan mislukt.')
        setAutoSave('error')
      })
      .finally(() => {
        if (!cancelled) saveInFlightRef.current = false
      })
    return () => {
      cancelled = true
    }
  }, [open, step, result, resultKey, userId, canPersist, profile])

  const retrySave = useCallback(async () => {
    if (!result || !userId) return
    saveFailedKeyRef.current = ''
    setAutoSave('saving')
    setSaveErr(null)
    try {
      await insertUserCauseQuiz({
        userId,
        answers: toPersistedAnswersV1(profile),
        rankedCauseIds: result.topIds,
        primaryFilter: result.filterCat,
      })
      saveOkKeyRef.current = resultKey
      setAutoSave('saved')
      onSavedRef.current?.()
    } catch (e) {
      saveFailedKeyRef.current = resultKey
      setAutoSave('error')
      setSaveErr(e instanceof Error ? e.message : 'Opslaan mislukt.')
    }
  }, [result, userId, profile, resultKey])

  if (!open) return null

  if (hasAlreadyCompleted) {
    return createPortal(
      <div
        role="dialog"
        aria-modal="true"
        className="cause-quiz-overlay"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
          background: 'rgba(15, 28, 94, 0.55)',
          backdropFilter: 'blur(6px)',
        }}
        onClick={onClose}
      >
        <div
          style={{
            maxWidth: 400,
            background: '#fff',
            borderRadius: 16,
            padding: 24,
            textAlign: 'center',
            boxShadow: '0 20px 60px rgba(0,0,0,.2)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="ff" style={{ fontFamily: 'Fraunces,serif', fontSize: '1.1rem', fontWeight: 900 }}>
            Je hebt de quiz al gedaan
          </h2>
          <p style={{ color: 'var(--mid)', fontSize: '0.9rem', lineHeight: 1.5 }}>
            Per account kun je de quiz één keer doen. Je uitslag staat in je overzicht en is voor ons zichtbaar in het
            gebruikersoverzicht (marketing, geen wijzigen).
          </p>
          <button type="button" className="btn" style={{ marginTop: 12, fontWeight: 800 }} onClick={onClose}>
            Sluiten
          </button>
        </div>
      </div>,
      document.body,
    )
  }

  const topCauses = (result?.topIds ?? [])
    .map((id) => causes.find((c) => c.id === id))
    .filter((c): c is LegacyCbfCause => c != null)

  const goToCause = (id: number) => {
    onClose()
    navigate(`/goede-doelen?causeId=${id}`)
  }

  const openCausesList = useCallback(() => {
    if (!result) return
    onApply({ filterCat: result.filterCat, topIds: result.topIds })
    onClose()
  }, [onApply, onClose, result])

  const el = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cause-quiz-title"
      className="cause-quiz-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        background: 'rgba(15, 28, 94, 0.55)',
        backdropFilter: 'blur(6px)',
        overflow: 'auto',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 'min(100%, 520px)',
          maxHeight: 'min(92vh, 720px)',
          overflow: 'auto',
          background: '#fff',
          borderRadius: 20,
          boxShadow: '0 20px 60px rgba(0,0,0,.2)',
          border: '1.5px solid var(--border, #e5e7eb)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 18px 10px',
            borderBottom: '1px solid var(--border, #e5e7eb)',
          }}
        >
          <h2
            id="cause-quiz-title"
            className="ff"
            style={{ fontFamily: 'Fraunces,serif', fontSize: '1.1rem', fontWeight: 900, margin: 0 }}
          >
            {step === 4 ? 'Jouw top 10 goede doelen' : 'Doelen-quiz'}
          </h2>
          <button type="button" className="btn btn-sm btn-outline" onClick={onClose} style={{ fontWeight: 700 }} aria-label="Sluiten">
            ✕
          </button>
        </div>
        <div style={{ padding: 18 }}>
          {step === 0 ? (
            <>
              <p className="hint" style={{ fontSize: '0.88rem', color: 'var(--mid)', lineHeight: 1.5, marginBottom: 8 }}>
                Stap 1/4 — Kies alles dat bij je past. <strong>Volgorde = prioriteit</strong> (1 = sterkst).
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {CAUSE_QUIZ_THEMES.map((t) => {
                  const on = ordered.includes(t.id)
                  const pos = on ? ordered.indexOf(t.id) + 1 : 0
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setOrdered((p) => toggleOrdered(p, t.id))}
                      className="btn"
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        textAlign: 'left' as const,
                        padding: '10px 12px',
                        borderRadius: 12,
                        border: on ? '2px solid #1a237e' : '1.5px solid var(--border, #e5e7eb)',
                        background: on ? 'linear-gradient(135deg,#eff6ff,#fff)' : '#fafafa',
                        fontWeight: 600,
                        fontSize: '0.82rem',
                        position: 'relative' as const,
                        minHeight: 64,
                      }}
                    >
                      {on ? (
                        <span
                          style={{
                            position: 'absolute',
                            top: 6,
                            right: 6,
                            width: 20,
                            height: 20,
                            borderRadius: '50%',
                            background: '#1a237e',
                            color: '#fff',
                            fontSize: 10,
                            fontWeight: 900,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {pos}
                        </span>
                      ) : null}
                      <span style={{ fontSize: '1.1rem' }}>{t.emoji}</span>
                      {t.label}
                    </button>
                  )
                })}
              </div>
            </>
          ) : null}
          {step === 1 ? (
            <>
              <p className="hint" style={{ fontSize: '0.88rem', color: 'var(--mid)', marginBottom: 12 }}>Stap 2/4 — Waar zie je de impact het liefst?</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {IMPACT_OPTS.map((o) => (
                  <label
                    key={o.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      padding: 10,
                      borderRadius: 12,
                      border: impact === o.id ? '2px solid #1a237e' : '1px solid #e5e7eb',
                      cursor: 'pointer',
                      background: impact === o.id ? '#f0f7ff' : '#fff',
                    }}
                  >
                    <input
                      type="radio"
                      name="impact"
                      checked={impact === o.id}
                      onChange={() => setImpact(o.id)}
                      style={{ marginTop: 3 }}
                    />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{o.label}</div>
                      <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>{o.hint}</div>
                    </div>
                  </label>
                ))}
              </div>
            </>
          ) : null}
          {step === 2 ? (
            <>
              <p className="hint" style={{ fontSize: '0.88rem', color: 'var(--mid)', marginBottom: 12 }}>Stap 3/4 — Welk type organisaties spreekt je het meest aan?</p>
              {ORG_OPTS.map((o) => (
                <label
                  key={o.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    padding: 10,
                    borderRadius: 12,
                    border: orgStyle === o.id ? '2px solid #1a237e' : '1px solid #e5e7eb',
                    cursor: 'pointer',
                    marginBottom: 8,
                    background: orgStyle === o.id ? '#f0f7ff' : '#fff',
                  }}
                >
                  <input type="radio" name="org" checked={orgStyle === o.id} onChange={() => setOrgStyle(o.id)} style={{ marginTop: 3 }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{o.label}</div>
                    <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>{o.hint}</div>
                  </div>
                </label>
              ))}
            </>
          ) : null}
          {step === 3 ? (
            <>
              <p className="hint" style={{ fontSize: '0.88rem', color: 'var(--mid)', marginBottom: 12 }}>Stap 4/4 — Wat is nu je belangrijkste drive om te doneren?</p>
              {MOTIVE_OPTS.map((o) => (
                <label
                  key={o.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    padding: 10,
                    borderRadius: 12,
                    border: motivation === o.id ? '2px solid #1a237e' : '1px solid #e5e7eb',
                    cursor: 'pointer',
                    marginBottom: 8,
                    background: motivation === o.id ? '#f0f7ff' : '#fff',
                  }}
                >
                  <input
                    type="radio"
                    name="mot"
                    checked={motivation === o.id}
                    onChange={() => setMotivation(o.id)}
                    style={{ marginTop: 3 }}
                  />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{o.label}</div>
                    <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>{o.hint}</div>
                  </div>
                </label>
              ))}
            </>
          ) : null}
          {step === 4 && result ? (
            <>
              <p style={{ fontSize: '0.86rem', color: 'var(--mid)', lineHeight: 1.5, marginBottom: 12 }}>
                Gerangschikt op passendheid met jouw thema, impact, motivatie en voorkeur voor erkenning. Groen omlijnd op de
                volgende pagina (max. 10). Klik <strong>Naar doel</strong> om meteen te bekijken.
              </p>
              {canPersist && autoSave !== 'idle' ? (
                <div
                  style={{
                    marginBottom: 12,
                    padding: '10px 12px',
                    borderRadius: 10,
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    background:
                      autoSave === 'saved' ? 'linear-gradient(135deg, #ecfdf5, #d1fae5)' : autoSave === 'error' ? '#fef2f2' : '#f0f7ff',
                    color: autoSave === 'saved' ? '#065f46' : autoSave === 'error' ? '#991b1b' : '#1a237e',
                    border: `1px solid ${autoSave === 'saved' ? '#6ee7b7' : autoSave === 'error' ? '#fecaca' : '#bfdbfe'}`,
                  }}
                >
                  {autoSave === 'saving' ? 'Uitslag wordt opgeslagen op je profiel…' : null}
                  {autoSave === 'saved' ? '✓ Opgeslagen op je profiel (ook zichtbaar in admin). Je kunt nu de lijst openen.' : null}
                  {autoSave === 'error' ? (
                    <span>
                      Kon niet opslaan.{' '}
                      <button type="button" className="btn btn-sm" style={{ marginLeft: 8 }} onClick={() => void retrySave()}>
                        Opnieuw proberen
                      </button>
                    </span>
                  ) : null}
                </div>
              ) : null}
              <ol style={{ margin: 0, padding: '0 0 0 1.1rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {topCauses.map((c, i) => {
                  const meta = sectorMeta(c.sector)
                  return (
                    <li key={c.id} style={{ fontSize: '0.86rem' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <span style={{ fontWeight: 800, color: '#1a237e' }}>#{i + 1}</span>
                        <span style={{ fontWeight: 700 }}>{c.naam}</span>
                        <span className={`chip ${meta.chipClass}`} style={{ fontSize: '0.65rem' }}>{meta.label}</span>
                      </div>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => goToCause(c.id)}
                        style={{ fontWeight: 700, background: 'linear-gradient(135deg,#22c55e,#16a34a)', color: '#fff', border: 'none' }}
                      >
                        Naar doel
                      </button>
                    </li>
                  )
                })}
              </ol>
              {saveErr && autoSave === 'error' ? (
                <p style={{ color: '#b91c1c', fontSize: '0.8rem', marginTop: 4 }} role="alert">
                  {saveErr}
                </p>
              ) : null}
              {canPersist ? (
                <p style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: 8 }}>
                  Max. 1× per account. Team Donatie ziet uitslaggroepen voor marketing; geen verkoop van gegevens.
                </p>
              ) : (
                <p style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: 8 }}>Log in om je uitslag op te slaan.</p>
              )}
            </>
          ) : null}

          {step < 4 ? (
            <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
              {step > 0 ? (
                <button type="button" className="btn btn-outline" onClick={goBack} style={{ fontWeight: 700 }}>
                  Terug
                </button>
              ) : null}
              <button
                type="button"
                className="btn"
                onClick={goNext}
                disabled={step === 0 && !ordered.length}
                style={{
                  background: 'linear-gradient(135deg,#1a237e,#3a98f8)',
                  color: '#fff',
                  border: 'none',
                  fontWeight: 800,
                  flex: 1,
                  minWidth: 140,
                  opacity: step === 0 && !ordered.length ? 0.45 : 1,
                }}
              >
                {step === 3 ? 'Bereken mijn top 10' : 'Volgende'}
              </button>
            </div>
          ) : null}
          {step === 4 && result ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
              <button
                type="button"
                className="btn"
                onClick={openCausesList}
                style={{ background: 'linear-gradient(135deg,#1a237e,#3a98f8)', color: '#fff', border: 'none', fontWeight: 800 }}
              >
                Open de doelen-lijst (highlight)
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )

  return createPortal(el, document.body)
}
