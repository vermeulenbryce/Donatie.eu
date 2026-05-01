/**
 * Scrape het CBF-register (https://www.cbf.nl/register-goede-doelen)
 * en daarna per organisatie `/organisaties/<slug>` voor details.
 *
 * Genereert: src/features/legacy/cbfCauses.generated.ts
 *
 * Gebruikt de bestaande LegacyCbfCause-structuur zodat publieke pagina's niet breken.
 * Lat/lng worden standaard 0/0 tenzij bekend uit de fallback-data.
 *
 * Re-run: node scripts/scrape-cbf-register.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.join(__dirname, '..')
const outDir = path.join(projectRoot, 'src', 'features', 'legacy')
const outPath = path.join(outDir, 'cbfCauses.generated.ts')
const fallbackPath = path.join(outDir, 'cbfCauses.fallback.json')
const existingPath = outPath // zelfde file, we parsen huidige data voor lat/lng overrides
const anbiXmlPath = path.join(__dirname, 'anbi-data', 'anbi.xml')

const BASE = 'https://www.cbf.nl'
const REGISTER_URL = `${BASE}/register-goede-doelen`
const USER_AGENT =
  'Mozilla/5.0 (compatible; Donatie.eu CBF Aggregator; +https://donatie.eu)'

const CONCURRENCY = 6
const DELAY_BETWEEN_REQUESTS_MS = 150

// Vertaal CBF-sectorlabels naar de legacy ALL CAPS sectoren die de publieke UI verwacht.
const SECTOR_MAP = {
  'Dieren': 'DIEREN EN NATUUR',
  'Gezondheid': 'GEZONDHEID',
  'Internationale hulp en mensenrechten': 'INTERNATIONALE HULP EN MENSENRECHTEN',
  'Kunst en cultuur': 'CULTUUR EN EDUCATIE',
  'Natuur en milieu': 'MILIEU EN NATUUR',
  'Onderwijs en wetenschap': 'CULTUUR EN EDUCATIE',
  'Religie en levensbeschouwing': 'SOCIAAL EN WELZIJN',
  'Welzijn': 'SOCIAAL EN WELZIJN',
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchHtml(url) {
  const resp = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html',
      'Accept-Language': 'nl,en;q=0.8',
    },
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`)
  return await resp.text()
}

function extractOrganizationLinks(html) {
  const re = /href="\/organisaties\/([a-z0-9][a-z0-9-]*)"[^>]*>([^<]+)</gi
  const out = new Map()
  let m
  while ((m = re.exec(html)) != null) {
    const slug = m[1]
    const label = m[2].trim()
    if (!out.has(slug)) out.set(slug, label)
  }
  return out
}

function decodeHtml(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

function stripTags(s) {
  return decodeHtml(String(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
}

function firstMatch(html, regex) {
  const m = html.match(regex)
  return m ? m[1] : null
}

function extractDetailFields(slug, html) {
  const naam =
    stripTags(firstMatch(html, /<h1[^>]*font-bold[^>]*>([\s\S]*?)<\/h1>/i) ?? '') || slug

  // Tagline direct na h1 — <div class="p-intro ...">...</div>
  const tagline = stripTags(
    firstMatch(html, /class="p-intro[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ?? '',
  )

  // Dit willen we oplossen
  const ditWillen = stripTags(
    firstMatch(
      html,
      /Dit willen we oplossen<\/h3>\s*<div[^>]*>([\s\S]*?)<\/div>/i,
    ) ?? '',
  )

  // Dit is waar we trots op zijn
  const ditTrots = stripTags(
    firstMatch(
      html,
      /Dit is waar we trots op zijn<\/h3>\s*<div[^>]*>([\s\S]*?)<\/div>/i,
    ) ?? '',
  )

  // Website
  const website =
    firstMatch(
      html,
      /<a\s+href="(https?:\/\/[^"]+)"[^>]*>\s*Naar de organisatie website/i,
    ) ?? ''

  // Sector: h3 "Sector" gevolgd door <p>...</p>
  const sectorRaw = stripTags(
    firstMatch(
      html,
      /<h3[^>]*>\s*Sector\s*<\/h3>\s*<p[^>]*>([\s\S]*?)<\/p>/i,
    ) ?? '',
  )
  const cbfSector = Object.keys(SECTOR_MAP).find((k) => sectorRaw.startsWith(k)) ?? sectorRaw
  const sector = SECTOR_MAP[cbfSector] || 'SOCIAAL EN WELZIJN'

  // Erkend sinds: h3 "Erkend sinds" gevolgd door <p>...</p>
  const erkendRaw = stripTags(
    firstMatch(
      html,
      /<h3[^>]*>\s*Erkend sinds\s*<\/h3>\s*<p[^>]*>([\s\S]*?)<\/p>/i,
    ) ?? '',
  )
  const erkendYearMatch = erkendRaw.match(/(\d{4})/)
  const erkendJaar = erkendYearMatch ? Number(erkendYearMatch[1]) : 0

  const missie = tagline || ditWillen || ditTrots
  const omschrijving = ditWillen || tagline || ditTrots
  const paspoort = `${BASE}/organisaties/${slug}`

  return {
    slug,
    naam,
    missie,
    omschrijving,
    sector,
    sector_cbf: cbfSector,
    erkend_jaar: erkendJaar,
    website,
    paspoort,
  }
}

async function scrapeSlugs() {
  console.log('Fetching register page...')
  const html = await fetchHtml(REGISTER_URL)
  const map = extractOrganizationLinks(html)
  console.log(`Found ${map.size} candidate organizations on register page.`)
  return map
}

async function scrapeDetail(slug) {
  const url = `${BASE}/organisaties/${slug}`
  try {
    const html = await fetchHtml(url)
    return extractDetailFields(slug, html)
  } catch (e) {
    console.warn('! detail fail', slug, e.message)
    return null
  }
}

async function mapPool(items, worker, concurrency) {
  const results = new Array(items.length)
  let idx = 0
  async function runner() {
    while (idx < items.length) {
      const myIdx = idx++
      const v = items[myIdx]
      results[myIdx] = await worker(v, myIdx)
      if (DELAY_BETWEEN_REQUESTS_MS) await sleep(DELAY_BETWEEN_REQUESTS_MS)
    }
  }
  await Promise.all(Array.from({ length: concurrency }, runner))
  return results
}

function loadFallback() {
  if (!fs.existsSync(fallbackPath)) return []
  try {
    return JSON.parse(fs.readFileSync(fallbackPath, 'utf8'))
  } catch {
    return []
  }
}

function normalizeName(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(stichting|vereniging|de|het|een|nederland|nederlandse|fonds|fondsenwerving|fondation|fund|foundation|nl|be|belgie|holland)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function domainOf(url) {
  if (!url) return ''
  try {
    const u = new URL(url)
    return u.hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return String(url)
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .split(/[\/?#]/)[0]
      .toLowerCase()
  }
}

const ANBI_ZIP_URL = 'https://download.belastingdienst.nl/data/anbi/anbi.zip'

async function ensureAnbiDataset() {
  if (fs.existsSync(anbiXmlPath)) return true
  const zipPath = path.join(__dirname, 'anbi-data.zip')
  const destDir = path.join(__dirname, 'anbi-data')
  try {
    console.log('ANBI dataset niet lokaal aanwezig — downloaden van Belastingdienst...')
    const resp = await fetch(ANBI_ZIP_URL, { headers: { 'User-Agent': USER_AGENT } })
    if (!resp.ok) throw new Error(`HTTP ${resp.status} bij ANBI download`)
    const buf = Buffer.from(await resp.arrayBuffer())
    fs.mkdirSync(destDir, { recursive: true })
    fs.writeFileSync(zipPath, buf)
    // Gebruik PowerShell's Expand-Archive (cross-platform-ish voor deze repo op Windows).
    execSync(`powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`, {
      stdio: 'ignore',
    })
    console.log('ANBI dataset gedownload en uitgepakt.')
    return fs.existsSync(anbiXmlPath)
  } catch (e) {
    console.warn('ANBI dataset ophalen mislukt:', e.message)
    return false
  }
}

/**
 * Parse het ANBI XML-bestand uit de Belastingdienst open-data.
 * Returned index op genormaliseerde naam + alias + domein van website,
 * alleen actieve ANBIs (geen einddatum / intrekkingsDatum in het verleden).
 */
function loadAnbiIndex() {
  if (!fs.existsSync(anbiXmlPath)) {
    console.warn('ANBI XML niet gevonden:', anbiXmlPath)
    return { byName: new Map(), byDomain: new Map(), count: 0 }
  }
  const xml = fs.readFileSync(anbiXmlPath, 'utf8')
  const byName = new Map()
  const byDomain = new Map()
  const blockRe = /<beschikking>([\s\S]*?)<\/beschikking>/g
  const today = new Date().toISOString().slice(0, 10)
  let m
  let active = 0
  while ((m = blockRe.exec(xml)) != null) {
    const chunk = m[1]
    const fld = (name) => {
      const mm = chunk.match(new RegExp(`<${name}>([^<]*)</${name}>`))
      return mm ? mm[1].trim() : ''
    }
    const eindDatum = fld('eindDatum') || fld('einddatum')
    const intrekkingsDatum = fld('intrekkingsDatum') || fld('intrekkingsdatum')
    if (eindDatum && eindDatum <= today) continue
    if (intrekkingsDatum && intrekkingsDatum <= today) continue
    const naam = fld('naam')
    const alias = fld('aliasNaam')
    const website = fld('webSite')
    const nKey = normalizeName(naam)
    const aKey = normalizeName(alias)
    if (nKey) byName.set(nKey, { naam, website })
    if (aKey) byName.set(aKey, { naam, website })
    const d = domainOf(website)
    if (d) byDomain.set(d, { naam, website })
    active++
  }
  return { byName, byDomain, count: active }
}

/**
 * Laad de originele CBF_CAUSES uit de legacy `Downloads/index.html` bron voor
 * handmatig verrijkte velden (lat, lng, plaats, niches, categorie). Zo behouden
 * we de kaartmarkers en categorieën. Deze bron wordt alleen gelezen, nooit geschreven.
 */
function loadLegacyOverrides() {
  const legacyPath = 'C:/Users/Bryce/Downloads/index.html'
  if (!fs.existsSync(legacyPath)) return new Map()
  const html = fs.readFileSync(legacyPath, 'utf8')
  const i0 = html.indexOf('const CBF_CAUSES = ')
  const i1 = html.indexOf('];const cbfLoaded', i0)
  if (i0 < 0 || i1 < 0) return new Map()
  const arr = html.slice(i0 + 'const CBF_CAUSES = '.length, i1 + 1)
  const overrides = new Map()
  const objRe = /\{\s*id:\d+[^}]*\}/g
  let m
  while ((m = objRe.exec(arr)) != null) {
    const chunk = m[0]
    const get = (field, isString) => {
      const re = isString
        ? new RegExp(`${field}:\\s*'([^']*)'`)
        : new RegExp(`${field}:\\s*([-0-9.]+)`)
      const mm = chunk.match(re)
      return mm ? mm[1] : null
    }
    const naam = get('naam', true)
    if (!naam) continue
    const lat = Number(get('lat', false))
    const lng = Number(get('lng', false))
    const plaats = get('plaats', true) || ''
    const categorie = get('categorie', true) || ''
    const nichesMatch = chunk.match(/niches:\s*\[([^\]]*)\]/)
    const niches = nichesMatch
      ? [...nichesMatch[1].matchAll(/'([^']*)'/g)].map((x) => x[1])
      : []
    overrides.set(naam.trim().toLowerCase(), {
      lat: Number.isFinite(lat) ? lat : 0,
      lng: Number.isFinite(lng) ? lng : 0,
      plaats,
      categorie,
      niches,
    })
  }
  return overrides
}

function writeFallback(fromGenerated) {
  // Slaat een snapshot op zodat we bij netwerkproblemen nog iets hebben.
  fs.writeFileSync(fallbackPath, JSON.stringify(fromGenerated, null, 2) + '\n', 'utf8')
}

function emitTypeScript(items) {
  const header = `/**
 * AUTO-GENERATED — source: scripts/scrape-cbf-register.mjs
 * Re-run: node scripts/scrape-cbf-register.mjs
 *
 * Bron: https://www.cbf.nl/register-goede-doelen + /organisaties/<slug>
 * Deze lijst is bedoeld voor publieke /goede-doelen pagina + admin goede doelen beheer.
 */
export type LegacyCbfCause = {
  id: number
  slug: string
  naam: string
  website: string
  paspoort: string
  sector: string
  sector_cbf?: string
  plaats: string
  lat: number
  lng: number
  categorie: string
  erkend_jaar: number
  niches: string[]
  omschrijving: string
  missie: string
  naam_statutair?: string
}

`
  const lines = items.map((it, i) => {
    const id = i + 1
    const safe = (s) =>
      JSON.stringify(typeof s === 'string' ? s : String(s ?? ''))
    const niches = JSON.stringify(it.niches ?? [])
    return `  { id:${id}, slug:${safe(it.slug)}, naam:${safe(it.naam)}, website:${safe(it.website)}, paspoort:${safe(it.paspoort)}, sector:${safe(it.sector)}, sector_cbf:${safe(it.sector_cbf ?? '')}, plaats:${safe(it.plaats ?? '')}, lat:${Number(it.lat) || 0}, lng:${Number(it.lng) || 0}, categorie:${safe(it.categorie ?? '')}, erkend_jaar:${it.erkend_jaar || 0}, niches:${niches}, omschrijving:${safe(it.omschrijving)}, missie:${safe(it.missie)} }`
  })
  return `${header}export const CBF_CAUSES: LegacyCbfCause[] = [\n${lines.join(',\n')}\n]\n`
}

async function main() {
  const start = Date.now()

  const overrides = loadLegacyOverrides()
  console.log(`Legacy overrides (lat/lng/plaats/niches/categorie) available for ${overrides.size} orgs.`)

  await ensureAnbiDataset()
  const anbi = loadAnbiIndex()
  console.log(`ANBI active entries indexed: ${anbi.count} (byName=${anbi.byName.size}, byDomain=${anbi.byDomain.size})`)

  let slugs = []
  try {
    const slugMap = await scrapeSlugs()
    slugs = [...slugMap.keys()]
  } catch (e) {
    console.warn('Register page kon niet geladen worden:', e.message)
  }

  if (slugs.length === 0) {
    console.log('Geen slugs gevonden. Terugvallen op fallback snapshot indien aanwezig.')
    const cached = loadFallback()
    if (cached.length === 0) {
      console.error('Ook geen cache beschikbaar. Abort.')
      process.exit(1)
    }
    console.log(`Write cached ${cached.length} items → ${outPath}`)
    fs.writeFileSync(outPath, emitTypeScript(cached), 'utf8')
    return
  }

  console.log(`Scraping ${slugs.length} detail pages with concurrency=${CONCURRENCY}...`)
  const rawDetails = await mapPool(
    slugs,
    async (slug, idx) => {
      const detail = await scrapeDetail(slug)
      if (idx % 20 === 0) console.log(`  ... ${idx + 1}/${slugs.length}`)
      return detail
    },
    CONCURRENCY,
  )
  const details = rawDetails.filter(Boolean)

  // Dedupe op naam (case-insensitive, trimmed). Dedupe op paspoort-URL als extra veiligheid.
  const seenName = new Set()
  const seenPas = new Set()
  const deduped = []
  for (const d of details) {
    const nameKey = d.naam.trim().toLowerCase()
    if (seenName.has(nameKey)) continue
    if (seenPas.has(d.paspoort)) continue
    seenName.add(nameKey)
    seenPas.add(d.paspoort)
    deduped.push(d)
  }

  // Merge met bestaande handmatige data (lat/lng, plaats, niches, categorie)
  for (const d of deduped) {
    const ov = overrides.get(d.naam.trim().toLowerCase())
    if (ov) {
      d.lat = ov.lat ?? 0
      d.lng = ov.lng ?? 0
      d.plaats = ov.plaats || ''
      d.niches = ov.niches || []
      d.categorie = ov.categorie || ''
    } else {
      d.lat = 0
      d.lng = 0
      d.plaats = ''
      d.niches = []
      d.categorie = ''
    }
  }

  // Filter op ANBI-status: match op naam/alias (normalized) of website-domein.
  const anbiFiltered = []
  let matchedByName = 0
  let matchedByDomain = 0
  for (const d of deduped) {
    const key = normalizeName(d.naam)
    const dom = domainOf(d.website)
    if (key && anbi.byName.has(key)) {
      anbiFiltered.push(d)
      matchedByName++
      continue
    }
    if (dom && anbi.byDomain.has(dom)) {
      anbiFiltered.push(d)
      matchedByDomain++
      continue
    }
  }
  console.log(
    `ANBI match: kept ${anbiFiltered.length}/${deduped.length} (byName=${matchedByName}, byDomain=${matchedByDomain}, dropped=${deduped.length - anbiFiltered.length})`,
  )

  anbiFiltered.sort((a, b) => a.naam.localeCompare(b.naam, 'nl'))

  console.log(`Unique ANBI+CBF orgs: ${anbiFiltered.length}`)

  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(outPath, emitTypeScript(anbiFiltered), 'utf8')
  writeFallback(anbiFiltered)

  console.log(`Done in ${((Date.now() - start) / 1000).toFixed(1)}s`)
  console.log('Wrote', outPath)
}

main().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
