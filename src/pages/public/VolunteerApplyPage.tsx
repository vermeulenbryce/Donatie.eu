import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  createVolunteerRequest,
  fetchMyVolunteerRequest,
  type VolunteerRequestRow,
} from '../../features/admin/adminContentService'
import { useLegacyUiSession } from '../../context/LegacyUiSessionContext'
import { isSupabaseConfigured } from '../../lib/supabase'

function normalizePhoneDigits(phone: string): string {
  return phone.replace(/\D/g, '')
}

export function VolunteerApplyPage() {
  const { shell } = useLegacyUiSession()
  const [existing, setExisting] = useState<VolunteerRequestRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [motivation, setMotivation] = useState('')
  const [availability, setAvailability] = useState('')
  const [phone, setPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const reload = useCallback(async () => {
    if (!shell?.user?.id || !isSupabaseConfigured) {
      setLoading(false)
      return
    }
    try {
      const row = await fetchMyVolunteerRequest(shell.user.id)
      setExisting(row)
      setErr(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Laden mislukt.')
    } finally {
      setLoading(false)
    }
  }, [shell?.user?.id])

  useEffect(() => {
    void reload()
  }, [reload])

  async function onSubmit() {
    setErr(null)
    setOk(null)
    if (!shell?.user?.id) {
      setErr('Je moet ingelogd zijn om je aan te melden.')
      return
    }
    if (motivation.trim().length < 10) {
      setErr('Vul een korte motivatie in (min. 10 tekens).')
      return
    }
    const digits = normalizePhoneDigits(phone)
    if (digits.length < 10) {
      setErr('Vul een geldig telefoonnummer in (minimaal 10 cijfers).')
      return
    }
    setSubmitting(true)
    try {
      await createVolunteerRequest({
        userId: shell.user.id,
        motivation,
        availability,
        phone: phone.trim(),
      })
      setOk('Je aanmelding is verstuurd. De admin neemt zo snel mogelijk een beslissing.')
      setMotivation('')
      setAvailability('')
      setPhone('')
      await reload()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Versturen mislukt.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!shell?.user?.id) {
    return (
      <main className="page container" style={{ padding: '32px 0 64px', maxWidth: 560 }}>
        <h1 className="dash-title">Vrijwilliger worden</h1>
        <p style={{ color: '#6b7280' }}>Log eerst in om je aan te melden.</p>
        <Link to="/auth" className="btn btn-dark" style={{ marginTop: 12, display: 'inline-block' }}>
          Inloggen of registreren
        </Link>
      </main>
    )
  }

  if (loading) {
    return (
      <main className="page container" style={{ padding: '48px 0' }}>
        <p style={{ color: '#6b7280' }}>Laden…</p>
      </main>
    )
  }

  if (existing && existing.status !== 'rejected') {
    return (
      <main className="page container" style={{ padding: '32px 0 64px', maxWidth: 560 }}>
        <h1 className="dash-title">Vrijwilligersstatus</h1>
        <div
          style={{
            background: existing.status === 'approved' ? '#ecfdf5' : '#fffbeb',
            border: `1.5px solid ${existing.status === 'approved' ? '#86efac' : '#fde68a'}`,
            borderRadius: 14,
            padding: 20,
            marginTop: 16,
          }}
        >
          <strong style={{ fontSize: '1rem' }}>
            {existing.status === 'approved'
              ? 'Je bent goedgekeurd als vrijwilliger. 🎉'
              : 'Je aanmelding is ontvangen en staat in de wachtrij.'}
          </strong>
          <p style={{ fontSize: '.88rem', color: '#374151', marginTop: 8 }}>
            Aangevraagd op {new Date(existing.created_at).toLocaleString('nl-NL')}.
          </p>
          {existing.reviewer_note ? (
            <p style={{ fontSize: '.88rem', color: '#374151', marginTop: 8 }}>
              Notitie van de admin: <em>{existing.reviewer_note}</em>
            </p>
          ) : null}
        </div>
        <Link to="/account" className="btn btn-outline" style={{ marginTop: 18, display: 'inline-block' }}>
          Terug naar mijn account
        </Link>
      </main>
    )
  }

  return (
    <main className="page container" style={{ padding: '32px 0 64px', maxWidth: 560 }}>
      <h1 className="dash-title">Word vrijwilliger</h1>
      <p style={{ color: '#6b7280', fontSize: '.92rem' }}>
        Help mee bij events, social media of ondersteuning. Vul onderstaand formulier in; de beheerder beoordeelt je
        aanmelding.
      </p>

      {err ? <p style={{ color: '#991b1b', marginTop: 12 }}>{err}</p> : null}
      {ok ? <p style={{ color: '#166534', marginTop: 12 }}>{ok}</p> : null}

      <label style={{ display: 'block', marginTop: 16 }}>
        <span style={{ fontSize: '.84rem', fontWeight: 600 }}>Motivatie *</span>
        <textarea
          className="input"
          rows={5}
          value={motivation}
          onChange={(e) => setMotivation(e.target.value)}
          placeholder="Waarom wil je vrijwilliger worden?"
          style={{ marginTop: 4, width: '100%' }}
        />
      </label>

      <label style={{ display: 'block', marginTop: 12 }}>
        <span style={{ fontSize: '.84rem', fontWeight: 600 }}>Beschikbaarheid</span>
        <input
          className="input"
          value={availability}
          onChange={(e) => setAvailability(e.target.value)}
          placeholder="bv. weekends, 4 uur per maand"
          style={{ marginTop: 4, width: '100%' }}
        />
      </label>

      <label style={{ display: 'block', marginTop: 12 }}>
        <span style={{ fontSize: '.84rem', fontWeight: 600 }}>Telefoon *</span>
        <input
          className="input"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+31 …"
          inputMode="tel"
          autoComplete="tel"
          style={{ marginTop: 4, width: '100%' }}
        />
      </label>

      <div style={{ marginTop: 18 }}>
        <button type="button" className="btn btn-dark" onClick={() => void onSubmit()} disabled={submitting}>
          {submitting ? 'Versturen…' : 'Aanmelding versturen'}
        </button>
      </div>
    </main>
  )
}
