import { isSupabaseConfigured, supabase } from '../../lib/supabase'
import type { LegacyShellUser } from '../../context/LegacyUiSessionContext'

/** Zelfde vorm als `legacy-admin-index.html` → admin leest `localStorage['dnl_meldingen']`. */
export type DnlStoredFondsenwerverMelding = {
  id: string
  naam: string
  adres: string
  org: string
  tijd: string
  omschrijving: string
  email: string
  ingedienDoor: string
  timestamp: string
}

function readStored(): DnlStoredFondsenwerverMelding[] {
  try {
    const raw = localStorage.getItem('dnl_meldingen')
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? (arr as DnlStoredFondsenwerverMelding[]) : []
  } catch {
    return []
  }
}

function persist(row: DnlStoredFondsenwerverMelding) {
  const next = readStored()
  next.unshift(row)
  localStorage.setItem('dnl_meldingen', JSON.stringify(next))
}

async function notifySupabaseConfirmation(
  userId: string,
  meldId: string,
  orgName: string,
  adres: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false
  const body =
    `Uw melding over ${orgName} op ${adres} is ingediend. Ons team neemt binnen 3 werkdagen contact op. Meldingsnummer: ${meldId}.`.trim()

  const { error } = await supabase.from('site_notifications').insert({
    type: 'melding',
    from_user_id: userId,
    target_user_id: null,
    title: `Melding ontvangen — ${meldId}`,
    body,
    icon: '🚨',
    data: { kind: 'fondsenwerver', meldingsnummer: meldId, ...payload },
  })
  return !error
}

export async function submitFondsenwerverMelding(params: {
  shell: LegacyShellUser | null
  naam: string
  adres: string
  org: string
  tijd: string /** ISO-compatible string from datetime-local value */
  omschrijving: string
  email: string
}): Promise<{ meldId: string }> {
  const meldId = `MLG-${Date.now()}`
  const ingedienDoor =
    params.shell?.source === 'session' && params.shell.email ? params.shell.email : 'anoniem'

  const row: DnlStoredFondsenwerverMelding = {
    id: meldId,
    naam: params.naam.trim(),
    adres: params.adres.trim(),
    org: params.org.trim(),
    tijd: params.tijd.trim(),
    omschrijving: params.omschrijving.trim(),
    email: params.email.trim(),
    ingedienDoor,
    timestamp: new Date().toISOString(),
  }

  persist(row)

  if (params.shell?.source === 'session' && params.shell.user?.id) {
    const orgName = params.org.trim() || 'een onbekende werver'
    await notifySupabaseConfirmation(params.shell.user.id, meldId, orgName, row.adres, {
      naam: row.naam,
      adres: row.adres,
      org: row.org,
      tijd: row.tijd,
      omschrijving: row.omschrijving,
      contact_email: row.email || null,
    })
  }

  return { meldId }
}
