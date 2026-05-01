import { FAQ_ITEMS } from './demoPublicData'

/** Publieke weergave van één FAQ-regel */
export type FaqPublicItem = { q: string; a: string; category?: string }

export type FaqDbShape = {
  id: string
  question: string
  answer: string
  category: string
  sort_order: number
  active: boolean
}

export function normalizeFaqQuestion(q: string): string {
  return q.trim().replace(/\s+/g, ' ').toLowerCase()
}

/** Test-/fout vragen zoals „wie ben ik” niet op /faq tonen */
export function isExcludedFaqQuestion(q: string): boolean {
  const t = q.trim()
  return /^(wie\s+ben\s+(je|ik)\b|who\s+are\s+you\b)/i.test(t)
}

/** Koppelt een vaste basis-slot aan een DB-regel (zelfde logica als publieke merge). */
export function pickBasisSlotRow(
  slotIndex: number,
  template: { q: string },
  dbRows: FaqDbShape[],
  usedIds: Set<string>,
): FaqDbShape | null {
  const n = normalizeFaqQuestion(template.q)
  const pool = dbRows.filter((r) => !usedIds.has(r.id))
  const sameText = pool.filter((r) => normalizeFaqQuestion(r.question) === n)
  const basisMatch = sameText.find((r) => r.category === 'basis')
  if (basisMatch) return basisMatch
  if (sameText.length) return sameText[0] ?? null

  const lo = slotIndex * 10
  const hi = lo + 9
  const slotRow = pool.find(
    (r) => r.category === 'basis' && r.sort_order >= lo && r.sort_order <= hi,
  )
  return slotRow ?? null
}

/**
 * Publieke FAQ: per vaste slot eerst DB (als actief), anders template uit code.
 * Overige DB-regels (extra vragen) eronder, gesorteerd op sort_order.
 */
export function mergePublicFaqFromDb(dbRows: FaqDbShape[]): FaqPublicItem[] {
  const active = dbRows.filter((r) => r.active)
  const used = new Set<string>()
  const block: FaqPublicItem[] = []

  for (let i = 0; i < FAQ_ITEMS.length; i++) {
    const f = FAQ_ITEMS[i]
    const hit = pickBasisSlotRow(i, f, active, used)
    if (hit) {
      used.add(hit.id)
      if (isExcludedFaqQuestion(hit.question)) {
        block.push({ q: f.q, a: f.a })
      } else {
        block.push({
          q: hit.question.trim(),
          a: hit.answer.trim(),
          category: hit.category,
        })
      }
    } else {
      block.push({ q: f.q, a: f.a })
    }
  }

  const faqNorms = new Set(FAQ_ITEMS.map((x) => normalizeFaqQuestion(x.q)))
  const extras = active
    .filter((r) => !used.has(r.id))
    .filter((r) => {
      const nq = normalizeFaqQuestion(r.question)
      if (faqNorms.has(nq)) return false
      if (isExcludedFaqQuestion(r.question)) return false
      return true
    })
    .sort((a, b) => a.sort_order - b.sort_order)

  for (const r of extras) {
    block.push({
      q: r.question.trim(),
      a: r.answer.trim(),
      category: r.category,
    })
  }

  return block
}
