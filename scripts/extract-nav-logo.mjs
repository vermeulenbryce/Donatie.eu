import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const indexPath = path.join('C:', 'Users', 'Bryce', 'Downloads', 'index.html')
const outPath = path.join(__dirname, '..', 'public', 'logo-nav.jpg')

const html = fs.readFileSync(indexPath, 'utf8')
const re = /class="logo-heart"><img src="data:image\/jpeg;base64,([^"]+)"/
const m = html.match(re)
if (!m) {
  console.error('Pattern not found')
  process.exit(1)
}
const buf = Buffer.from(m[1], 'base64')
fs.writeFileSync(outPath, buf)
console.log('Wrote', outPath, buf.length, 'bytes')
