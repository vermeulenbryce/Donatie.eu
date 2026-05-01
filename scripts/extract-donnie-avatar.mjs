import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const indexPath = path.join('C:', 'Users', 'Bryce', 'Downloads', 'index.html')
const outPath = path.join(root, 'public', 'donnie-avatar.jpg')

const html = fs.readFileSync(indexPath, 'utf8')
const re = /id="donnieBubble"[\s\S]*?<img src="(data:image\/[^"]+)"/
const m = html.match(re)
if (!m) {
  console.error('Could not find donnieBubble img')
  process.exit(1)
}
const dataUrl = m[1]
const b64m = dataUrl.match(/^data:image\/\w+;base64,(.+)$/)
if (!b64m) {
  console.error('Invalid data URL')
  process.exit(1)
}
const buf = Buffer.from(b64m[1], 'base64')
fs.writeFileSync(outPath, buf)
console.log('Wrote', outPath, buf.length, 'bytes')
