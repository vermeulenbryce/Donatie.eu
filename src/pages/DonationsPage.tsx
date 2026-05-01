import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  attachMollieCheckoutInfo,
  createDonation,
  fetchRecentDonations,
  getMollieIntegrationStatus,
  initiateMollieCheckoutContract,
  markDonationAsPaid,
} from '../features/donations/donationsService'
import type { Donation } from '../types/domain'
import { supabase } from '../lib/supabase'

export function DonationsPage() {
  const [donations, setDonations] = useState<Donation[]>([])
  const [donorName, setDonorName] = useState('')
  const [donorEmail, setDonorEmail] = useState('')
  const [charityName, setCharityName] = useState('')
  const [amount, setAmount] = useState('')
  const [donationType, setDonationType] = useState<'eenmalig' | 'maandelijks'>('eenmalig')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const mollie = getMollieIntegrationStatus()

  async function loadDonations() {
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const data = await fetchRecentDonations(25)
      setDonations(data)
      setMessage(`${data.length} donaties geladen.`)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Donaties laden mislukt.')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateDonation(event: FormEvent) {
    event.preventDefault()
    if (!amount || Number(amount) <= 0) {
      setError('Bedrag moet groter zijn dan 0.')
      return
    }

    setLoading(true)
    setError('')
    setMessage('')
    try {
      if (!supabase) {
        throw new Error('Supabase is nog niet geconfigureerd.')
      }

      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError || !userData.user) {
        throw new Error('Je moet ingelogd zijn om te doneren.')
      }

      const created = await createDonation({
        donorUserId: userData.user.id,
        donorName: donorName.trim() || undefined,
        donorEmail: donorEmail.trim() || undefined,
        charityName: charityName.trim() || undefined,
        amount: Number(amount),
        type: donationType,
      })

      const contract = await initiateMollieCheckoutContract({
        donationId: created.id,
        amount: created.amount,
        donorEmail: created.donor_email ?? undefined,
        donorName: created.donor_name ?? undefined,
        charityName: created.charity_name ?? undefined,
        donationType,
      })

      if (contract.mode === 'live') {
        await attachMollieCheckoutInfo({
          donationId: created.id,
          molliePaymentId: contract.molliePaymentId,
          checkoutUrl: contract.checkoutUrl,
        })
      }

      setDonations((prev) => [
        {
          ...created,
          mollie_payment_id: contract.molliePaymentId ?? created.mollie_payment_id,
          checkout_url: contract.checkoutUrl ?? created.checkout_url,
        },
        ...prev,
      ])
      setMessage(contract.message)
      setDonorName('')
      setDonorEmail('')
      setCharityName('')
      setAmount('')
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Donatie aanmaken mislukt.')
    } finally {
      setLoading(false)
    }
  }

  async function simulatePaid(donationId: string) {
    setError('')
    setMessage('')
    try {
      await markDonationAsPaid(donationId)
      setDonations((prev) =>
        prev.map((donation) =>
          donation.id === donationId
            ? { ...donation, status: 'paid', paid_at: new Date().toISOString() }
            : donation,
        ),
      )
      setMessage('Donatie gemarkeerd als paid (simulatie).')
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Status update mislukt.')
    }
  }

  return (
    <main className="app-shell">
      <header>
        <h1>Donations slice (Mollie-ready)</h1>
        <p>
          Donaties kunnen nu opgeslagen en beheerd worden zonder Mollie-account. Checkout koppelen we
          later in op deze structuur.
        </p>
      </header>

      <section className="card">
        <h2>Payment provider status</h2>
        <p>
          Provider: <strong>{mollie.provider}</strong>
        </p>
        <p>Status: {mollie.connected ? 'Verbonden' : 'Nog niet verbonden'}</p>
        <p className="hint">{mollie.message}</p>
      </section>

      <section className="card">
        <h2>Nieuwe donatie (pending)</h2>
        <p className="hint">
          Voorwaarden: eenmalig minimaal EUR 5, maandelijks minimaal EUR 10. Inloggen is verplicht.
        </p>
        <form onSubmit={handleCreateDonation} className="form-stack">
          <input
            className="input"
            type="text"
            placeholder="Donor naam"
            value={donorName}
            onChange={(event) => setDonorName(event.target.value)}
          />
          <input
            className="input"
            type="email"
            placeholder="Donor e-mail"
            value={donorEmail}
            onChange={(event) => setDonorEmail(event.target.value)}
          />
          <input
            className="input"
            type="text"
            placeholder="Goed doel naam"
            value={charityName}
            onChange={(event) => setCharityName(event.target.value)}
          />
          <select
            className="input"
            value={donationType}
            onChange={(event) => setDonationType(event.target.value as 'eenmalig' | 'maandelijks')}
          >
            <option value="eenmalig">Eenmalig</option>
            <option value="maandelijks">Maandelijks</option>
          </select>
          <input
            className="input"
            type="number"
            min="1"
            step="1"
            placeholder="Bedrag"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            required
          />
          <button className="button" type="submit" disabled={loading}>
            {loading ? 'Bezig...' : 'Donatie opslaan'}
          </button>
        </form>
        {error ? <p className="error-text">{error}</p> : null}
        {message ? <p className="success-text">{message}</p> : null}
      </section>

      <section className="card">
        <h2>Recente donaties</h2>
        <div className="action-row">
          <button type="button" className="button secondary" onClick={() => void loadDonations()} disabled={loading}>
            {loading ? 'Laden...' : 'Verversen'}
          </button>
        </div>
        {donations.length === 0 ? <p className="hint">Nog geen donaties geladen.</p> : null}
        {donations.length > 0 ? (
          <div className="table-wrap">
            <table className="overview-table">
              <thead>
                <tr>
                  <th>Donor</th>
                  <th>Goed doel</th>
                  <th>Bedrag</th>
                  <th>Naar doel (80%)</th>
                  <th>Behouden (20%)</th>
                  <th>Status</th>
                  <th>Checkout</th>
                  <th>Actie</th>
                </tr>
              </thead>
              <tbody>
                {donations.map((donation) => (
                  <tr key={donation.id}>
                    <td>{donation.donor_name ?? donation.donor_email ?? '-'}</td>
                    <td>{donation.charity_name ?? '-'}</td>
                    <td>{donation.amount}</td>
                    <td>{donation.amount_to_charity ?? '-'}</td>
                    <td>{donation.amount_retained ?? '-'}</td>
                    <td>{donation.status}</td>
                    <td>
                      {donation.checkout_url ? (
                        <a href={donation.checkout_url} target="_blank" rel="noreferrer">
                          Open
                        </a>
                      ) : (
                        <span className="hint">pending</span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() => void simulatePaid(donation.id)}
                        disabled={donation.status === 'paid'}
                      >
                        Simuleer paid
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="card">
        <Link to="/">Terug naar home</Link>
      </section>
    </main>
  )
}
