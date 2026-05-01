import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchPointsConfigSetting,
  savePointsConfigSetting,
  subscribeToTableChanges,
} from '../../../../features/admin/adminContentService'
import { getDefaultPointsConfig } from '../../../../features/donations/donationSiteSettings'
import { isPartialDecimal, numberToInputString, parseDecimalOrNull } from '../../../../lib/adminNumberInput'

export function AdminPuntenSection() {
  const [divisorStr, setDivisorStr] = useState('')
  const [pointsStr, setPointsStr] = useState('')
  const [exampleStr, setExampleStr] = useState('20')
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const row = await fetchPointsConfigSetting()
      setDivisorStr(numberToInputString(row.divisor))
      setPointsStr(numberToInputString(row.pointsPerTenEuro))
      setErr(null)
      setReady(true)
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

  const preview = useMemo(() => {
    const d = parseDecimalOrNull(divisorStr)
    const p = parseDecimalOrNull(pointsStr)
    const ex = parseDecimalOrNull(exampleStr)
    if (d == null || d <= 0 || p == null || p < 0 || ex == null) return 0
    return Math.max(0, Math.round((ex / d) * p))
  }, [divisorStr, pointsStr, exampleStr])

  async function onSave() {
    try {
      setSaving(true)
      setOk(null)
      const d = parseDecimalOrNull(divisorStr)
      const p = parseDecimalOrNull(pointsStr)
      if (d == null || d <= 0) {
        setErr('Divisor moet groter dan 0 zijn.')
        return
      }
      if (p == null || p < 0) {
        setErr('Punten mogen niet negatief; vul een geldig getal in.')
        return
      }
      await savePointsConfigSetting({ divisor: d, pointsPerTenEuro: p })
      setDivisorStr(numberToInputString(d))
      setPointsStr(numberToInputString(p))
      setErr(null)
      setOk('Opgeslagen. Punten-preview bij donaties gebruikt dit direct (na cache-refresh).')
      window.setTimeout(() => setOk(null), 4000)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Opslaan mislukt.')
    } finally {
      setSaving(false)
    }
  }

  if (loading || !ready) {
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
        <h2 className="admin-portal-card-title">Puntensysteem (donatie → punten)</h2>
        <p className="admin-portal-card-sub">
          Opgeslagen in <code>site_settings.points_config</code>. Formule:{' '}
          <code>punten = round((bedrag / divisor) × puntenPerDivisorEenheid)</code>. Standaard is dat gelijk aan{' '}
          <strong>5 punten per €10</strong> (divisor 10, waarde 5).
        </p>
        <div style={{ display: 'grid', gap: 12, maxWidth: 420 }}>
          <label>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Divisor (euro per “stap”)</div>
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              className="admin-portal-input"
              value={divisorStr}
              onChange={(e) => {
                const v = e.target.value
                if (isPartialDecimal(v)) setDivisorStr(v)
              }}
              onBlur={() => {
                const n = parseDecimalOrNull(divisorStr)
                if (n != null) setDivisorStr(numberToInputString(n))
              }}
            />
          </label>
          <label>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Punten per divisor-euro (bijv. 5 = 5 pt per €10 als divisor=10)</div>
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              className="admin-portal-input"
              value={pointsStr}
              onChange={(e) => {
                const v = e.target.value
                if (isPartialDecimal(v)) setPointsStr(v)
              }}
              onBlur={() => {
                const n = parseDecimalOrNull(pointsStr)
                if (n != null) setPointsStr(numberToInputString(n))
              }}
            />
          </label>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Voorbeeld (€)</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                className="admin-portal-input"
                value={exampleStr}
                onChange={(e) => {
                  const v = e.target.value
                  if (isPartialDecimal(v)) setExampleStr(v)
                }}
                onBlur={() => {
                  const n = parseDecimalOrNull(exampleStr)
                  if (n != null) setExampleStr(numberToInputString(n))
                }}
                style={{ maxWidth: 120 }}
              />
              <span>
                → <strong>{preview}</strong> punten
              </span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          <button type="button" className="admin-portal-btn" onClick={() => void onSave()} disabled={saving}>
            {saving ? 'Opslaan…' : 'Opslaan'}
          </button>
          <button
            type="button"
            className="admin-portal-btn is-ghost"
            onClick={() => {
              const d = getDefaultPointsConfig()
              setDivisorStr(numberToInputString(d.divisor))
              setPointsStr(numberToInputString(d.pointsPerTenEuro))
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
