/**
 * Mirrors NL filtering + category labels from legacy `index.html` (CBF goede-doelen).
 */

export const CAT_LABEL: Record<string, string> = {
  A: 'Klein (< €50k)',
  B: 'Middelklein (€50k–200k)',
  C: 'Middel (€200k–1M)',
  D: 'Groot (€1M–7,5M)',
  E: 'Zeer groot (> €7,5M)',
}

/**
 * Heuristiek: doel primair nationaal actief.
 * - Naam bevat "Nederland"/"NL" of "Nederlandse"
 * - Plaats is een NL-stad
 * - Niches bevatten typische NL-aandoeningen/termen
 * - Sector is niet internationaal
 */
export function isNLFocused(c: {
  naam?: string
  plaats?: string
  sector?: string
  niches?: string[]
}): boolean {
  const naam = (c.naam || '').toLowerCase()
  if (/nederland|nederlandse|\bnl\b/i.test(naam)) return true
  if (c.plaats && c.plaats.trim().length > 0) return true
  if ((c.sector || '') === 'INTERNATIONALE HULP EN MENSENRECHTEN') return false
  return (c.niches || []).some((n) =>
    /nederland|dutch|amsterdam|rotterdam|nationaal|voedselbank|alzheimer|diabetes|longfonds|nierstichting|reuma|parkinson|epilepsie|stichting lezen/i.test(
      n,
    ),
  )
}

export type LegacyDonateFreq = 'eenmalig' | 'maandelijks' | 'kwartaal' | 'jaarlijks'

export const FREQ_CONFIG: Record<
  LegacyDonateFreq,
  { bedragen: number[]; populair: number[]; suffix: string; badge: string }
> = {
  eenmalig: {
    bedragen: [10, 25, 50, 100, 250],
    populair: [50],
    suffix: '',
    badge: '€50 is het minimale meest gebruikte bedrag bij eenmalig',
  },
  maandelijks: {
    bedragen: [5, 10, 15, 20, 25],
    populair: [15, 20, 25],
    suffix: 'per maand',
    badge: '€15–€25 per maand is het meest gekozen',
  },
  kwartaal: {
    bedragen: [15, 25, 40, 60, 75],
    populair: [15, 20, 25],
    suffix: 'per kwartaal',
    badge: '€15–€25 per kwartaal is het meest gekozen',
  },
  jaarlijks: {
    bedragen: [25, 50, 75, 100, 150],
    populair: [15, 20, 25],
    suffix: 'per jaar',
    badge: '€15–€25 per jaar is het meest gekozen',
  },
}

export type LegacyPayMethod = {
  id: string
  label: string
  icon: string
  desc: string
  popular: boolean
}

/** `ALL_PAY_METHODS` uit index (demo: geen verborgen methodes) */
export const ALL_PAY_METHODS: LegacyPayMethod[] = [
  { id: 'applepay', label: 'Apple Pay', icon: '🍎', desc: 'Betaal met Face/Touch ID', popular: true },
  { id: 'ideal', label: 'iDEAL', icon: '🏦', desc: 'Bankbetaling Nederland', popular: true },
  { id: 'card', label: 'Creditcard', icon: '💳', desc: 'Visa / Mastercard', popular: true },
  { id: 'paypal', label: 'PayPal', icon: '🅿️', desc: 'PayPal account', popular: false },
  { id: 'sepa', label: 'SEPA Incasso', icon: '🇪🇺', desc: 'Europese bankrekening', popular: false },
  { id: 'klarna', label: 'Klarna', icon: '🟣', desc: 'Achteraf betalen', popular: false },
  { id: 'sofort', label: 'Sofort', icon: '⚡', desc: 'Direct banking', popular: false },
  { id: 'tikkie', label: 'Tikkie', icon: '📱', desc: 'Tikkie betaalverzoek', popular: false },
]
