/**
 * Extracts `const CBF_CAUSES = [...]` from legacy index.html into a TypeScript module.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const indexPath = path.join('C:', 'Users', 'Bryce', 'Downloads', 'index.html')
const outDir = path.join(__dirname, '..', 'src', 'features', 'legacy')
const outPath = path.join(outDir, 'cbfCauses.generated.ts')

fs.mkdirSync(outDir, { recursive: true })

const html = fs.readFileSync(indexPath, 'utf8')
const startMarker = 'const CBF_CAUSES = '
const endMarker = '];const cbfLoaded'
const i0 = html.indexOf(startMarker)
const i1 = html.indexOf(endMarker, i0)
if (i0 === -1 || i1 === -1) {
  console.error('Markers not found', { i0, i1 })
  process.exit(1)
}
const arrayLiteral = html.slice(i0 + startMarker.length, i1 + 1)

const header = `/**
 * AUTO-GENERATED — source: Downloads/index.html (const CBF_CAUSES)
 * Re-run: node scripts/extract-cbf-causes.mjs
 */
export type LegacyCbfCause = {
  id: number
  naam: string
  website: string
  paspoort: string
  sector: string
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

const body = `${header}export const CBF_CAUSES: LegacyCbfCause[] = ${arrayLiteral}
`

fs.writeFileSync(outPath, body, 'utf8')
console.log('Wrote', outPath, 'chars', body.length)
