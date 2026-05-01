/**
 * Snapshot auth-fragment uit de URL vóór `lib/supabase` de hash opruimt.
 * Moet synchroon draaien bij app-start → import deze module als allereerste in `main.tsx`.
 */

const PW_RECOVERY_STORAGE_KEY = 'donatie:pw-recovery-intent'
export const EMAIL_VERIFY_CALLBACK_KEY = 'donatie:email-verify-callback-type'

function stashPasswordRecoveryIntentFromUrl(): void {
  const path = window.location.pathname || ''
  if (path.indexOf('reset-password') === -1) return

  const hash = window.location.hash.slice(1)
  if (hash.includes('type=recovery') || hash.includes('type%3Drecovery')) {
    sessionStorage.setItem(PW_RECOVERY_STORAGE_KEY, '1')
    return
  }

  const q = new URLSearchParams(window.location.search)
  if (q.get('type') === 'recovery' || q.has('code')) {
    sessionStorage.setItem(PW_RECOVERY_STORAGE_KEY, '1')
  }
}

function stashEmailConfirmationTypeFromHash(): void {
  const path = window.location.pathname || ''
  if (path.includes('reset-password')) return

  const hash = window.location.hash.slice(1)
  if (!hash) return

  const params = new URLSearchParams(hash)
  const typ = params.get('type')
  if (typ === 'signup' || typ === 'email_change') {
    sessionStorage.setItem(EMAIL_VERIFY_CALLBACK_KEY, typ)
  }
}

if (typeof window !== 'undefined') {
  try {
    stashPasswordRecoveryIntentFromUrl()
    stashEmailConfirmationTypeFromHash()
  } catch {
    /* ignore */
  }
}
