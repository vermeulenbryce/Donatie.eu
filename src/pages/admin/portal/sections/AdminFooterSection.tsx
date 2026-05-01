import { useCallback, useEffect, useState } from 'react'
import {
  DEFAULT_FOOTER_DATA,
  getFooterData,
} from '../../../../features/public/footerLegacyData'
import { isFooterData } from '../../../../features/public/footerLive'
import {
  LEGAL_PAGE_TITLES,
  getDefaultLegalBlock,
  type LegalBlock,
} from '../../../../features/public/legalContentDefaults'
import {
  fetchFooterContentSetting,
  fetchLegalPagesSetting,
  saveFooterContentSetting,
  saveLegalPagesSetting,
  subscribeToTableChanges,
} from '../../../../features/admin/adminContentService'

function mergeLegalForEditor(server: Record<string, LegalBlock>): Record<string, LegalBlock> {
  const out: Record<string, LegalBlock> = {}
  for (const t of LEGAL_PAGE_TITLES) {
    out[t] = server[t] ?? getDefaultLegalBlock(t)
  }
  return out
}

function legalToServer(draft: Record<string, LegalBlock>): Record<string, LegalBlock> {
  const out: Record<string, LegalBlock> = {}
  for (const t of LEGAL_PAGE_TITLES) {
    const b = draft[t]
    if (b) out[t] = { intro: b.intro.trim(), bullets: b.bullets.map((x) => x.trim()).filter(Boolean) }
  }
  return out
}

export function AdminFooterSection() {
  const [footerText, setFooterText] = useState('')
  const [legalDraft, setLegalDraft] = useState<Record<string, LegalBlock> | null>(null)
  const [openLegal, setOpenLegal] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [jsonErr, setJsonErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [fromServer, legalRaw] = await Promise.all([
        fetchFooterContentSetting(),
        fetchLegalPagesSetting(),
      ])
      setFooterText(JSON.stringify(fromServer ?? getFooterData(), null, 2))
      setLegalDraft(mergeLegalForEditor(legalRaw))
      setJsonErr(null)
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

  function onValidateFooter() {
    try {
      const v = JSON.parse(footerText) as unknown
      if (!isFooterData(v)) {
        setJsonErr('JSON moet voldoen aan het FooterData-formaat (desc, copyright, badges, cols met links).')
        return
      }
      setJsonErr(null)
      setOk('JSON is geldig. Je kunt opslaan.')
      window.setTimeout(() => setOk(null), 3000)
    } catch (e) {
      setJsonErr(e instanceof Error ? e.message : 'Ongeldige JSON.')
    }
  }

  async function onSaveFooter() {
    try {
      const v = JSON.parse(footerText) as unknown
      if (!isFooterData(v)) {
        setJsonErr('Ongeldige footer-structuur. Gebruik “Valideer” voor details.')
        return
      }
      setSaving(true)
      setOk(null)
      await saveFooterContentSetting(v)
      setJsonErr(null)
      setOk('Footer opgeslagen. Live op de site.')
      window.setTimeout(() => setOk(null), 3000)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Opslaan mislukt.')
    } finally {
      setSaving(false)
    }
  }

  function setBlock(title: string, patch: Partial<LegalBlock>) {
    setLegalDraft((prev) => {
      if (!prev) return prev
      const cur = prev[title] ?? getDefaultLegalBlock(title)
      return { ...prev, [title]: { ...cur, ...patch } }
    })
  }

  async function onSaveLegal() {
    if (!legalDraft) return
    try {
      setSaving(true)
      setOk(null)
      await saveLegalPagesSetting(legalToServer(legalDraft))
      setOk('Juridische teksten opgeslagen. Live op /juridisch/*.')
      window.setTimeout(() => setOk(null), 3000)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Opslaan mislukt.')
    } finally {
      setSaving(false)
    }
  }

  if (loading || !legalDraft) {
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
        <h2 className="admin-portal-card-title">Footer (kolommen &amp; trust)</h2>
        <p className="admin-portal-card-sub">
          Opgeslagen in <code>site_settings.footer_content</code> (zelfde structuur als{' '}
          <code>footerLegacyData.ts</code> / <code>DEFAULT_FOOTER_DATA</code>). Publiek:{' '}
          <code>useLiveFooterData</code> (fallback: localStorage / standaard).
        </p>
        {jsonErr ? <p style={{ color: '#b91c1c' }}>{jsonErr}</p> : null}
        <textarea
          className="admin-portal-input"
          value={footerText}
          onChange={(e) => setFooterText(e.target.value)}
          rows={18}
          style={{ width: '100%', fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
        />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          <button type="button" className="admin-portal-btn is-ghost" onClick={onValidateFooter} disabled={saving}>
            Valideer JSON
          </button>
          <button type="button" className="admin-portal-btn" onClick={() => void onSaveFooter()} disabled={saving}>
            Footer opslaan
          </button>
          <button
            type="button"
            className="admin-portal-btn is-ghost"
            onClick={() => setFooterText(JSON.stringify(getFooterData(), null, 2))}
            disabled={saving}
          >
            Huidige runtime (o.a. localStorage) laden
          </button>
          <button
            type="button"
            className="admin-portal-btn is-ghost"
            onClick={() => setFooterText(JSON.stringify(DEFAULT_FOOTER_DATA, null, 2))}
            disabled={saving}
          >
            Vul met standaard
          </button>
        </div>
        <p className="admin-portal-card-sub" style={{ marginTop: 8 }}>
          Tip: gebruik <strong>Vul met standaard</strong> als startpunt, of bewerk in je IDE met de types uit{' '}
          <code>FooterData</code> in de codebase.
        </p>
      </div>

      <div className="admin-portal-card">
        <h2 className="admin-portal-card-title">Juridische pagina’s</h2>
        <p className="admin-portal-card-sub">
          Per pagina: intro + bullets. Opgeslagen in <code>site_settings.legal_pages</code>. Publiek overschrijft
          defaultteksten in <code>legalContentDefaults.ts</code> alleen voor titels die je hier bewaart.
        </p>
        {LEGAL_PAGE_TITLES.map((title) => {
          const b = legalDraft[title] ?? getDefaultLegalBlock(title)
          const open = openLegal === title
          return (
            <div
              key={title}
              style={{ border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: 8, overflow: 'hidden' }}
            >
              <button
                type="button"
                onClick={() => setOpenLegal(open ? null : title)}
                className="admin-portal-btn is-ghost"
                style={{
                  width: '100%',
                  justifyContent: 'space-between',
                  borderRadius: 0,
                  background: open ? 'rgba(26, 35, 126, 0.08)' : undefined,
                }}
              >
                <span style={{ fontWeight: 800 }}>{title}</span>
                <span>{open ? '▼' : '▶'}</span>
              </button>
              {open ? (
                <div style={{ padding: 12, display: 'grid', gap: 10 }}>
                  <label>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>Intro</div>
                    <textarea
                      className="admin-portal-input"
                      value={b.intro}
                      onChange={(e) => setBlock(title, { intro: e.target.value })}
                      rows={3}
                      style={{ width: '100%' }}
                    />
                  </label>
                  <label>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>Bulletpoints (één per regel)</div>
                    <textarea
                      className="admin-portal-input"
                      value={b.bullets.join('\n')}
                      onChange={(e) =>
                        setBlock(title, {
                          bullets: e.target.value
                            .split('\n')
                            .map((l) => l.trim())
                            .filter(Boolean),
                        })
                      }
                      rows={6}
                      style={{ width: '100%' }}
                    />
                  </label>
                </div>
              ) : null}
            </div>
          )
        })}
        <button
          type="button"
          className="admin-portal-btn"
          onClick={() => void onSaveLegal()}
          disabled={saving}
          style={{ marginTop: 8 }}
        >
          Juridische teksten opslaan
        </button>
      </div>
    </div>
  )
}
