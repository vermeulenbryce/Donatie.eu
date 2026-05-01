import DOMPurify from 'dompurify'
import type { Config } from 'dompurify'

/** Alleen wat de Donnie-engine gebruikt: vet/cursief, regeleindenes, PDF-knop. */
const DONNIE_BUBBLE_CONFIG: Config = {
  ALLOWED_TAGS: ['br', 'strong', 'b', 'em', 'i', 'button'],
  ALLOWED_ATTR: ['type', 'class', 'data-donnie-pdf'],
}

export function sanitizeDonnieBubbleHtml(html: string): string {
  return DOMPurify.sanitize(html, DONNIE_BUBBLE_CONFIG)
}
