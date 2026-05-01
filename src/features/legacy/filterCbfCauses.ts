import type { LegacyCbfCause } from './cbfCauses.generated'
import { getCauseRecognitionWeight } from './cbfCauseRecognition'
import { isNLFocused } from './legacyCbfConstants'

export type CauseSortMode = 'name' | 'cat' | 'cat-E' | 'bekendheid'

export function filterAndSortCauses(
  list: LegacyCbfCause[],
  opts: {
    filterCat: string
    search: string
    sort: CauseSortMode
  },
): LegacyCbfCause[] {
  let out = [...list]
  const isNLFilter = opts.filterCat === 'NEDERLAND'
  if (isNLFilter) {
    out = out.filter((c) => isNLFocused(c))
  } else if (opts.filterCat !== 'alle') {
    out = out.filter((c) => c.sector === opts.filterCat)
  }
  if (opts.search.trim()) {
    const q = opts.search.trim().toLowerCase()
    out = out.filter(
      (c) =>
        c.naam.toLowerCase().includes(q) ||
        (c.naam_statutair || '').toLowerCase().includes(q) ||
        (c.plaats || '').toLowerCase().includes(q) ||
        (c.omschrijving || '').toLowerCase().includes(q) ||
        (c.niches || []).some((n) => n.toLowerCase().includes(q)),
    )
  }
  if (opts.sort === 'name') out.sort((a, b) => a.naam.localeCompare(b.naam, 'nl'))
  if (opts.sort === 'cat') out.sort((a, b) => a.sector.localeCompare(b.sector, 'nl'))
  if (opts.sort === 'cat-E') {
    const o: Record<string, number> = { E: 0, D: 1, C: 2, B: 3, A: 4 }
    out.sort((a, b) => (o[a.categorie] ?? 5) - (o[b.categorie] ?? 5))
  }
  if (opts.sort === 'bekendheid') {
    out.sort((a, b) => {
      const d = getCauseRecognitionWeight(b) - getCauseRecognitionWeight(a)
      if (d !== 0) return d
      return a.naam.localeCompare(b.naam, 'nl')
    })
  }
  return out
}
