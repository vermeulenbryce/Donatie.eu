import type { LegacyCbfCause } from './cbfCauses.generated'

/**
 * Gecureerde "naamsbekendheid" in Nederland (hoger = vaker algemeen bekend).
 * Onderhoud: uitbreiden per slug uit `cbfCauses.generated.ts`.
 * Sorteren: aflopend, daarna A–Z op naam. Zonder score: heuristiek (o.a. CBF-categorie E, ouder stichtingsjaar).
 */
const BY_SLUG: Readonly<Record<string, number>> = {
  // — Milieu & natuur (top-herkenning)
  'greenpeace-nederland': 1000,
  natuurmonumenten: 995,
  milieudefensie: 990,
  aap: 920,
  dierenbescherming: 900,
  'world-animal-protection': 880,
  'vogelbescherming-nederland': 860,
  'bont-voor-dieren': 800,

  // — Internationale hulp & mensenrechten
  'unicef-nederland': 1000,
  'artsen-zonder-grenzen': 995,
  'oxfam-novib': 980,
  'rode-kruis': 990,
  'amnesty-international': 970,
  cordaid: 960,
  'care-nederland': 900,
  'save-the-children': 950,
  'terre-des-hommes-nederland': 920,
  'vluchtelingenwerk-nederland': 960,
  'wilde-ganzen': 880,
  'plan-international-nederland': 910,

  // — Gezondheid
  'kwf-kankerbestrijding': 1000,
  hartstichting: 960,
  nierstichting: 950,
  hersenstichting: 950,
  reumanederland: 900,
  kika: 920,
  'als-nederland': 900,
  aidsfonds: 900,

  // — Welzijn & sociaal
  'leger-des-heils-fondsenwerving': 980,
  'voedselbanken-nederland': 960,
  cliniclowns: 820,
  'war-child': 980,

  // — Cultuur, sport, educatie
  'ajax-foundation': 720,
  'het-cultuurfonds': 900,
  openluchtmuseum: 880,
  'het-concertgebouw-fonds': 860,
  'imc-weekendschool': 820,
  'amsterdams-universiteitsfonds': 780,
  'de-hollandsche-molen': 620,
  agape: 360,
}

function slugWeight(slug: string | undefined): number | null {
  if (!slug) return null
  const w = BY_SLUG[slug]
  return w !== undefined ? w : null
}

function heuristicWeight(c: LegacyCbfCause): number {
  let w = 0
  if (c.categorie === 'E') w += 40
  const y = c.erkend_jaar
  if (typeof y === 'number' && y > 0) {
    if (y <= 1990) w += 25
    else if (y <= 2000) w += 15
    else if (y <= 2010) w += 8
  }
  const n = c.niches?.length ?? 0
  if (n >= 3) w += 5
  else if (n >= 1) w += 2
  return w
}

/**
 * Hoe hoger, hoe "bekender" in het grote publiek — zelfde soort sorteren binnen elk sectorfilter.
 */
export function getCauseRecognitionWeight(c: LegacyCbfCause): number {
  const s = slugWeight(c.slug)
  if (s != null) return s
  return heuristicWeight(c)
}
