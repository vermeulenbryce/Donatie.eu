import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLegacyUiSession } from '../../context/LegacyUiSessionContext'
import { isSupabaseConfigured } from '../../lib/supabase'
import {
  charityLabelFromCauseKey,
  communityProjectShareUrl,
  fetchCommunityProjectForDonation,
  type FetchCommunityProjectDonationResult,
} from '../../features/community/communityProjectsService'
import {
  attachMollieCheckoutInfo,
  createDonation,
  initiateMollieCheckoutContract,
} from '../../features/donations/donationsService'
import type { Project } from '../../types/domain'

export function CommunityProjectDonatePage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { shell } = useLegacyUiSession()
  const [project, setProject] = useState<Project | null>(null)
  const [access, setAccess] = useState<FetchCommunityProjectDonationResult['status'] | 'loading'>('loading')
  const [amount, setAmount] = useState(10)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!projectId || !isSupabaseConfigured) {
        if (!cancelled) {
          setAccess('not_found')
          setProject(null)
        }
        return
      }
      const r = await fetchCommunityProjectForDonation(projectId, shell?.user?.id ?? null)
      if (cancelled) return
      if (r.status === 'ok') {
        setProject(r.project)
        setAccess('ok')
      } else {
        setProject(null)
        setAccess(r.status)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [projectId, shell?.user?.id])

  const charityName = useMemo(() => charityLabelFromCauseKey(project?.charity_cause_key), [project])

  async function startCheckout() {
    setMsg(null)
    if (!shell?.user?.id) {
      setMsg({ ok: false, text: 'Log in om te doneren.' })
      return
    }
    if (!project?.id || !project.charity_cause_key) {
      setMsg({ ok: false, text: 'Project niet gevonden of geen goed doel gekoppeld.' })
      return
    }
    if (!Number.isFinite(amount) || amount < 5) {
      setMsg({ ok: false, text: 'Minimaal € 5 voor een community-projectdonatie.' })
      return
    }

    setBusy(true)
    try {
      const donation = await createDonation({
        donorUserId: shell.user.id,
        donorEmail: shell.email,
        donorName: `${shell.firstName} ${shell.lastName}`.trim() || shell.email,
        charityName,
        amount,
        type: 'eenmalig',
        projectId: project.id,
        charityCauseKey: project.charity_cause_key,
      })

      const mollie = await initiateMollieCheckoutContract({
        donationId: donation.id,
        amount,
        donorEmail: shell.email,
        donorName: `${shell.firstName} ${shell.lastName}`.trim() || undefined,
        charityName,
        donationType: 'eenmalig',
      })

      await attachMollieCheckoutInfo({
        donationId: donation.id,
        molliePaymentId: mollie.molliePaymentId,
        checkoutUrl: mollie.checkoutUrl,
      })

      if (mollie.checkoutUrl) {
        window.location.href = mollie.checkoutUrl
        return
      }

      setMsg({
        ok: false,
        text:
          mollie.message ||
          'Betaling kon niet worden gestart. Controleer Mollie-secrets of probeer later opnieuw.',
      })
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Donatie starten mislukt.' })
    } finally {
      setBusy(false)
    }
  }

  if (access === 'loading') {
    return (
      <main className="page container" style={{ padding: '48px 0' }}>
        <p style={{ color: '#6b7280' }}>Laden…</p>
      </main>
    )
  }

  if (access !== 'ok' || !project) {
    const extra =
      access === 'members_only_need_login' ? (
        <>
          <p style={{ color: '#6b7280' }}>
            Dit project is alleen zichtbaar voor communityleden. Log in met het account waarmee je lid of sponsor bent.
          </p>
          <Link to="/auth" className="btn btn-dark" style={{ marginTop: 16, display: 'inline-block' }}>
            Inloggen of registreren
          </Link>
        </>
      ) : access === 'members_only_forbidden' ? (
        <p style={{ color: '#6b7280' }}>
          Dit project is alleen voor leden en sponsors van de community. Je account hoort (nog) niet bij deze community.
        </p>
      ) : (
        <p style={{ color: '#6b7280' }}>Dit project bestaat niet (meer), is niet actief, of is niet beschikbaar.</p>
      )

    return (
      <main className="page container" style={{ padding: '48px 0', textAlign: 'center' }}>
        <h1 className="dash-title">
          {access === 'members_only_need_login'
            ? 'Log in vereist'
            : access === 'members_only_forbidden'
              ? 'Geen toegang'
              : 'Project niet gevonden'}
        </h1>
        {extra}
        <Link to="/" className="btn btn-outline" style={{ marginTop: 20, display: 'inline-block' }}>
          Naar home
        </Link>
      </main>
    )
  }

  const shareUrl = communityProjectShareUrl(project.id)

  return (
    <main className="page container" style={{ padding: '32px 0 64px', maxWidth: 560 }}>
      <div style={{ marginBottom: 20 }}>
        <Link to="/" style={{ fontSize: '.85rem', color: '#3b82f6' }}>
          ← Terug
        </Link>
      </div>
      <div
        style={{
          background: 'linear-gradient(135deg,#eff6ff,#e0e7ff)',
          border: '1.5px solid #bfdbfe',
          borderRadius: 16,
          padding: 22,
          marginBottom: 22,
        }}
      >
        <div style={{ fontSize: '.72rem', fontWeight: 800, letterSpacing: '.08em', color: '#1d4ed8', marginBottom: 6 }}>
          COMMUNITY-PROJECT
        </div>
        <h1 style={{ fontFamily: 'Fraunces,serif', fontSize: '1.45rem', margin: '0 0 8px', color: '#1e3a8a' }}>
          {project.title}
        </h1>
        <div style={{ fontSize: '.88rem', color: '#4338ca', fontWeight: 600 }}>Goed doel: {charityName}</div>
        {project.description ? (
          <p style={{ fontSize: '.88rem', color: '#475569', marginTop: 12, marginBottom: 0 }}>{project.description}</p>
        ) : null}
        <div style={{ fontSize: '.78rem', color: '#64748b', marginTop: 10 }}>
          Doel: €{Number(project.target_amount ?? 0).toLocaleString('nl-NL')}
        </div>
        {project.visibility === 'members_only' ? (
          <p style={{ fontSize: '.78rem', color: '#64748b', marginTop: 8, marginBottom: 0 }}>
            Donaties aan dit project zijn <strong>alleen eenmalig</strong> (geen maandelijkse incasso).
          </p>
        ) : null}
      </div>

      <div style={{ background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 16, padding: 20 }}>
        <h2 style={{ fontSize: '1rem', marginTop: 0 }}>Doneren</h2>
        <p style={{ fontSize: '.82rem', color: '#6b7280', marginTop: 0 }}>
          Community-projecten: <strong>alleen eenmalige</strong> donatie. Punten worden na betaling pas{' '}
          <strong>definitief na 72 uur</strong>; bij een terugboeking binnen die periode vervallen ze.
        </p>

        {!shell?.user?.id ? (
          <div style={{ marginTop: 16 }}>
            <p style={{ color: '#991b1b', fontSize: '.9rem' }}>Log in om verder te gaan.</p>
            <Link to="/auth" className="btn btn-dark" style={{ marginTop: 8, display: 'inline-block' }}>
              Inloggen of registreren
            </Link>
          </div>
        ) : (
          <>
            <label style={{ display: 'block', fontSize: '.82rem', fontWeight: 600, marginBottom: 8 }}>Bedrag (EUR)</label>
            <input
              type="number"
              min={5}
              step="1"
              className="input"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              style={{ maxWidth: 200, marginBottom: 16 }}
            />
            <div>
              <button type="button" className="btn btn-blue" disabled={busy} onClick={() => void startCheckout()}>
                {busy ? 'Bezig…' : 'Ga afrekenen (Mollie)'}
              </button>
            </div>
          </>
        )}

        {msg ? (
          <p style={{ marginTop: 14, fontSize: '.85rem', color: msg.ok ? '#166534' : '#991b1b' }}>{msg.text}</p>
        ) : null}
      </div>

      <p style={{ fontSize: '.75rem', color: '#9ca3af', marginTop: 20 }}>
        Deel-link:{' '}
        <a href={shareUrl} style={{ color: '#6b7280', wordBreak: 'break-all' }}>
          {shareUrl}
        </a>
      </p>
    </main>
  )
}
