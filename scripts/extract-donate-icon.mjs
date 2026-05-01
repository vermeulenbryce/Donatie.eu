import fs from 'node:fs'

const html = fs.readFileSync('C:/Users/Bryce/Downloads/index.html', 'utf8')
const marker = 'class="cause-donate-btn mt16"'
const imgTag = '<img src="data:image/jpeg;base64,'
const i0 = html.indexOf(marker)
const i1 = html.indexOf(imgTag, i0)
if (i0 === -1 || i1 === -1) {
  console.error('markers not found', { i0, i1 })
  process.exit(1)
}
const b64Start = i1 + imgTag.length
const b64End = html.indexOf('"', b64Start)
const b64 = html.slice(b64Start, b64End)
const out = new URL('../public/legacy-cause-donate-icon.jpg', import.meta.url)
fs.writeFileSync(out, Buffer.from(b64, 'base64'))
console.log('wrote', out.pathname, fs.statSync(out).size)
