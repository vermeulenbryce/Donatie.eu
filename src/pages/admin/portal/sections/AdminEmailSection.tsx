import { useCallback, useEffect, useState } from 'react'
import {
  deleteSiteEmailTemplate,
  fetchSiteEmailTemplates,
  subscribeToTableChanges,
  upsertSiteEmailTemplate,
  type SiteEmailTemplateRow,
} from '../../../../features/admin/adminContentService'
import { sendEdgeEmail } from '../../../../services/edgeFunctions'

const empty = { key: '', subject: '', html: '' }

export function AdminEmailSection() {
  const [rows, setRows] = useState<SiteEmailTemplateRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ key: string; subject: string; html: string; editingKey: string | null }>({
    ...empty,
    editingKey: null,
  })
  const [saving, setSaving] = useState(false)
  const [testTo, setTestTo] = useState('')
  const [testBusy, setTestBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setRows(await fetchSiteEmailTemplates())
      setErr(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Laden mislukt.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const u = subscribeToTableChanges('site_email_templates', load)
    return () => u()
  }, [load])

  async function onSave() {
    if (!draft.key.trim() || !draft.subject.trim() || !draft.html.trim()) {
      setErr('Key, onderwerp en HTML-body zijn verplicht.')
      return
    }
    try {
      setSaving(true)
      setOk(null)
      await upsertSiteEmailTemplate({
        key: draft.key,
        subject: draft.subject,
        html: draft.html,
      })
      setErr(null)
      setOk('Opgeslagen.')
      window.setTimeout(() => setOk(null), 4000)
      setDraft({ ...empty, editingKey: null })
      void load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Opslaan mislukt.')
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(key: string) {
    if (!window.confirm(`Sjabloon "${key}" verwijderen?`)) return
    const prev = rows
    setRows((list) => list.filter((r) => r.key !== key))
    try {
      await deleteSiteEmailTemplate(key)
      if (draft.editingKey === key) setDraft({ ...empty, editingKey: null })
    } catch (e) {
      setRows(prev)
      setErr(e instanceof Error ? e.message : 'Verwijderen mislukt.')
    }
  }

  function onEdit(r: SiteEmailTemplateRow) {
    setDraft({
      key: r.key,
      subject: r.subject,
      html: r.html,
      editingKey: r.key,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function onTestSend() {
    const k = (draft.key || draft.editingKey || '').trim()
    if (!k || !testTo.trim()) {
      setErr('Vul een sjabloon-key in (of kies bewerken) en een geldig test e-mailadres.')
      return
    }
    try {
      setTestBusy(true)
      setErr(null)
      setOk(null)
      await sendEdgeEmail({
        to: testTo.trim(),
        type: k,
        payload: {
          name: 'Testgebruiker',
          amount: '10,00',
        },
      })
      setOk('Testmail verzonden (controleer Resend/inkbox).')
      window.setTimeout(() => setOk(null), 5000)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Verzenden mislukt. Controleer Edge Function `send-email` en secrets.')
    } finally {
      setTestBusy(false)
    }
  }

  if (loading) {
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
          {/relation|does not exist|site_email_templates/i.test(err) ? (
            <p style={{ marginTop: 8, fontSize: '.88rem' }}>
              Voer in Supabase uit: <code>docs/SQL_ADMIN_EMAIL_TEMPLATES.sql</code>
            </p>
          ) : null}
        </div>
      ) : null}
      {ok ? (
        <div className="admin-portal-card" style={{ borderLeft: '4px solid #4ade80' }}>
          {ok}
        </div>
      ) : null}

      <div className="admin-portal-card">
        <h2 className="admin-portal-card-title">E-mail templates</h2>
        <p className="admin-portal-card-sub">
          Opgeslagen in <code>public.site_email_templates</code>. Verzending via Edge Function <code>send-email</code>{' '}
          (Resend: secrets <code>RESEND_API_KEY</code> en <code>EMAIL_FROM</code>). In onderwerp en HTML kun je
          placeholders gebruiken, bv. <code>{'{{name}}'}</code>, <code>{'{{amount}}'}</code> — die worden vervangen met
          de <code>payload</code> van de aanroep.
        </p>
      </div>

      <div className="admin-portal-card">
        <h3 className="admin-portal-card-title" style={{ fontSize: '1.02rem' }}>
          {draft.editingKey ? `Bewerken: ${draft.editingKey}` : 'Nieuw of bewerk sjabloon'}
        </h3>
        <div className="admin-portal-row" style={{ marginTop: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: '.78rem', fontWeight: 700, color: '#6b7280' }}>Key (technisch)</span>
            <input
              className="admin-portal-input"
              value={draft.key}
              onChange={(e) => setDraft((d) => ({ ...d, key: e.target.value }))}
              placeholder="bijv. welcome, donation_paid"
              disabled={Boolean(draft.editingKey)}
              aria-label="Template key"
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: '.78rem', fontWeight: 700, color: '#6b7280' }}>Onderwerp</span>
            <input
              className="admin-portal-input"
              value={draft.subject}
              onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))}
              placeholder="E-mailonderwerp (mag {{placeholders}} bevatten)"
            />
          </label>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
          <span style={{ fontSize: '.78rem', fontWeight: 700, color: '#6b7280' }}>HTML-body</span>
          <textarea
            className="admin-portal-textarea"
            value={draft.html}
            onChange={(e) => setDraft((d) => ({ ...d, html: e.target.value }))}
            rows={12}
            placeholder="<p>Beste {{name}},</p>..."
            spellCheck={false}
          />
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 16 }}>
          <button type="button" className="admin-portal-btn" onClick={() => void onSave()} disabled={saving}>
            {saving ? 'Opslaan…' : 'Opslaan'}
          </button>
          <button
            type="button"
            className="admin-portal-btn is-ghost"
            onClick={() => setDraft({ ...empty, editingKey: null })}
          >
            Wissen
          </button>
        </div>

        <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #e5e7eb' }}>
          <h4 style={{ fontSize: '.9rem', fontWeight: 800, marginBottom: 8, color: '#374151' }}>Testverzending</h4>
          <p className="admin-portal-card-sub" style={{ marginTop: 0 }}>
            Alleen met gedeployde <code>send-email</code> + actieve Resend. Gebruikt huidige key + voorbeeldpayload (name
            / amount).
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', maxWidth: 480 }}>
            <input
              className="admin-portal-input"
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="jouw@adres voor test"
            />
            <button type="button" className="admin-portal-btn is-ghost" disabled={testBusy} onClick={() => void onTestSend()}>
              {testBusy ? 'Verzenden…' : 'Stuur test'}
            </button>
          </div>
        </div>
      </div>

      <div className="admin-portal-card">
        <h3 className="admin-portal-card-title" style={{ fontSize: '1.02rem' }}>
          Sjablonen
        </h3>
        {rows.length === 0 ? (
          <div className="admin-portal-empty">Nog geen sjablonen. Voer de SQL-migratie uit of voeg hierboven toe.</div>
        ) : (
          <div className="admin-portal-table-wrap">
            <table className="admin-portal-table">
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Onderwerp</th>
                  <th>Bijgewerkt</th>
                  <th style={{ textAlign: 'right' }}>Acties</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td>
                      <code>{r.key}</code>
                    </td>
                    <td style={{ maxWidth: 360 }}>{r.subject}</td>
                    <td style={{ fontSize: '.78rem', color: '#6b7280', whiteSpace: 'nowrap' }}>
                      {new Date(r.updated_at).toLocaleString('nl-NL')}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button type="button" className="admin-portal-btn is-ghost" onClick={() => onEdit(r)}>
                        Bewerken
                      </button>
                      <button
                        type="button"
                        className="admin-portal-btn is-danger"
                        style={{ marginLeft: 6 }}
                        onClick={() => void onDelete(r.key)}
                      >
                        Verwijder
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
