import { type FormEvent, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLegacyUiSession } from '../context/LegacyUiSessionContext'
import {
  clearPasswordRecoveryIntent,
  readPasswordRecoveryIntent,
  updatePasswordFromRecovery,
} from '../features/auth/authService'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import '../styles/donatie-auth-admin.css'

const LOGO_SRC = '/logo-nav.jpg'

export function PasswordResetPage() {
  const navigate = useNavigate()
  const { refreshSession } = useLegacyUiSession()
  const [phase, setPhase] = useState<'loading' | 'ready' | 'invalid'>('loading')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const resolvedRef = useRef(false)

  useEffect(() => {
    resolvedRef.current = false
    if (!isSupabaseConfigured || !supabase) {
      setPhase('invalid')
      return
    }

    const client = supabase
    const recoveryIntent = readPasswordRecoveryIntent()

    const markReady = () => {
      if (resolvedRef.current) return
      resolvedRef.current = true
      setPhase('ready')
    }

    const markInvalid = () => {
      if (resolvedRef.current) return
      resolvedRef.current = true
      clearPasswordRecoveryIntent()
      setPhase('invalid')
    }

    const { data: sub } = client.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        markReady()
      }
    })

    void client.auth.getSession().then(({ data: { session } }) => {
      if (resolvedRef.current) return
      if (session) {
        markReady()
        return
      }
      if (!recoveryIntent) {
        markInvalid()
      }
    })

    const timer = recoveryIntent
      ? window.setTimeout(() => {
          if (resolvedRef.current) return
          void client.auth.getSession().then(({ data: { session } }) => {
            if (resolvedRef.current) return
            if (session) {
              markReady()
            } else {
              markInvalid()
            }
          })
        }, 8000)
      : null

    return () => {
      if (timer !== null) window.clearTimeout(timer)
      sub.subscription.unsubscribe()
    }
  }, [])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('Wachtwoord moet minimaal 8 tekens zijn.')
      return
    }
    if (password !== password2) {
      setError('Wachtwoorden komen niet overeen.')
      return
    }
    setSubmitting(true)
    try {
      await updatePasswordFromRecovery(password)
      clearPasswordRecoveryIntent()
      await refreshSession()
      navigate('/account', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Opslaan mislukt.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page" id="page-auth-reset">
      <div className="auth-wrap">
        <div className="auth-left" id="authLeftPanelReset">
          <div className="auth-left-logo">
            <div
              className="auth-left-logo-icon"
              style={{
                background: 'transparent',
                boxShadow: 'none',
                borderRadius: 16,
                overflow: 'hidden',
                width: 64,
                height: 64,
              }}
            >
              <img src={LOGO_SRC} alt="Donatie.eu" width={64} height={64} />
            </div>
            <span className="auth-left-logo-text">Donatie.eu</span>
          </div>
          <h1 className="auth-left-title">Nieuw wachtwoord</h1>
          <p className="auth-left-sub">Kies een sterk wachtwoord om je account te beveiligen.</p>
        </div>

        <div className="auth-right">
          <div className="auth-card">
            {phase === 'loading' ? (
              <p style={{ margin: 0, color: '#4b5563' }}>Herstellink wordt gecontroleerd…</p>
            ) : null}

            {phase === 'invalid' ? (
              <div>
                <div className="form-error" style={{ marginBottom: 16 }}>
                  Deze herstellink is ongeldig of verlopen. Vraag via inloggen een nieuwe resetmail aan.
                </div>
                <Link to="/auth" className="btn btn-dark btn-full btn-lg" style={{ textAlign: 'center', display: 'block' }}>
                  Terug naar inloggen
                </Link>
              </div>
            ) : null}

            {phase === 'ready' ? (
              <form onSubmit={(e) => void onSubmit(e)}>
                <div className="input-group">
                  <label htmlFor="resetNewPw">Nieuw wachtwoord</label>
                  <div className="input-icon" style={{ position: 'relative' }}>
                    <span className="icon">🔒</span>
                    <input
                      id="resetNewPw"
                      type={showPw ? 'text' : 'password'}
                      className="input"
                      autoComplete="new-password"
                      style={{ paddingRight: 44 }}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={8}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((s) => !s)}
                      style={{
                        position: 'absolute',
                        right: 10,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '1rem',
                        padding: 4,
                      }}
                      title="Wachtwoord tonen"
                    >
                      {showPw ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>
                <div className="input-group">
                  <label htmlFor="resetNewPw2">Herhaal wachtwoord</label>
                  <div className="input-icon">
                    <span className="icon">🔒</span>
                    <input
                      id="resetNewPw2"
                      type={showPw ? 'text' : 'password'}
                      className="input"
                      autoComplete="new-password"
                      value={password2}
                      onChange={(e) => setPassword2(e.target.value)}
                      required
                      minLength={8}
                    />
                  </div>
                </div>
                {error ? <div className="form-error" style={{ marginBottom: 12 }}>{error}</div> : null}
                <button type="submit" className="btn btn-dark btn-full btn-lg mt8" disabled={submitting}>
                  {submitting ? 'Bezig…' : 'Wachtwoord opslaan'}
                </button>
              </form>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
