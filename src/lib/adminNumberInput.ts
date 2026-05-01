/**
 * Gecontroleerde decimale/invoer voor admin-velden. Voorkomt o.a. `Number('') === 0`
 * bij <input type="number" />, zodat backspace echt leeg is en "6" geen "06" oplevert (na normalisatie).
 */
export function isPartialDecimal(s: string): boolean {
  if (s === '') return true
  return /^\d*[.,]?\d*$/.test(s)
}

export function parseDecimalOrNull(s: string): number | null {
  const t = s.replace(',', '.').trim()
  if (t === '') return null
  const n = parseFloat(t)
  return Number.isFinite(n) ? n : null
}

/** Leesbare string voor in het veld; geen onnodige .00. */
export function numberToInputString(n: number): string {
  if (!Number.isFinite(n)) return ''
  return n % 1 === 0 ? String(Math.trunc(n)) : String(n)
}
