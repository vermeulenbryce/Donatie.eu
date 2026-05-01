import { useCallback, useEffect, useState } from 'react'
import {
  fetchDonationAmountsSetting,
  saveDonationAmountsSetting,
  subscribeToTableChanges,
  type DonationAmountsConfig,
} from '../../../../features/admin/adminContentService'
import { getDefaultDonationAmounts } from '../../../../features/donations/donationSiteSettings'
import { isPartialDecimal, numberToInputString, parseDecimalOrNull } from '../../../../lib/adminNumberInput'

function parseBuckets(text: string): number[] {
  return text
    .split(/[\s,;]+/g)
    .map((s) => Number(s.replace(',', '.').trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
    .filter((n, i, a) => a.indexOf(n) === i)
    .sort((a, b) => a - b)
}

export function AdminBedragenSection() {
  const [form, setForm] = useState<DonationAmountsConfig | null>(null)
  const [minEenmaligStr, setMinEenmaligStr] = useState('')
  const [minMaandelijksStr, setMinMaandelijksStr] = useState('')
  const [bucketsText, setBucketsText] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const row = await fetchDonationAmountsSetting()
      setForm(row)
      setMinEenmaligStr(numberToInputString(row.eenmalig_min))
      setMinMaandelijksStr(numberToInputString(row.maandelijks_min))
      setBucketsText(row.default_buckets.join(', '))
      setErr(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Laden mislukt.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const u = subscribeToTableChanges('site_settings', load)
    return () => u()
  }, [load])

  async function onSave() {
    if (!form) return
    try {
      setSaving(true)
      setOk(null)
      const een = parseDecimalOrNull(minEenmaligStr)
      const mnd = parseDecimalOrNull(minMaandelijksStr)
      if (een == null || mnd == null) {
        setErr('Vul geldige minima in (euro, groter dan 0).')
        return
      }
      if (een <= 0 || mnd <= 0) {
        setErr('Minima moeten groter dan 0 zijn.')
        return
      }
      const next: DonationAmountsConfig = {
        ...form,
        eenmalig_min: een,
        maandelijks_min: mnd,
        default_buckets: parseBuckets(bucketsText),
      }
      if (next.default_buckets.length === 0) {
        setErr('Vul minstens één snelkoppelbedrag in.')
        return
      }
      await saveDonationAmountsSetting(next)
      setForm(next)
      setMinEenmaligStr(numberToInputString(next.eenmalig_min))
      setMinMaandelijksStr(numberToInputString(next.maandelijks_min))
      setBucketsText(next.default_buckets.join(', '))
      setErr(null)
      setOk('Opgeslagen. Minimale bedragen gelden direct voor nieuwe donaties (server + cache).')
      window.setTimeout(() => setOk(null), 4000)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Opslaan mislukt.')
    } finally {
      setSaving(false)
    }
  }

  if (loading || !form) {
    return (
      <div className="admin-portal-card">
        <p>Laden…</p>
      </div>
    )
  }

  return (
    <div>
      {err ? (
        <div className="admin-portal-card" style={{ borderLeft: '4px solid #dc2626' }}>
          <strong>Fout:</strong> {err}
        </div>
      ) : null}
      {ok ? (
        <div className="admin-portal-card" style={{ borderLeft: '4px solid #4ade80' }}>
          {ok}
        </div>
      ) : null}

      <div className="admin-portal-card">
        <h2 className="admin-portal-card-title">Donatiebedragen</h2>
        <p className="admin-portal-card-sub">
          Opgeslagen in <code>site_settings.donation_amounts</code>. Wordt gebruikt door{' '}
          <code>createDonation</code> (minimale bedragen). Snelkoppelbedragen zijn bedoeld voor toekomstige UI; nu
          nog grotendeels legacy constanten in de doneermodal.
        </p>
        <div style={{ display: 'grid', gap: 12, maxWidth: 420 }}>
          <label>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Minimum eenmalig (€)</div>
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              className="admin-portal-input"
              value={minEenmaligStr}
              onChange={(e) => {
                const v = e.target.value
                if (isPartialDecimal(v)) setMinEenmaligStr(v)
              }}
              onBlur={() => {
                const n = parseDecimalOrNull(minEenmaligStr)
                if (n != null) setMinEenmaligStr(numberToInputString(n))
              }}
            />
          </label>
          <label>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Minimum maandelijks (€)</div>
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              className="admin-portal-input"
              value={minMaandelijksStr}
              onChange={(e) => {
                const v = e.target.value
                if (isPartialDecimal(v)) setMinMaandelijksStr(v)
              }}
              onBlur={() => {
                const n = parseDecimalOrNull(minMaandelijksStr)
                if (n != null) setMinMaandelijksStr(numberToInputString(n))
              }}
            />
          </label>
          <label>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Snelkoppelbedragen (€, komma of spatie gescheiden)</div>
            <input
              className="admin-portal-input"
              value={bucketsText}
              onChange={(e) => setBucketsText(e.target.value)}
              placeholder="5, 10, 25, 50, 100"
            />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          <button type="button" className="admin-portal-btn" onClick={() => void onSave()} disabled={saving}>
            {saving ? 'Opslaan…' : 'Opslaan'}
          </button>
          <button
            type="button"
            className="admin-portal-btn is-ghost"
            onClick={() => {
              const d = getDefaultDonationAmounts()
              setForm(d)
              setMinEenmaligStr(numberToInputString(d.eenmalig_min))
              setMinMaandelijksStr(numberToInputString(d.maandelijks_min))
              setBucketsText(d.default_buckets.join(', '))
            }}
            disabled={saving}
          >
            Standaardwaarden
          </button>
        </div>
      </div>
    </div>
  )
}
