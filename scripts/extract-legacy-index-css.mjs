/**
 * Extracts the primary inline <style> block from legacy index.html into public/donatie-legacy-index.css
 * for use as a near-exact visual replica in the React app (loaded only while PublicLayout is mounted).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const indexPath = path.join('C:', 'Users', 'Bryce', 'Downloads', 'index.html')
const outPath = path.join(__dirname, '..', 'public', 'donatie-legacy-index.css')

const html = fs.readFileSync(indexPath, 'utf8')
const start = html.indexOf('<style>')
const end = html.indexOf('</style>', start)
if (start === -1 || end === -1) {
  console.error('Could not find <style> block')
  process.exit(1)
}
let css = html.slice(start + '<style>'.length, end)

// Avoid flash-of-invisible-content: legacy hides body until .js-ready (set by inline script in index.html).
css = css.replace(/body:not\(\.js-ready\)\{visibility:hidden;\}/g, '/* removed for React SPA */')
css = css.replace(/body\.js-ready\{visibility:visible;\}/g, '/* removed for React SPA */')

const banner = `/* Auto-generated from Downloads/index.html — do not edit by hand; re-run scripts/extract-legacy-index-css.mjs */\n`
fs.writeFileSync(outPath, banner + css, 'utf8')
console.log('Wrote', outPath, 'bytes', fs.statSync(outPath).size)
