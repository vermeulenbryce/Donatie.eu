import { useEffect, useState } from 'react'
import type { LocalUser } from '../../types/auth'
import {
  authStateChangedEvent,
  logoutCurrentUser,
  restoreAuthenticatedUser,
} from './authService'

export function SessionPanel() {
  const [user, setUser] = useState<LocalUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    void refreshSession()

    function onAuthStateChanged(event: Event) {
      const customEvent = event as CustomEvent<LocalUser | null>
      const nextUser = customEvent.detail
      setUser(nextUser ?? null)
      setMessage(nextUser ? `Sessie actief voor ${nextUser.email}` : 'Niet ingelogd.')
      setError('')
      setLoading(false)
    }

    window.addEventListener(authStateChangedEvent, onAuthStateChanged as EventListener)
    return () => {
      window.removeEventListener(authStateChangedEvent, onAuthStateChanged as EventListener)
    }
  }, [])

  async function refreshSession() {
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const restored = await restoreAuthenticatedUser()
      setUser(restored)
      if (restored) {
        setMessage(`Sessie hersteld voor ${restored.email}`)
      } else {
        setMessage('Geen actieve sessie gevonden.')
      }
    } catch (sessionError) {
      setError(sessionError instanceof Error ? sessionError.message : 'Sessie herstellen mislukt.')
    } finally {
      setLoading(false)
    }
  }

  async function handleLogout() {
    setError('')
    setMessage('')
    try {
      await logoutCurrentUser()
      setUser(null)
      setMessage('Uitgelogd.')
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : 'Uitloggen mislukt.')
    }
  }

  return (
    <section className="card">
      <h2>Sessie status</h2>
      <p>{loading ? 'Sessie laden...' : user ? `Ingelogd als ${user.firstName} (${user.type})` : 'Niet ingelogd'}</p>

      <div className="action-row">
        <button className="button" type="button" onClick={() => void refreshSession()} disabled={loading}>
          Sessie verversen
        </button>
        <button className="button secondary" type="button" onClick={() => void handleLogout()} disabled={loading || !user}>
          Uitloggen
        </button>
      </div>

      {error ? <p className="error-text">{error}</p> : null}
      {message ? <p className="hint">{message}</p> : null}
    </section>
  )
}
