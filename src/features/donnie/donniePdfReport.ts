import type { LegacyShellUser } from '../../context/LegacyUiSessionContext'

function readAccounts(): Record<string, Record<string, unknown>> {
  try {
    return JSON.parse(localStorage.getItem('dnl_accounts') || '{}') as Record<string, Record<string, unknown>>
  } catch {
    return {}
  }
}

/** Same output as legacy `donnieGeneratePDF` — HTML download + follow-up message. */
export function runDonniePdfReport(
  type: 'particulier' | 'bedrijf' | 'influencer',
  shell: LegacyShellUser | null,
  onFollowUp: (text: string) => void,
): void {
  if (!shell?.user && shell?.source !== 'demo') {
    onFollowUp('⚠️ Log eerst in om een rapport te genereren.')
    return
  }

  const now = new Date()
  const year = now.getFullYear()
  const nowStr = now.toLocaleDateString('nl-NL', { day: '2-digit', month: 'long', year: 'numeric' })
  const allAcc = readAccounts()

  const css =
    '<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:12px;color:#1f2937;padding:32px}h1{font-size:20px;font-weight:900;color:#1a237e;margin-bottom:4px}h2{font-size:13px;font-weight:700;color:#1a237e;margin:20px 0 8px;border-bottom:2px solid #e5e7eb;padding-bottom:4px}table{width:100%;border-collapse:collapse;margin-bottom:12px}th,td{padding:8px 10px;text-align:left;border-bottom:1px solid #f1f5f9;font-size:11px}th{background:#f8fafc;font-weight:700}.badge{background:#d1fae5;color:#065f46;border-radius:4px;padding:2px 6px;font-size:10px;font-weight:700}.big{font-size:18px;font-weight:900;color:#1a237e}.sub{color:#6b7280;font-size:11px}</style>'

  let html = ''
  const filename = `donatie-rapport-${year}.html`

  if (type === 'particulier') {
    const email = shell!.email
    const u = shell!.user
    const a =
      allAcc[email] ||
      (shell!.source === 'demo'
        ? {
            donations: shell!.previewDonations ?? [],
            points: shell!.points,
            totalDonated: shell!.totalDonated,
          }
        : {})
    const dd = (a.donations as Record<string, unknown>[]) || []
    const md = ((a.monthlyDonations as Record<string, unknown>[]) || []).filter((d) => d.status !== 'gestopt')
    const yt = dd
      .filter((d) => d.date && String(d.date).includes(String(year)))
      .reduce((s, d) => s + (parseFloat(String(d.amount)) || 0), 0)
    const ta =
      (a.totalDonated as number) ||
      dd.reduce((s, d) => s + (parseFloat(String(d.amount)) || 0), 0)
    const fn = u ? `${u.firstName} ${u.lastName}`.trim() : shell!.displayName || 'Donateur'
    html = `<h1>Donatie-overzicht ${fn}</h1><p class="sub">Gegenereerd op ${nowStr} · Donatie.eu</p><h2>Samenvatting ${year}</h2><p class="big">€${yt.toFixed(2)} gedoneerd in ${year}</p><p class="sub">Totaal ooit: €${ta.toFixed(2)} · Maandelijks: €${md.reduce((s, d) => s + (parseFloat(String(d.amount)) || 0), 0).toFixed(2)}</p><h2>Donaties ${year}</h2><table><tr><th>Datum</th><th>Goed doel</th><th>Bedrag</th><th>Status</th></tr>${dd
      .filter((d) => d.date && String(d.date).includes(String(year)))
      .map(
        (d) =>
          `<tr><td>${String(d.date || '-')}</td><td>${String(d.cause || d.org || '-')}</td><td>€${parseFloat(String(d.amount || 0)).toFixed(2)}</td><td><span class="badge">✅ CBF</span></td></tr>`,
      )
      .join('')}</table><h2>Actieve periodieke donaties</h2><table><tr><th>Organisatie</th><th>Bedrag/mnd</th></tr>${md
      .map(
        (d) =>
          `<tr><td>${String(d.org || '-')}</td><td>€${parseFloat(String(d.amount || 0)).toFixed(2)}</td></tr>`,
      )
      .join('')}</table><p class="sub">Giften aan ANBI-erkende goede doelen zijn fiscaal aftrekbaar.</p>`
  } else if (type === 'bedrijf' && shell!.user?.type === 'bedrijf') {
    const a = allAcc[shell!.email] || {}
    html = `<h1>Fiscaal rapport ${String(a.bedrijfsnaam || shell!.user.firstName)}</h1><p class="sub">Gegenereerd op ${nowStr} · Donatie.eu</p><p>Donaties: <strong>€${Number(a.totalDonated || 0).toFixed(2)}</strong> · Punten: ${Number(a.points || 0)}</p>`
  } else if (type === 'influencer' && shell!.user?.type === 'influencer') {
    const a = allAcc[shell!.email] || {}
    html = `<h1>Influencer rapport ${String(a.inflNaam || shell!.user.firstName)}</h1><p class="sub">Gegenereerd op ${nowStr} · Donatie.eu</p><p>Punten: ${Number(a.points || 0)}</p>`
  } else {
    onFollowUp('⚠️ Log eerst in om een rapport te genereren.')
    return
  }

  const full = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Donatie Rapport ${year}</title>${css}</head><body>${html}</body></html>`
  const blob = new Blob([full], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.target = '_blank'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.setTimeout(() => URL.revokeObjectURL(url), 5000)
  onFollowUp('✅ Je rapport is gedownload! Open het bestand en klik op "Afdrukken" om het als PDF op te slaan.')
}
