import { useMemo, useState, useEffect, useRef, useId } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useSearchParams, type NavigateFunction } from 'react-router-dom'
import {
  loginWithPassword,
  registerCompany,
  registerIndividual,
  registerInfluencer,
  requestPasswordReset,
} from '../features/auth/authService'
import { upsertDnlAccountProfile } from '../features/account/legacyDashboardModel'
import { joinCommunityWithCode } from '../features/community/communityProjectsService'
import { EMAIL_VERIFY_CALLBACK_KEY } from '../authUrlSnapshots'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import '../styles/donatie-auth-admin.css'

type AuthKind = 'particulier' | 'bedrijf' | 'influencer'
type AuthTab = 'login' | 'register'

type AuthBanner = { type: 'ok' | 'err'; text: string } | null

/** Na registratie zonder directe sessie: melding + inlogtab; melding verdwijnt na enkele seconden. */
const EMAIL_VERIFY_NOTICE_MS = 18_000

function showEmailVerificationPending(
  setBanner: (b: AuthBanner) => void,
  email: string,
  onSwitchToLogin: () => void,
) {
  const em = email.trim()
  setBanner({
    type: 'ok',
    text:
      `Er is een verificatiemail gestuurd naar ${em}. Klik op de link in die mail om je registratie te bevestigen. ` +
      `Daarna kun je hieronder inloggen met dat e-mailadres en het wachtwoord dat je hebt gekozen.`,
  })
  onSwitchToLogin()
  window.setTimeout(() => setBanner(null), EMAIL_VERIFY_NOTICE_MS)
}

function EmailVerifiedSplashPanel({
  kind,
  onContinue,
}: {
  kind: 'signup' | 'email_change'
  onContinue: () => void
}) {
  const gradId = `evg-${useId().replace(/:/g, '')}`
  const emailChange = kind === 'email_change'
  return (
    <div className="auth-email-verified-panel">
      <div className="auth-email-verified-icon" aria-hidden>
        <svg viewBox="0 0 52 52" width="52" height="52" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="26" cy="26" r="26" fill={`url(#${gradId})`} opacity="0.15" />
          <circle cx="26" cy="26" r="21" stroke={`url(#${gradId})`} strokeWidth="2" fill="#fff" />
          <path
            d="M15 26.8l8 8 14-17"
            stroke="#1a237e"
            strokeWidth="2.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <defs>
            <linearGradient id={gradId} x1="12" y1="8" x2="42" y2="44" gradientUnits="userSpaceOnUse">
              <stop stopColor="#1a237e" />
              <stop offset="1" stopColor="#3a98f8" />
            </linearGradient>
          </defs>
        </svg>
      </div>
      <h2 className="auth-email-verified-title">{emailChange ? 'Nieuw e-mailadres bevestigd' : 'E-mail bevestigd'}</h2>
      <p className="auth-email-verified-lead">
        {emailChange ? (
          <>
            Je nieuwe adres is gekoppeld. Log in met <strong>dit e-mailadres</strong> en je wachtwoord om verder te gaan.
          </>
        ) : (
          <>
            Je account is actief. Log nu in op je <strong>persoonlijke Donatie.eu-account</strong> met je e-mailadres en het
            wachtwoord dat je bij registratie hebt gekozen.
          </>
        )}
      </p>
      <button type="button" className="btn btn-dark btn-full btn-lg mt8" onClick={onContinue}>
        Ga naar inloggen →
      </button>
    </div>
  )
}

const LOGO_SRC = '/logo-nav.jpg'

export function LegacyAuthPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const refParam = searchParams.get('ref')?.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) ?? ''
  const tabParam = searchParams.get('tab')
  const typeParam = searchParams.get('type')
  const hasRef = Boolean(refParam)

  const [authKind, setAuthKind] = useState<AuthKind>('particulier')
  const [authTab, setAuthTab] = useState<AuthTab>('login')

  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [emailVerifiedSplash, setEmailVerifiedSplash] = useState(false)
  const [verifiedSplashKind, setVerifiedSplashKind] = useState<'signup' | 'email_change' | null>(null)
  const verifyFlowDoneRef = useRef(false)

  useEffect(() => {
    if (tabParam === 'register') setAuthTab('register')
  }, [tabParam])

  useEffect(() => {
    const t = (typeParam ?? '').toLowerCase()
    if (t === 'bedrijf') setAuthKind('bedrijf')
    else if (t === 'influencer') setAuthKind('influencer')
    else if (t === 'particulier') setAuthKind('particulier')
  }, [typeParam])

  /** Verificatielink: sessie kort laten aanmaken (Supabase), daarna uitloggen + duidelijke bevestiging; punten volgen bij echte login. */
  useEffect(() => {
    if (verifyFlowDoneRef.current) return
    let stored: string | null = null
    try {
      stored = sessionStorage.getItem(EMAIL_VERIFY_CALLBACK_KEY)
    } catch {
      return
    }
    if (stored !== 'signup' && stored !== 'email_change') return
    if (!isSupabaseConfigured || !supabase) return

    try {
      sessionStorage.removeItem(EMAIL_VERIFY_CALLBACK_KEY)
    } catch {
      /* ignore */
    }

    verifyFlowDoneRef.current = true
    const kind: 'signup' | 'email_change' = stored === 'email_change' ? 'email_change' : 'signup'
    const client = supabase
    let cancelled = false
    let finished = false

    const finalize = async (hadSession: boolean) => {
      if (cancelled || finished) return
      finished = true
      await client.auth.signOut({ scope: 'local' }).catch(() => undefined)
      if (!hadSession) return
      setVerifiedSplashKind(kind)
      setEmailVerifiedSplash(true)
      setAuthTab('login')
      setBanner(null)
    }

    const run = async () => {
      const trySession = async () => {
        const {
          data: { session },
        } = await client.auth.getSession()
        return session?.user ? session : null
      }

      const { data: listener } = client.auth.onAuthStateChange(async (event, sess) => {
        if (cancelled || finished) return
        if ((event !== 'SIGNED_IN' && event !== 'INITIAL_SESSION') || !sess?.user) return
        await finalize(true)
      })

      let found = await trySession()
      for (let i = 0; i < 24 && !found && !cancelled && !finished; i++) {
        await new Promise((r) => setTimeout(r, 80))
        found = await trySession()
      }

      try {
        listener.subscription.unsubscribe()
      } catch {
        /* ignore */
      }

      if (cancelled || finished) return

      await finalize(Boolean(found?.user))
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [])

  const leftTheme = useMemo(() => {
    if (authKind === 'bedrijf') return 'theme-bedrijf'
    if (authKind === 'influencer') return 'theme-influencer'
    return ''
  }, [authKind])

  const badge = useMemo(() => {
    if (authKind === 'bedrijf') {
      return {
        style: { background: '#f1f5f9', color: '#1a237e' } as const,
        icon: '🏢',
        text: 'Bedrijfsaccount',
      }
    }
    if (authKind === 'influencer') {
      return {
        style: { background: '#f5f3ff', color: '#5b21b6' } as const,
        icon: '⭐',
        text: 'Influencer account',
      }
    }
    return {
      style: { background: '#eef2ff', color: '#1a237e' } as const,
      icon: '👤',
      text: 'Particulier account',
    }
  }, [authKind])

  return (
    <div className="page" id="page-auth">
      <div className="auth-wrap">
        <div className={`auth-left ${leftTheme}`} id="authLeftPanel">
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
              <img src={LOGO_SRC} alt="Donatie.eu online donatie interface" width={64} height={64} />
            </div>
            <span className="auth-left-logo-text">Donatie.eu</span>
          </div>
          <h1 className="auth-left-title" id="authLeftTitle">
            Doneer slim.
            <br />
            <em>Doneer met plezier.</em>
          </h1>
          <p className="auth-left-sub" id="authLeftSub">
            Doneer slim, verdien punten en klim op de ranglijst. Volledig transparant en betrouwbaar — maak écht het
            verschil.
          </p>
          <div className="auth-feature-list" id="authLeftFeatures">
            <div className="auth-feature">
              <div className="auth-feature-dot" />
              Verdien punten per donatie
            </div>
            <div className="auth-feature">
              <div className="auth-feature-dot" />
              Klim op de ranglijst
            </div>
            <div className="auth-feature">
              <div className="auth-feature-dot" />
              Win badges &amp; beloningen
            </div>
            <div className="auth-feature">
              <div className="auth-feature-dot" />
              50+ CBF-erkende goede doelen
            </div>
          </div>
        </div>

        <div className="auth-right">
          <div className="auth-card" id="login-section">
            {emailVerifiedSplash && verifiedSplashKind ? (
              <EmailVerifiedSplashPanel
                kind={verifiedSplashKind}
                onContinue={() => {
                  setEmailVerifiedSplash(false)
                  setVerifiedSplashKind(null)
                  setAuthTab('login')
                }}
              />
            ) : (
              <>
            <div className="auth-type-badge" id="authTypeBadge" style={badge.style}>
              <span id="authTypeBadgeIcon">{badge.icon}</span>
              <span id="authTypeBadgeText">{badge.text}</span>
            </div>

            <div
              style={{
                display: 'flex',
                gap: 5,
                background: '#f1f5f9',
                borderRadius: 14,
                padding: 5,
                marginBottom: 20,
              }}
            >
              <AuthKindBtn
                active={authKind === 'particulier'}
                label="👤 Particulier"
                onClick={() => setAuthKind('particulier')}
              />
              <AuthKindBtn active={authKind === 'bedrijf'} label="🏢 Bedrijf" onClick={() => setAuthKind('bedrijf')} />
              <AuthKindBtn
                active={authKind === 'influencer'}
                label="⭐ Influencer"
                onClick={() => setAuthKind('influencer')}
              />
            </div>

            <div className="auth-tabs">
              <button
                type="button"
                className={`auth-tab${authTab === 'login' ? ' active' : ''}`}
                id="loginTab"
                onClick={() => setAuthTab('login')}
              >
                Inloggen
              </button>
              <button
                type="button"
                className={`auth-tab${authTab === 'register' ? ' active' : ''}`}
                id="registerTab"
                onClick={() => setAuthTab('register')}
              >
                Account aanmaken
              </button>
            </div>

            {banner ? (
              <div className={banner.type === 'ok' ? 'form-success' : 'form-error'} style={{ marginBottom: 14 }}>
                {banner.text}
              </div>
            ) : null}

            {hasRef && authTab === 'register' ? (
              <div
                style={{
                  display: 'flex',
                  background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)',
                  border: '1.5px solid #86efac',
                  borderRadius: 12,
                  padding: '12px 16px',
                  marginBottom: 16,
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <span style={{ fontSize: '1.4rem' }}>🎁</span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#15803d' }}>Je bent uitgenodigd!</div>
                  <div style={{ fontSize: '0.78rem', color: '#374151' }}>
                    Maak een account aan en ontvang <strong>+100 welkomstpunten</strong>.
                  </div>
                </div>
              </div>
            ) : null}

            {authTab === 'login' ? (
              <LoginBlock
                loading={loading}
                setLoading={setLoading}
                setBanner={setBanner}
                navigate={navigate}
                onGoRegister={() => setAuthTab('register')}
              />
            ) : null}

            {authTab === 'register' && authKind === 'particulier' ? (
              <RegisterParticulierBlock
                initialReferralCode={refParam}
                loading={loading}
                setLoading={setLoading}
                setBanner={setBanner}
                onGoLogin={() => setAuthTab('login')}
              />
            ) : null}
            {authTab === 'register' && authKind === 'bedrijf' ? (
              <RegisterBedrijfBlock
                initialReferralCode={refParam}
                loading={loading}
                setLoading={setLoading}
                setBanner={setBanner}
                onGoLogin={() => setAuthTab('login')}
              />
            ) : null}
            {authTab === 'register' && authKind === 'influencer' ? (
              <RegisterInfluencerBlock
                initialReferralCode={refParam}
                loading={loading}
                setLoading={setLoading}
                setBanner={setBanner}
                onGoLogin={() => setAuthTab('login')}
              />
            ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function AuthKindBtn({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: '9px 6px',
        border: 'none',
        borderRadius: 10,
        fontWeight: 700,
        fontSize: '0.82rem',
        cursor: 'pointer',
        transition: '0.2s',
        background: active ? '#1a237e' : 'transparent',
        color: active ? '#fff' : '#6b7280',
        boxShadow: active ? '0 2px 8px rgba(26,35,126,.25)' : 'none',
      }}
    >
      {label}
    </button>
  )
}

function LoginBlock({
  loading,
  setLoading,
  setBanner,
  navigate,
  onGoRegister,
}: {
  loading: boolean
  setLoading: (v: boolean) => void
  setBanner: (b: { type: 'ok' | 'err'; text: string } | null) => void
  navigate: NavigateFunction
  onGoRegister: () => void
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [forgotOpen, setForgotOpen] = useState(false)
  const [resetBusy, setResetBusy] = useState(false)

  async function doLogin() {
    setBanner(null)
    setLoading(true)
    try {
      await loginWithPassword(email.trim().toLowerCase(), password)
      setBanner({ type: 'ok', text: 'Je bent ingelogd.' })
      navigate('/account')
    } catch (e) {
      setBanner({ type: 'err', text: e instanceof Error ? e.message : 'Inloggen mislukt.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div id="loginForm">
      <div className="input-group">
        <label htmlFor="loginEmail">E-mailadres</label>
        <div className="input-icon">
          <span className="icon">📧</span>
          <input
            id="loginEmail"
            type="email"
            className="input"
            placeholder="jouw@email.nl"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      </div>
      <div className="input-group">
        <label htmlFor="loginPassword">Wachtwoord</label>
        <div className="input-icon" style={{ position: 'relative' }}>
          <span className="icon">🔒</span>
          <input
            id="loginPassword"
            type={showPw ? 'text' : 'password'}
            className="input"
            placeholder="Wachtwoord"
            autoComplete="current-password"
            style={{ paddingRight: 44 }}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void doLogin()
            }}
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
      <button type="button" className="btn btn-dark btn-full btn-lg mt8" disabled={loading} onClick={() => void doLogin()}>
        {loading ? 'Bezig…' : 'Inloggen →'}
      </button>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            cursor: 'pointer',
            fontSize: '0.82rem',
            color: '#4b5563',
            userSelect: 'none',
          }}
        >
          <input type="checkbox" style={{ width: 15, height: 15, accentColor: 'var(--blue)', cursor: 'pointer' }} />
          Automatisch ingelogd blijven
        </label>
        <button
          type="button"
          className="linklike"
          style={{ fontSize: '0.82rem', color: 'var(--blue)', cursor: 'pointer', textDecoration: 'underline', background: 'none', border: 'none', padding: 0, font: 'inherit' }}
          onClick={() => {
            setForgotOpen((o) => !o)
            setBanner(null)
          }}
        >
          Wachtwoord vergeten?
        </button>
      </div>
      {forgotOpen ? (
        <div
          style={{
            marginTop: 14,
            padding: 14,
            borderRadius: 12,
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
          }}
        >
          <div style={{ fontSize: '0.82rem', fontWeight: 700, marginBottom: 8, color: '#334155' }}>
            Wachtwoord herstellen
          </div>
          <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '0 0 10px' }}>
            Vul je e-mailadres in. Je ontvangt een link om een nieuw wachtwoord te kiezen (controleer ook spam).
          </p>
          <div className="input-icon" style={{ marginBottom: 10 }}>
            <span className="icon">📧</span>
            <input
              type="email"
              className="input"
              placeholder="jouw@email.nl"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn btn-outline btn-full btn-sm"
            disabled={resetBusy || loading}
            onClick={() => {
              setBanner(null)
              setResetBusy(true)
              void requestPasswordReset(email)
                .then(() => {
                  setBanner({
                    type: 'ok',
                    text: 'Als dit adres bij ons bekend is, ontvang je zo een e-mail met een herstellink.',
                  })
                  setForgotOpen(false)
                })
                .catch((err) => {
                  setBanner({ type: 'err', text: err instanceof Error ? err.message : 'Versturen mislukt.' })
                })
                .finally(() => setResetBusy(false))
            }}
          >
            {resetBusy ? 'Bezig…' : 'Verstuur herstellink'}
          </button>
        </div>
      ) : null}
      <div className="auth-footer">
        Nog geen account?{' '}
        <button type="button" className="linklike" onClick={onGoRegister}>
          Aanmelden
        </button>
      </div>
    </div>
  )
}

function RegisterParticulierBlock({
  loading,
  setLoading,
  setBanner,
  onGoLogin,
  initialReferralCode = '',
}: {
  loading: boolean
  setLoading: (v: boolean) => void
  setBanner: (b: { type: 'ok' | 'err'; text: string } | null) => void
  onGoLogin: () => void
  initialReferralCode?: string
}) {
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [bedrijfCode, setBedrijfCode] = useState('')
  const [refCode, setRefCode] = useState(() =>
    (initialReferralCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6),
  )
  const [terms, setTerms] = useState(false)
  const [anon, setAnon] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBanner(null)
    if (!terms) {
      setBanner({ type: 'err', text: 'Ga akkoord met de voorwaarden om door te gaan.' })
      return
    }
    if (password.length < 8) {
      setBanner({ type: 'err', text: 'Wachtwoord moet minimaal 8 tekens zijn.' })
      return
    }
    setLoading(true)
    try {
      const result = await registerIndividual({
        firstName: first.trim(),
        lastName: last.trim(),
        email: email.trim().toLowerCase(),
        password,
        anonymous: anon,
        metadata: {
          bedrijf_code: bedrijfCode.trim() || undefined,
          pending_community_code: bedrijfCode.trim().toUpperCase() || undefined,
          referral_code: refCode.trim().toUpperCase() || undefined,
        },
      })
      upsertDnlAccountProfile(email.trim().toLowerCase(), {
        type: 'individu',
        firstName: first.trim(),
        lastName: last.trim(),
        anonymous: anon,
      })
      if (result.emailConfirmationRequired) {
        showEmailVerificationPending(setBanner, email, onGoLogin)
      } else {
        if (bedrijfCode.trim()) {
          const joined = await joinCommunityWithCode(bedrijfCode.trim())
          if (joined.ok) {
            setBanner({ type: 'ok', text: `Account actief: ${result.user?.firstName ?? 'gebruiker'}. Community direct gekoppeld.` })
          } else {
            setBanner({
              type: 'ok',
              text: `Account actief: ${result.user?.firstName ?? 'gebruiker'}. Communitycode kon niet direct gekoppeld worden (${joined.error ?? 'onbekend'}).`,
            })
          }
        } else {
          setBanner({ type: 'ok', text: `Account actief: ${result.user?.firstName ?? 'gebruiker'}.` })
        }
      }
    } catch (err) {
      setBanner({ type: 'err', text: err instanceof Error ? err.message : 'Registratie mislukt.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form id="registerForm" onSubmit={onSubmit}>
      <div className="input-row">
        <div className="input-group">
          <label>Voornaam *</label>
          <input type="text" className="input" placeholder="Jan" value={first} onChange={(e) => setFirst(e.target.value)} required />
        </div>
        <div className="input-group">
          <label>Achternaam *</label>
          <input type="text" className="input" placeholder="de Vries" value={last} onChange={(e) => setLast(e.target.value)} required />
        </div>
      </div>
      <div className="input-group">
        <label>E-mailadres *</label>
        <div className="input-icon">
          <span className="icon">📧</span>
          <input type="email" className="input" placeholder="jouw@email.nl" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
      </div>
      <div className="input-group">
        <label>Wachtwoord *</label>
        <div className="input-icon" style={{ position: 'relative' }}>
          <span className="icon">🔒</span>
          <input
            type={showPw ? 'text' : 'password'}
            className="input"
            placeholder="Minimaal 8 tekens"
            autoComplete="new-password"
            style={{ paddingRight: 44 }}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
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
      <div style={{ background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 12, padding: 14, marginBottom: 12 }}>
        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#15803d', marginBottom: 8 }}>
          🤝 Aansluiten bij community <span style={{ fontWeight: 400, color: '#6b7280' }}>(optioneel)</span>
        </div>
        <input
          type="text"
          className="input"
          placeholder="Communitycode (bijv. BU-C60861C6 of IN-EE93616B)"
          style={{ fontSize: '0.85rem' }}
          value={bedrijfCode}
          onChange={(e) => setBedrijfCode(e.target.value.toUpperCase())}
        />
        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 5 }}>
          Met deze code sluit je direct aan bij een bedrijfs- of influencer-community.
        </div>
      </div>
      <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 12, padding: 14, marginBottom: 12 }}>
        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#92400e', marginBottom: 8 }}>
          🎁 Referralcode <span style={{ fontWeight: 400, color: '#6b7280' }}>(optioneel)</span>
        </div>
        <input
          type="text"
          className="input"
          placeholder="Bijv. AB3K7P"
          maxLength={6}
          style={{ fontSize: '0.88rem', letterSpacing: '0.12em', textTransform: 'uppercase' }}
          value={refCode}
          onChange={(e) => setRefCode(e.target.value.toUpperCase())}
        />
        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 5 }}>
          Heb je een referralcode ontvangen? Voer hem hier in en ontvang <strong>+100 welkomstpunten</strong>.
        </div>
      </div>
      <div className="checkbox-row">
        <input type="checkbox" id="regTerms" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
        <label htmlFor="regTerms">
          Ik ga akkoord met de <span style={{ color: 'var(--blue)', cursor: 'pointer' }}>Algemene Voorwaarden</span> en het{' '}
          <span style={{ color: 'var(--blue)', cursor: 'pointer' }}>Privacybeleid</span>
        </label>
      </div>
      <div className="checkbox-row">
        <input type="checkbox" id="regAnon" checked={anon} onChange={(e) => setAnon(e.target.checked)} />
        <label htmlFor="regAnon">Standaard anoniem op de ranglijst (je kunt dit later aanpassen)</label>
      </div>
      <button type="submit" className="btn btn-dark btn-full btn-lg" disabled={loading}>
        {loading ? 'Bezig…' : 'Account aanmaken →'}
      </button>
      <div className="auth-footer">
        Al een account?{' '}
        <button type="button" className="linklike" onClick={onGoLogin}>
          Inloggen
        </button>
      </div>
    </form>
  )
}

function RegisterBedrijfBlock({
  loading,
  setLoading,
  setBanner,
  onGoLogin,
  initialReferralCode = '',
}: {
  loading: boolean
  setLoading: (v: boolean) => void
  setBanner: (b: { type: 'ok' | 'err'; text: string } | null) => void
  onGoLogin: () => void
  initialReferralCode?: string
}) {
  const [naam, setNaam] = useState('')
  const [kvk, setKvk] = useState('')
  const [branche, setBranche] = useState('')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [contact, setContact] = useState('')
  const [tel, setTel] = useState('')
  const [straat, setStraat] = useState('')
  const [postcode, setPostcode] = useState('')
  const [stad, setStad] = useState('')
  const [terms, setTerms] = useState(false)
  const [refCode, setRefCode] = useState(() =>
    (initialReferralCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6),
  )

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBanner(null)
    if (!terms) {
      setBanner({ type: 'err', text: 'Ga akkoord met de zakelijke voorwaarden.' })
      return
    }
    if (pass.length < 8) {
      setBanner({ type: 'err', text: 'Wachtwoord moet minimaal 8 tekens zijn.' })
      return
    }
    setLoading(true)
    try {
      const result = await registerCompany({
        firstName: naam.trim(),
        lastName: '',
        email: email.trim().toLowerCase(),
        password: pass,
        anonymous: false,
        metadata: {
          company_name: naam.trim(),
          bedrijfsnaam: naam.trim(),
          kvk: kvk.trim(),
          contact_name: contact.trim(),
          branche,
          telefoon: tel.trim(),
          vestiging_straat: straat.trim(),
          vestiging_postcode: postcode.trim(),
          vestiging_stad: stad.trim(),
          referral_code: refCode.trim().toUpperCase() || undefined,
        },
      })
      upsertDnlAccountProfile(email.trim().toLowerCase(), {
        type: 'bedrijf',
        firstName: naam.trim(),
        lastName: '',
        bedrijfsnaam: naam.trim(),
        anonymous: false,
      })
      if (result.emailConfirmationRequired) {
        showEmailVerificationPending(setBanner, email, onGoLogin)
      } else {
        setBanner({ type: 'ok', text: `Bedrijfsaccount actief: ${result.user?.firstName ?? 'bedrijf'}.` })
      }
    } catch (err) {
      setBanner({ type: 'err', text: err instanceof Error ? err.message : 'Bedrijfsregistratie mislukt.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form id="registerFormBedrijf" onSubmit={onSubmit}>
      <div style={{ background: 'linear-gradient(135deg,#1a237e,#3a98f8)', borderRadius: 12, padding: '14px 16px', marginBottom: 16, color: '#fff' }}>
        <div style={{ fontWeight: 800, fontSize: '0.92rem', marginBottom: 3 }}>🏢 Bedrijfsaccount aanmaken</div>
        <div style={{ fontSize: '0.78rem', opacity: 0.85 }}>
          Zet acties op, geef prijzen weg in het puntensysteem en bereik gemotiveerde donateurs.
        </div>
      </div>
      <div className="input-group">
        <label>Bedrijfsnaam *</label>
        <input type="text" className="input" placeholder="Albert Heijn BV" value={naam} onChange={(e) => setNaam(e.target.value)} required />
      </div>
      <div className="input-row">
        <div className="input-group">
          <label>KvK-nummer *</label>
          <input type="text" className="input" placeholder="12345678" value={kvk} onChange={(e) => setKvk(e.target.value)} required />
        </div>
        <div className="input-group">
          <label>Branche *</label>
          <select className="input" value={branche} onChange={(e) => setBranche(e.target.value)} required>
            <option value="">Kies branche</option>
            <option value="retail">🛒 Retail</option>
            <option value="finance">💰 Finance</option>
            <option value="tech">💻 Tech</option>
            <option value="zorg">🏥 Zorg</option>
            <option value="food">🍔 Food &amp; Drank</option>
            <option value="media">📱 Media</option>
            <option value="overig">📦 Overig</option>
          </select>
        </div>
      </div>
      <div className="input-group">
        <label>Zakelijk e-mailadres *</label>
        <div className="input-icon">
          <span className="icon">📧</span>
          <input type="email" className="input" placeholder="info@bedrijf.nl" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
      </div>
      <div className="input-group">
        <label>Wachtwoord *</label>
        <div className="input-icon">
          <span className="icon">🔒</span>
          <input type="password" className="input" placeholder="Minimaal 8 tekens" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} required />
        </div>
      </div>
      <div className="input-row">
        <div className="input-group">
          <label>Contactpersoon *</label>
          <input type="text" className="input" placeholder="Jan de Vries" value={contact} onChange={(e) => setContact(e.target.value)} required />
        </div>
        <div className="input-group">
          <label>Telefoonnummer *</label>
          <input type="tel" className="input" placeholder="020 1234567" value={tel} onChange={(e) => setTel(e.target.value)} required />
        </div>
      </div>
      <div style={{ background: '#f8faff', border: '1.5px solid #dde6ff', borderRadius: 12, padding: 14, marginBottom: 12 }}>
        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1a237e', marginBottom: 10 }}>📍 Vestigingsadres</div>
        <div className="input-group" style={{ marginBottom: 8 }}>
          <label>Straat + huisnummer *</label>
          <input type="text" className="input" placeholder="Damrak 70" value={straat} onChange={(e) => setStraat(e.target.value)} required />
        </div>
        <div className="input-row">
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label>Postcode *</label>
            <input type="text" className="input" placeholder="1012 LM" value={postcode} onChange={(e) => setPostcode(e.target.value)} required />
          </div>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label>Stad *</label>
            <input type="text" className="input" placeholder="Amsterdam" value={stad} onChange={(e) => setStad(e.target.value)} required />
          </div>
        </div>
      </div>
      <div className="checkbox-row">
        <input type="checkbox" id="regBedrijfTerms" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
        <label htmlFor="regBedrijfTerms">
          Ik ga akkoord met de <span style={{ color: 'var(--blue)', cursor: 'pointer' }}>Zakelijke Voorwaarden</span> en het{' '}
          <span style={{ color: 'var(--blue)', cursor: 'pointer' }}>Privacybeleid</span>
        </label>
      </div>
      <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 12, padding: 12, marginBottom: 12 }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#92400e', marginBottom: 6 }}>
          🎁 Referralcode <span style={{ fontWeight: 400, color: '#6b7280' }}>(optioneel)</span>
        </div>
        <input
          type="text"
          className="input"
          placeholder="Bijv. AB3K7P"
          maxLength={6}
          style={{ fontSize: '0.85rem', letterSpacing: '0.12em', textTransform: 'uppercase' }}
          value={refCode}
          onChange={(e) => setRefCode(e.target.value.toUpperCase())}
        />
        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 5 }}>
          Heb je een referralcode ontvangen? Je krijgt <strong>+100 welkomstpunten</strong>. Degene die jou uitnodigde kan
          ook nog +100 per aanmelding verdienen, maximaal voor de eerste vijf via deze code.
        </div>
      </div>
      <button
        type="submit"
        className="btn btn-full btn-lg"
        style={{
          background: 'linear-gradient(135deg,#1a237e,#3a98f8)',
          color: '#fff',
          border: 'none',
          borderRadius: 'var(--r-sm)',
          padding: 14,
          fontSize: '1rem',
          fontWeight: 700,
          cursor: 'pointer',
        }}
        disabled={loading}
      >
        {loading ? 'Bezig…' : 'Bedrijfsaccount aanmaken →'}
      </button>
      <div style={{ marginTop: 12, padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, fontSize: '0.77rem', color: '#92400e' }}>
        ⏳ Na registratie controleert Donatie.eu het KvK-nummer. Je ontvangt binnen 24 uur een activatiemail.
      </div>
      <div className="auth-footer">
        Al een account?{' '}
        <button type="button" className="linklike" onClick={onGoLogin}>
          Inloggen
        </button>
      </div>
    </form>
  )
}

function RegisterInfluencerBlock({
  loading,
  setLoading,
  setBanner,
  onGoLogin,
  initialReferralCode = '',
}: {
  loading: boolean
  setLoading: (v: boolean) => void
  setBanner: (b: { type: 'ok' | 'err'; text: string } | null) => void
  onGoLogin: () => void
  initialReferralCode?: string
}) {
  const [displayName, setDisplayName] = useState('')
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [social, setSocial] = useState('')
  const [bio, setBio] = useState('')
  const [niche, setNiche] = useState('')
  const [terms, setTerms] = useState(false)
  const [refCode, setRefCode] = useState(() =>
    (initialReferralCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6),
  )

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBanner(null)
    if (!terms) {
      setBanner({ type: 'err', text: 'Ga akkoord met de voorwaarden.' })
      return
    }
    if (pass.length < 8) {
      setBanner({ type: 'err', text: 'Wachtwoord moet minimaal 8 tekens zijn.' })
      return
    }
    setLoading(true)
    try {
      const result = await registerInfluencer({
        firstName: first.trim(),
        lastName: last.trim(),
        email: email.trim().toLowerCase(),
        password: pass,
        anonymous: false,
        metadata: {
          influencer_name: displayName.trim(),
          inflNaam: displayName.trim(),
          niche: niche.trim(),
          social_url: social.trim(),
          bio: bio.trim(),
          referral_code: refCode.trim().toUpperCase() || undefined,
        },
      })
      upsertDnlAccountProfile(email.trim().toLowerCase(), {
        type: 'influencer',
        firstName: first.trim(),
        lastName: last.trim(),
        inflNaam: displayName.trim() || first.trim(),
        niche: niche.trim() || undefined,
        anonymous: false,
      })
      if (result.emailConfirmationRequired) {
        showEmailVerificationPending(setBanner, email, onGoLogin)
      } else {
        setBanner({ type: 'ok', text: `Influencer account actief: ${result.user?.firstName ?? 'influencer'}.` })
      }
    } catch (err) {
      setBanner({ type: 'err', text: err instanceof Error ? err.message : 'Influencer registratie mislukt.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form id="registerFormInfluencer" onSubmit={onSubmit}>
      <div style={{ background: 'linear-gradient(135deg,#f5f3ff,#ede9fe)', borderRadius: 14, padding: '16px 18px', marginBottom: 20 }}>
        <div style={{ fontWeight: 800, fontSize: '0.92rem', marginBottom: 3 }}>⭐ Influencer account aanmaken</div>
        <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>Bouw je eigen community, koppel aan goede doelen en beheer je eigen store.</div>
      </div>
      <div className="input-group">
        <label>Weergavenaam / Kanaal *</label>
        <input type="text" className="input" placeholder="bijv. RunnersMike of FitnessByLisa" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
      </div>
      <div className="input-row">
        <div className="input-group">
          <label>Voornaam *</label>
          <input type="text" className="input" placeholder="Voornaam" value={first} onChange={(e) => setFirst(e.target.value)} required />
        </div>
        <div className="input-group">
          <label>Achternaam *</label>
          <input type="text" className="input" placeholder="Achternaam" value={last} onChange={(e) => setLast(e.target.value)} />
        </div>
      </div>
      <div className="input-group">
        <label>E-mailadres *</label>
        <div className="input-icon">
          <span className="icon">📧</span>
          <input type="email" className="input" placeholder="jij@email.nl" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
      </div>
      <div className="input-group">
        <label>Wachtwoord *</label>
        <div className="input-icon">
          <span className="icon">🔒</span>
          <input type="password" className="input" placeholder="Minimaal 8 tekens" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} required />
        </div>
      </div>
      <div className="input-group">
        <label>Instagram / TikTok / YouTube URL</label>
        <input type="text" className="input" placeholder="https://instagram.com/jouwkanaal" value={social} onChange={(e) => setSocial(e.target.value)} />
      </div>
      <div className="input-group">
        <label>Korte bio</label>
        <textarea className="input" placeholder="Vertel kort wie je bent en waar je community over gaat..." rows={3} style={{ resize: 'vertical' }} value={bio} onChange={(e) => setBio(e.target.value)} />
      </div>
      <div className="input-group">
        <label>Niche / categorie</label>
        <select className="input" value={niche} onChange={(e) => setNiche(e.target.value)}>
          <option value="">Selecteer categorie</option>
          <option value="sport">🏃 Sport &amp; Fitness</option>
          <option value="lifestyle">✨ Lifestyle</option>
          <option value="dieren">🐾 Dieren</option>
          <option value="milieu">🌿 Milieu &amp; Duurzaamheid</option>
          <option value="gezondheid">💊 Gezondheid</option>
          <option value="mode">👗 Mode &amp; Beauty</option>
          <option value="food">🍽️ Food</option>
          <option value="tech">💻 Tech</option>
          <option value="overig">📌 Overig</option>
        </select>
      </div>
      <div className="checkbox-row">
        <input type="checkbox" id="regInflTerms" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
        <label htmlFor="regInflTerms">
          Ik ga akkoord met de <span style={{ color: 'var(--blue)', cursor: 'pointer' }}>Voorwaarden</span> en het{' '}
          <span style={{ color: 'var(--blue)', cursor: 'pointer' }}>Privacybeleid</span>
        </label>
      </div>
      <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 12, padding: 12, marginBottom: 12 }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#92400e', marginBottom: 6 }}>
          🎁 Referralcode <span style={{ fontWeight: 400, color: '#6b7280' }}>(optioneel)</span>
        </div>
        <input
          type="text"
          className="input"
          placeholder="Bijv. AB3K7P"
          maxLength={6}
          style={{ fontSize: '0.85rem', letterSpacing: '0.12em', textTransform: 'uppercase' }}
          value={refCode}
          onChange={(e) => setRefCode(e.target.value.toUpperCase())}
        />
      </div>
      <button
        type="submit"
        className="btn btn-full btn-lg"
        style={{
          background: 'linear-gradient(135deg,#7c3aed,#a855f7)',
          color: '#fff',
          border: 'none',
          borderRadius: 'var(--r-sm)',
          padding: 14,
          fontSize: '1rem',
          fontWeight: 700,
          cursor: 'pointer',
        }}
        disabled={loading}
      >
        {loading ? 'Bezig…' : '⭐ Influencer account aanmaken →'}
      </button>
      <div className="auth-footer">
        Al een account?{' '}
        <button type="button" className="linklike" onClick={onGoLogin}>
          Inloggen
        </button>
      </div>
    </form>
  )
}
