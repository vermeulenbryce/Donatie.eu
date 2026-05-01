import { getCauseRecognitionWeight } from './cbfCauseRecognition'
import type { LegacyCbfCause } from './cbfCauses.generated'
import { isNLFocused } from './legacyCbfConstants'
import { filterAndSortCauses } from './filterCbfCauses'

export type CauseQuizThemeId = 'dieren' | 'gezondheid' | 'kinderen' | 'milieu' | 'humanitair' | 'lokaal'

export const CAUSE_QUIZ_THEMES: {
  id: CauseQuizThemeId
  emoji: string
  label: string
  filterCat: string
}[] = [
  { id: 'dieren', emoji: '🐾', label: 'Dieren & natuur', filterCat: 'DIEREN EN NATUUR' },
  { id: 'gezondheid', emoji: '💊', label: 'Gezondheid', filterCat: 'GEZONDHEID' },
  { id: 'kinderen', emoji: '👶', label: 'Kinderen, jeugd & onderwijs', filterCat: 'alle' },
  { id: 'milieu', emoji: '🌱', label: 'Milieu & klimaat', filterCat: 'MILIEU EN NATUUR' },
  { id: 'humanitair', emoji: '🤝', label: 'Internationale hulp', filterCat: 'INTERNATIONALE HULP EN MENSENRECHTEN' },
  { id: 'lokaal', emoji: '📍', label: 'Vooral lokaal (Nederland)', filterCat: 'NEDERLAND' },
]

const THEME_META = new Map(CAUSE_QUIZ_THEMES.map((t) => [t.id, t]))

const KINDEREN_PAT = /kind|jeugd|kinder|onderwijs|school|student|jongeren|pleeg/i

function themeScore(c: LegacyCbfCause, id: CauseQuizThemeId): number {
  const s = c.sector
  switch (id) {
    case 'dieren':
      return s === 'DIEREN EN NATUUR' ? 4 : 0
    case 'gezondheid':
      return s === 'GEZONDHEID' ? 4 : 0
    case 'kinderen':
      if (s === 'CULTUUR EN EDUCATIE' || s === 'SOCIAAL EN WELZIJN') return 3
      {
        const blob = `${c.naam} ${c.missie || ''} ${c.omschrijving || ''} ${(c.niches || []).join(' ')}`
        return KINDEREN_PAT.test(blob) ? 2 : 0
      }
    case 'milieu':
      return s === 'MILIEU EN NATUUR' ? 4 : 0
    case 'humanitair':
      return s === 'INTERNATIONALE HULP EN MENSENRECHTEN' ? 4 : 0
    case 'lokaal':
      return isNLFocused(c) ? 3 : 0
    default:
      return 0
  }
}

function totalThemeScore(c: LegacyCbfCause, ordered: CauseQuizThemeId[]): number {
  let sum = 0
  for (const id of ordered) {
    sum += themeScore(c, id)
  }
  return sum
}

export type CauseQuizImpact = 'nl' | 'europa' | 'wereld'
export type CauseQuizOrgStyle = 'bekend' | 'ontdek'
export type CauseQuizMotivation = 'acute' | 'structuur' | 'educatie' | 'dieren'

export type CauseQuizMatchProfile = {
  themeOrder: CauseQuizThemeId[]
  impact: CauseQuizImpact
  orgStyle: CauseQuizOrgStyle
  motivation: CauseQuizMotivation
}

export type CauseQuizAnswersV1 = {
  v: 1
  themeOrder: CauseQuizThemeId[]
  impact: CauseQuizImpact
  orgStyle: CauseQuizOrgStyle
  motivation: CauseQuizMotivation
}

function impactScore(c: LegacyCbfCause, impact: CauseQuizImpact): number {
  if (impact === 'nl') return isNLFocused(c) ? 4 : 0
  if (impact === 'wereld') return isNLFocused(c) ? 0 : 3
  return 1.2
}

function motivationScore(c: LegacyCbfCause, m: CauseQuizMotivation): number {
  const s = c.sector
  switch (m) {
    case 'acute':
      return s === 'INTERNATIONALE HULP EN MENSENRECHTEN' ? 3 : 0
    case 'structuur':
      return s === 'MILIEU EN NATUUR' || s === 'SOCIAAL EN WELZIJN' ? 2.5 : 0
    case 'educatie':
      return s === 'CULTUUR EN EDUCATIE' ? 3 : 0
    case 'dieren':
      return s === 'DIEREN EN NATUUR' ? 3 : 0
    default:
      return 0
  }
}

function recognitionComponent(c: LegacyCbfCause, orgStyle: CauseQuizOrgStyle): number {
  const w = getCauseRecognitionWeight(c)
  if (orgStyle === 'bekend') return w * 0.0012
  return (2200 - Math.min(w, 2000)) * 0.0009
}

function totalScoreV2(c: LegacyCbfCause, profile: CauseQuizMatchProfile): number {
  const th = totalThemeScore(c, profile.themeOrder)
  const im = impactScore(c, profile.impact)
  const mot = motivationScore(c, profile.motivation)
  const rec = recognitionComponent(c, profile.orgStyle)
  return th * 8 + im * 3 + mot * 2 + rec
}

export function toPersistedAnswersV1(p: CauseQuizMatchProfile): CauseQuizAnswersV1 {
  return {
    v: 1,
    themeOrder: [...p.themeOrder],
    impact: p.impact,
    orgStyle: p.orgStyle,
    motivation: p.motivation,
  }
}

/** Eerst gekozen thema bepaalt het filter in de doelen-lijst (bijv. kinderen = alle). */
export function primaryFilterFromOrder(ordered: CauseQuizThemeId[]): string {
  if (!ordered.length) return 'alle'
  const t = THEME_META.get(ordered[0])
  return t?.filterCat ?? 'alle'
}

/**
 * Top N doelen binnen filter; ranking via thema, impact, motivatie, bekend/ontdek.
 */
export function matchCausesToQuiz(
  causes: LegacyCbfCause[],
  profile: CauseQuizMatchProfile,
  topN = 10,
): { filterCat: string; topIds: number[] } {
  const ordered = profile.themeOrder
  if (!causes.length || !ordered.length) {
    return { filterCat: primaryFilterFromOrder(ordered), topIds: [] }
  }
  const filterCat = primaryFilterFromOrder(ordered)
  const pool = filterAndSortCauses(causes, { filterCat, search: '', sort: 'bekendheid' })
  const poolSet = new Set(pool.map((c) => c.id))
  if (!pool.length) {
    return { filterCat, topIds: [] }
  }
  const scored = causes
    .filter((c) => poolSet.has(c.id))
    .map((c) => ({ c, score: totalScoreV2(c, profile) }))
  scored.sort((a, b) => b.score - a.score || a.c.naam.localeCompare(b.c.naam, 'nl'))
  const topIds: number[] = []
  for (const { c } of scored) {
    if (topIds.length >= topN) break
    topIds.push(c.id)
  }
  while (topIds.length < topN && topIds.length < pool.length) {
    const next = pool.find((c) => !topIds.includes(c.id))
    if (next) topIds.push(next.id)
    else break
  }
  return { filterCat, topIds: topIds.slice(0, topN) }
}
