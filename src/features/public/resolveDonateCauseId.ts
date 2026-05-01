import { CBF_CAUSES } from '../legacy/cbfCauses.generated'

/** Map legacy `donateTo` / modal labels to CBF cause id for `/goede-doelen?donate=1&causeId=` */
export function resolveDonateCauseId(donateTo: string): number | undefined {
  const q = donateTo.trim().toLowerCase()
  if (!q) return undefined

  const manual: Record<string, number> = {
    'wereld natuur fonds': 6,
    'rode kruis nederland': 7,
    'war child holland': 14,
  }
  const mid = manual[q]
  if (mid != null) return mid

  const exact = CBF_CAUSES.find((c) => c.naam.toLowerCase() === q)
  if (exact) return exact.id

  const includes = CBF_CAUSES.find(
    (c) => q.includes(c.naam.toLowerCase()) || c.naam.toLowerCase().includes(q),
  )
  return includes?.id
}
