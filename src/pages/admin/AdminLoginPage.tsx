import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminLogin } from '../../features/auth/authService'
import '../../styles/donatie-auth-admin.css'
import { setAdminSessionOk } from './adminSession'
import { trySupabaseAdminSignIn } from '../../features/admin/adminAccess'

const LOGO_SRC = '/logo-nav.jpg'

export function AdminLoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit() {
    setError('')
    setLoading(true)
    try {
      const userId = username.trim().toLowerCase()
      await adminLogin(userId, password)
      const supaAdminOk = await trySupabaseAdminSignIn(userId, password)
      if (!supaAdminOk) {
        setError(
          'Legacy login ok, maar Supabase-rol niet actief. Maak in Dashboard een auth-user aan voor admin@donatie.eu en draai docs/SQL_ADMIN_LIVE_PHASE2b_LOCK.sql. Je kunt alvast doorgaan (read-only).',
        )
      }
      setAdminSessionOk()
      navigate('/admin', { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Onjuiste admin-inloggegevens.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="admin-login-route">
      <div className="admin-login-box">
        <div className="admin-login-logo">
          <img src={LOGO_SRC} alt="Donatie.eu" width={64} height={64} />
        </div>
        <div className="admin-login-title">Admin Portaal</div>
        <div className="admin-login-sub">Donatie.eu Beheerpaneel — alleen voor geautoriseerde beheerders</div>
        {error ? <div className="admin-login-err">{error}</div> : null}
        <input
          className="admin-login-field"
          type="text"
          placeholder="Gebruikersnaam"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          className="admin-login-field"
          type="password"
          placeholder="Wachtwoord"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
          }}
        />
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            cursor: 'pointer',
            fontSize: '0.82rem',
            color: 'rgba(255,255,255,.6)',
            marginBottom: 12,
            userSelect: 'none',
          }}
        >
          <input type="checkbox" style={{ width: 15, height: 15, accentColor: '#3a98f8', cursor: 'pointer' }} />
          Automatisch ingelogd blijven
        </label>
        <button type="button" className="admin-login-btn" disabled={loading} onClick={() => void submit()}>
          {loading ? 'Bezig…' : '🔐 Inloggen als beheerder'}
        </button>
        <button type="button" className="admin-back" onClick={() => navigate('/')}>
          ← Terug naar Donatie.eu
        </button>
      </div>
    </div>
  )
}
