import type { LegacyCbfCause } from './cbfCauses.generated'

const MIN_SENTENCES = 5

/** Ruwe splitsing in zinnen voor NL-tekst (omschrijving / missie). */
export function splitIntoSentences(text: string | undefined | null): string[] {
  if (!text?.trim()) return []
  const t = text.replace(/\s+/g, ' ').trim()
  const parts = t.split(/(?<=[.!?…])\s+/).map((s) => s.trim()).filter(Boolean)
  return parts.length ? parts : [t]
}

/**
 * Minimaal `MIN_SENTENCES` zinnen: eerst CBF + ANBI (helder voor donateurs), daarna omschrijving, missie, sector, jaar, niches, evt. afsluiter.
 */
export function buildCauseDescriptionSentences(
  c: LegacyCbfCause,
  sectorLabel: string,
): { sentences: string[]; hadRichDescription: boolean } {
  const naam = c.naam.trim() || 'Deze organisatie'
  const base: string[] = []

  base.push(
    `${naam} staat in het register van het Centraal Bureau Fondsenwerving (CBF) als erkend goed doel: transparantie en besteding worden onafhankelijk getoetst.`,
  )
  base.push(
    'Organisaties in dit kader hebben in Nederland doorgaans de status algemeen nut beogende instelling (ANBI). Donaties kunnen onder voorwaarden fiscaal voordelig zijn; zie de actuele regels op belastingdienst.nl.',
  )

  const fromOms = splitIntoSentences(c.omschrijving)
  for (const s of fromOms) {
    if (!base.some((x) => x.includes(s.slice(0, Math.min(40, s.length))))) base.push(s)
  }

  /* Missie apart op de detailpagina (callout), niet opnieuw in de lopende alinea’s */

  if (base.length < MIN_SENTENCES) {
    base.push(
      `In de sector “${sectorLabel}” draagt de organisatie bij aan maatschappelijke doelen; details over werkzaamheden en cijfers staan in het CBF-paspoort en jaarverslagen.`,
    )
  }

  if (c.erkend_jaar != null && c.erkend_jaar > 0 && base.length < MIN_SENTENCES) {
    base.push(
      `${naam} is opgenomen in het CBF-register (met erkenning rond ${c.erkend_jaar}); daarmee hoort de organisatie bij de landelijk erkende goede doelen.`,
    )
  }

  if (c.niches?.length && base.length < MIN_SENTENCES) {
    base.push(`Belangrijke aandachtsgebieden zijn onder meer: ${c.niches.join(', ')}.`)
  }

  if (c.plaats?.trim() && base.length < MIN_SENTENCES) {
    base.push(`De organisatie is ${c.erkend_jaar ? 'mede ' : ''}gevestigd in of verbonden met ${c.plaats.trim()}.`)
  }

  let i = 0
  while (base.length < MIN_SENTENCES) {
    i += 1
    base.push(
      `Voor onafhankelijke informatie over prestaties en betrouwbaarheid kun je het officiële CBF-paspoort van ${naam} raadplegen${i > 1 ? ' (extra toelichting voor volledig overzicht)' : ''}.`,
    )
    if (i > 4) break
  }

  return {
    sentences: base,
    hadRichDescription: fromOms.length >= 2,
  }
}
