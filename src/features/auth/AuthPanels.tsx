import { useState } from 'react'
import type { FormEvent } from 'react'
import {
  adminLogin,
  loginWithPassword,
  registerCompany,
  registerIndividual,
  registerInfluencer,
} from './authService'
import type { LocalUser } from '../../types/auth'

export function AuthPanels() {
  return (
    <section className="auth-grid">
      <UserLoginPanel />
      <RegisterIndividualPanel />
      <RegisterCompanyPanel />
      <RegisterInfluencerPanel />
      <AdminLoginPanel />
    </section>
  )
}

function RegisterIndividualPanel() {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [anonymous, setAnonymous] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    if (password.length < 8) {
      setLoading(false)
      setError('Wachtwoord moet minimaal 8 tekens zijn.')
      return
    }

    try {
      const result = await registerIndividual({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        password,
        anonymous,
      })

      if (result.emailConfirmationRequired) {
        setMessage('Account aangemaakt. Controleer je e-mail en bevestig je account.')
      } else {
        setMessage(`Account aangemaakt en ingelogd als ${result.user?.firstName ?? 'gebruiker'}.`)
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Registratie mislukt.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <article className="card">
      <h2>Registreren (individu)</h2>
      <form onSubmit={onSubmit} className="form-stack">
        <input
          className="input"
          type="text"
          placeholder="Voornaam"
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
          required
        />
        <input
          className="input"
          type="text"
          placeholder="Achternaam"
          value={lastName}
          onChange={(event) => setLastName(event.target.value)}
          required
        />
        <input
          className="input"
          type="email"
          placeholder="E-mailadres"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <input
          className="input"
          type="password"
          placeholder="Wachtwoord (minimaal 8 tekens)"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={anonymous}
            onChange={(event) => setAnonymous(event.target.checked)}
          />
          <span>Anoniem op ranglijsten</span>
        </label>

        <button className="button" type="submit" disabled={loading}>
          {loading ? 'Bezig...' : 'Account aanmaken'}
        </button>
      </form>

      {error ? <p className="error-text">{error}</p> : null}
      {message ? <p className="success-text">{message}</p> : null}
    </article>
  )
}

function RegisterCompanyPanel() {
  const [companyName, setCompanyName] = useState('')
  const [kvk, setKvk] = useState('')
  const [contactName, setContactName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    if (password.length < 8) {
      setLoading(false)
      setError('Wachtwoord moet minimaal 8 tekens zijn.')
      return
    }

    try {
      const result = await registerCompany({
        firstName: companyName.trim(),
        lastName: '',
        email: email.trim().toLowerCase(),
        password,
        anonymous: false,
        metadata: {
          kvk: kvk.trim(),
          contact_name: contactName.trim(),
        },
      })

      if (result.emailConfirmationRequired) {
        setMessage('Bedrijfsaccount aangemaakt. Controleer je e-mail voor bevestiging.')
      } else {
        setMessage(`Bedrijfsaccount actief: ${result.user?.firstName ?? 'bedrijf'}.`)
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Bedrijfsregistratie mislukt.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <article className="card">
      <h2>Registreren (bedrijf)</h2>
      <form onSubmit={onSubmit} className="form-stack">
        <input
          className="input"
          type="text"
          placeholder="Bedrijfsnaam"
          value={companyName}
          onChange={(event) => setCompanyName(event.target.value)}
          required
        />
        <input
          className="input"
          type="text"
          placeholder="KVK nummer"
          value={kvk}
          onChange={(event) => setKvk(event.target.value)}
          required
        />
        <input
          className="input"
          type="text"
          placeholder="Contactpersoon"
          value={contactName}
          onChange={(event) => setContactName(event.target.value)}
          required
        />
        <input
          className="input"
          type="email"
          placeholder="E-mailadres"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <input
          className="input"
          type="password"
          placeholder="Wachtwoord (minimaal 8 tekens)"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <button className="button" type="submit" disabled={loading}>
          {loading ? 'Bezig...' : 'Bedrijfsaccount aanmaken'}
        </button>
      </form>

      {error ? <p className="error-text">{error}</p> : null}
      {message ? <p className="success-text">{message}</p> : null}
    </article>
  )
}

function RegisterInfluencerPanel() {
  const [displayName, setDisplayName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [niche, setNiche] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    if (password.length < 8) {
      setLoading(false)
      setError('Wachtwoord moet minimaal 8 tekens zijn.')
      return
    }

    try {
      const result = await registerInfluencer({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        password,
        anonymous: false,
        metadata: {
          influencer_name: displayName.trim(),
          niche: niche.trim(),
        },
      })

      if (result.emailConfirmationRequired) {
        setMessage('Influencer account aangemaakt. Controleer je e-mail voor bevestiging.')
      } else {
        setMessage(`Influencer account actief: ${result.user?.firstName ?? 'influencer'}.`)
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Influencer registratie mislukt.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <article className="card">
      <h2>Registreren (influencer)</h2>
      <form onSubmit={onSubmit} className="form-stack">
        <input
          className="input"
          type="text"
          placeholder="Influencer naam"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          required
        />
        <input
          className="input"
          type="text"
          placeholder="Voornaam"
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
          required
        />
        <input
          className="input"
          type="text"
          placeholder="Achternaam"
          value={lastName}
          onChange={(event) => setLastName(event.target.value)}
        />
        <input
          className="input"
          type="email"
          placeholder="E-mailadres"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <input
          className="input"
          type="text"
          placeholder="Niche (bijv. fitness)"
          value={niche}
          onChange={(event) => setNiche(event.target.value)}
        />
        <input
          className="input"
          type="password"
          placeholder="Wachtwoord (minimaal 8 tekens)"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <button className="button" type="submit" disabled={loading}>
          {loading ? 'Bezig...' : 'Influencer account aanmaken'}
        </button>
      </form>

      {error ? <p className="error-text">{error}</p> : null}
      {message ? <p className="success-text">{message}</p> : null}
    </article>
  )
}

function UserLoginPanel() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [result, setResult] = useState<LocalUser | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setResult(null)
    setLoading(true)

    try {
      const user = await loginWithPassword(email.trim().toLowerCase(), password)
      setResult(user)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Inloggen mislukt.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <article className="card">
      <h2>Gebruiker inloggen</h2>
      <form onSubmit={onSubmit} className="form-stack">
        <input
          className="input"
          type="email"
          placeholder="E-mailadres"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <input
          className="input"
          type="password"
          placeholder="Wachtwoord"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <button className="button" type="submit" disabled={loading}>
          {loading ? 'Bezig...' : 'Inloggen'}
        </button>
      </form>
      {error ? <p className="error-text">{error}</p> : null}
      {result ? (
        <p className="success-text">
          Ingelogd als {result.firstName} ({result.type})
        </p>
      ) : null}
    </article>
  )
}

function AdminLoginPanel() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    try {
      await adminLogin(email.trim().toLowerCase(), password)
      setMessage('Admin login geverifieerd via edge function.')
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Admin login mislukt.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <article className="card">
      <h2>Admin login (edge function)</h2>
      <form onSubmit={onSubmit} className="form-stack">
        <input
          className="input"
          type="email"
          placeholder="Admin e-mailadres"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <input
          className="input"
          type="password"
          placeholder="Admin wachtwoord"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <button className="button" type="submit" disabled={loading}>
          {loading ? 'Bezig...' : 'Admin verifiëren'}
        </button>
      </form>
      {error ? <p className="error-text">{error}</p> : null}
      {message ? <p className="success-text">{message}</p> : null}
    </article>
  )
}
