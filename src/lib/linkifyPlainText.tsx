import { Fragment, type ReactNode } from 'react'

/** Vangt http(s) en mailto: in platte tekst; geen ruwe HTML. */
const TOKEN =
  /\b(https?:\/\/[^\s<]+[^\s<.,);!?]|mailto:[^\s<]+[^\s<.,);!?]?|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b)/gi

function isAllowedHttpOrMailto(s: string): boolean {
  if (/^mailto:/i.test(s)) return true
  if (/^https?:\/\//i.test(s)) return true
  return false
}

function isBareEmail(s: string): boolean {
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(s)
}

/**
 * Zet urls en e-mailadressen om in klikbare links (geschikt voor notificatie-/inboxbody).
 */
export function linkifyPlainText(text: string): ReactNode {
  if (!text) return null
  const parts: ReactNode[] = []
  let last = 0
  let k = 0
  TOKEN.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = TOKEN.exec(text)) !== null) {
    const raw = m[0]
    const start = m.index
    if (start > last) {
      parts.push(text.slice(last, start))
    }

    let href = raw
    let display = raw
    if (isBareEmail(raw)) {
      href = `mailto:${raw}`
      display = raw
      parts.push(
        <a
          key={`l-${k++}`}
          href={href}
          style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}
        >
          {display}
        </a>,
      )
    } else if (isAllowedHttpOrMailto(raw)) {
      parts.push(
        <a
          key={`l-${k++}`}
          href={raw}
          target={/^mailto:/i.test(raw) ? undefined : '_blank'}
          rel={/^mailto:/i.test(raw) ? undefined : 'noopener noreferrer'}
          style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}
        >
          {display}
        </a>,
      )
    } else {
      parts.push(raw)
    }
    last = start + raw.length
  }
  if (last < text.length) {
    parts.push(text.slice(last))
  }
  return parts.length === 0 ? text : parts.length === 1 ? parts[0]! : <Fragment>{parts}</Fragment>
}
