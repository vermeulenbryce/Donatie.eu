/**
 * Mirrors `SECTOR_META` + `sectorMeta()` from legacy index.html (CBF sector codes).
 * Extra keys cover sector strings used in `CBF_CAUSES` that differ from the original map.
 */
export type LegacySectorVisual = {
  emoji: string
  color: string
  color2: string
  chipClass: string
  label: string
}

export const SECTOR_META: Record<string, LegacySectorVisual> = {
  GEZONDHEID: { emoji: '💊', color: '#FFE8F0', color2: '#FFB3CC', chipClass: 'chip-pink', label: 'Gezondheid' },
  DIEREN: { emoji: '🐾', color: '#E8F4FF', color2: '#B3D9FF', chipClass: 'chip-blue', label: 'Dieren' },
  /** Sectorlabel uit CBF-export */
  'DIEREN EN NATUUR': { emoji: '🐾', color: '#E8F4FF', color2: '#B3D9FF', chipClass: 'chip-blue', label: 'Dieren' },
  'NATUUR EN MILIEU': { emoji: '🌱', color: '#E8F5E9', color2: '#A5D6A7', chipClass: 'chip-green', label: 'Natuur & Milieu' },
  /** Used by many CBF rows in index */
  'MILIEU EN NATUUR': { emoji: '🌱', color: '#E8F5E9', color2: '#A5D6A7', chipClass: 'chip-green', label: 'Natuur & Milieu' },
  WELZIJN: { emoji: '🤝', color: '#FFF8E1', color2: '#FFE082', chipClass: 'chip-yellow', label: 'Welzijn' },
  'SOCIAAL EN WELZIJN': { emoji: '🤝', color: '#FFF8E1', color2: '#FFE082', chipClass: 'chip-yellow', label: 'Welzijn' },
  'INTERNATIONALE HULP EN MENSENRECHTEN': {
    emoji: '🌍',
    color: '#FFF3E0',
    color2: '#FFCC80',
    chipClass: 'chip-yellow',
    label: 'Internationaal',
  },
  'ONDERWIJS EN WETENSCHAP': { emoji: '📚', color: '#EDE7F6', color2: '#D1C4E9', chipClass: 'chip-blue', label: 'Onderwijs' },
  'CULTUUR EN EDUCATIE': { emoji: '📚', color: '#EDE7F6', color2: '#D1C4E9', chipClass: 'chip-blue', label: 'Cultuur & educatie' },
  'RELIGIE EN LEVENSBESCHOUWING': { emoji: '🕊️', color: '#F3E5F5', color2: '#CE93D8', chipClass: 'chip-pink', label: 'Religie' },
  'KUNST EN CULTUUR': { emoji: '🎭', color: '#FCE4EC', color2: '#F8BBD0', chipClass: 'chip-pink', label: 'Kunst & Cultuur' },
  SPORT: { emoji: '🏆', color: '#E0F7FA', color2: '#80DEEA', chipClass: 'chip-blue', label: 'Sport' },
}

const FALLBACK: LegacySectorVisual = {
  emoji: '💙',
  color: '#EBF5FF',
  color2: '#B3D9FF',
  chipClass: 'chip-blue',
  label: '',
}

export function sectorMeta(sector: string): LegacySectorVisual {
  const m = SECTOR_META[sector]
  if (m) return m
  return { ...FALLBACK, label: sector }
}

/** Marker-kleuren per sector — `SECTOR_COLOR` + `sectorColor()` uit index */
const SECTOR_COLOR: Record<string, string> = {
  GEZONDHEID: '#e8799a',
  DIEREN: '#43A3FA',
  'DIEREN EN NATUUR': '#43A3FA',
  'NATUUR EN MILIEU': '#28c484',
  'MILIEU EN NATUUR': '#28c484',
  WELZIJN: '#f0a500',
  'SOCIAAL EN WELZIJN': '#f0a500',
  'INTERNATIONALE HULP EN MENSENRECHTEN': '#FF6B6B',
  'ONDERWIJS EN WETENSCHAP': '#6c5ce7',
  'CULTUUR EN EDUCATIE': '#6c5ce7',
}

export function sectorColor(sector: string): string {
  return SECTOR_COLOR[sector] || '#888'
}
