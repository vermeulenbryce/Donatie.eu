import { CBF_CAUSES, type LegacyCbfCause } from '../legacy/cbfCauses.generated'
import type { DonnieContext, DonnieUserType } from './donnieContext'

export type DonnieAnswer = { text: string; html?: string; chips?: string[] }

export type DonnieNav = {
  /** Legacy: outer delay, then close chat, then inner delay, then path/callback */
  schedule: (outerMs: number, action: () => void) => void
  go: (path: string) => void
}

function pdfBtn(kind: 'particulier' | 'bedrijf' | 'influencer'): string {
  const label =
    kind === 'particulier' ? 'PDF belastingoverzicht' : kind === 'bedrijf' ? 'Download fiscaal rapport' : 'PDF rapport'
  return `<br><button type="button" class="donnie-pdf-btn" data-donnie-pdf="${kind}">📄 ${label}</button>`
}

const CAUSE_KEYWORDS: { keys: string[]; id: number; naam: string }[] = [
  { keys: ['amnesty', 'mensenrechten', 'politieke gevangenen'], id: 8, naam: 'Amnesty International NL' },
  { keys: ['artsen zonder grenzen', 'msf', 'noodhulp medisch'], id: 1, naam: 'Artsen zonder Grenzen' },
  { keys: ['unicef', 'kinderrechten', 'vaccin'], id: 3, naam: 'UNICEF Nederland' },
  { keys: ['oxfam', 'novib', 'armoede wereldwijd'], id: 2, naam: 'Oxfam Novib' },
  { keys: ['wwf', 'panda', 'wilde dieren', 'natuurbehoud'], id: 6, naam: 'WWF Nederland' },
  { keys: ['rode kruis', 'rampenhulp', 'bloedbank'], id: 7, naam: 'Rode Kruis' },
  { keys: ['greenpeace', 'klimaat actie', 'oceaan plastic'], id: 9, naam: 'Greenpeace Nederland' },
  { keys: ['save the children', 'kinderen conflict'], id: 10, naam: 'Save the Children NL' },
  { keys: ['giro 555', 'noodhulp ramp'], id: 11, naam: 'Giro 555' },
  { keys: ['plan international', 'meisjesrechten'], id: 12, naam: 'Plan International NL' },
  { keys: ['vluchtelingenwerk', 'asielzoekers'], id: 13, naam: 'VluchtelingenWerk NL' },
  { keys: ['war child', 'kinderen oorlog'], id: 14, naam: 'War Child Nederland' },
  { keys: ['kwf', 'kanker', 'kankerfonds'], id: 4, naam: 'KWF Kankerbestrijding' },
  { keys: ['hartstichting', 'hartaanval', 'cardiovasculair'], id: 5, naam: 'Hartstichting' },
  { keys: ['alzheimer', 'dementie'], id: 15, naam: 'Alzheimer Nederland' },
  { keys: ['diabetes', 'diabetesfonds'], id: 16, naam: 'Diabetesfonds' },
  { keys: ['longfonds', 'copd', 'astma'], id: 17, naam: 'Longfonds' },
  { keys: ['nierstichting', 'dialyse'], id: 18, naam: 'Nierstichting' },
  { keys: ['dierenbescherming', 'asieldieren'], id: 19, naam: 'Dierenbescherming' },
  { keys: ['natuur milieu', 'natuur en milieu'], id: 20, naam: 'Natuur & Milieu' },
  { keys: ['milieudefensie', 'fossiele brandstoffen'], id: 21, naam: 'Milieudefensie' },
  { keys: ['vogelbeschemring', 'vogelstand'], id: 22, naam: 'Vogelbescherming NL' },
  { keys: ['ivn', 'natuureducatie'], id: 23, naam: 'IVN Natuureducatie' },
  { keys: ['leger des heils', 'dakloos', 'verslaving'], id: 24, naam: 'Leger des Heils' },
  { keys: ['voedselbank', 'honger nederland'], id: 25, naam: 'Voedselbanken Nederland' },
  { keys: ['reuma', 'reumafonds'], id: 28, naam: 'Reumafonds' },
  { keys: ['ms fonds', 'multiple sclerose'], id: 29, naam: 'Nationaal MS Fonds' },
  { keys: ['kinderpostzegels', 'kansarme kinderen'], id: 30, naam: 'Kinderpostzegels' },
  { keys: ['wakker dier', 'dierenwelzijn vee'], id: 40, naam: 'Wakker Dier' },
  { keys: ['terre des hommes', 'kinderarbeid'], id: 41, naam: 'Terre des Hommes NL' },
  { keys: ['hivos', 'democratie ontwikkeling'], id: 43, naam: 'Hivos' },
  { keys: ['zoa', 'wederopbouw'], id: 44, naam: 'ZOA' },
  { keys: ['aidsfonds', 'hiv', 'aids'], id: 48, naam: 'Aidsfonds' },
  { keys: ['hulphond', 'assistentiehond'], id: 45, naam: 'Hulphond Nederland' },
]

function eur(n: unknown): string {
  return `€${(parseFloat(String(n)) || 0).toFixed(2)}`
}
function pts(n: unknown): string {
  return (parseInt(String(n), 10) || 0).toLocaleString('nl-NL')
}

function accDonations(acc: Record<string, unknown>): Record<string, unknown>[] {
  return (acc.donations as Record<string, unknown>[]) || []
}
function accMonthly(acc: Record<string, unknown>): Record<string, unknown>[] {
  return ((acc.monthlyDonations as Record<string, unknown>[]) || []).filter((d) => d.status !== 'gestopt')
}
function cy(): number {
  return new Date().getFullYear()
}
function ydons(acc: Record<string, unknown>): Record<string, unknown>[] {
  return accDonations(acc).filter((d) => d.date && String(d.date).includes(String(cy())))
}
function ytotal(acc: Record<string, unknown>): number {
  return ydons(acc).reduce((s, d) => s + (parseFloat(String(d.amount)) || 0), 0)
}
function maandTot(acc: Record<string, unknown>): number {
  return accMonthly(acc).reduce((s, d) => s + (parseFloat(String(d.amount)) || 0), 0)
}
function totalAll(acc: Record<string, unknown>): number {
  if (acc.totalDonated !== undefined && acc.totalDonated !== null && acc.totalDonated !== '') {
    const td = parseFloat(String(acc.totalDonated))
    if (!Number.isNaN(td)) return td
  }
  return accDonations(acc).reduce((s, d) => s + (parseFloat(String(d.amount)) || 0), 0)
}

function matchCbfCause(ql: string): LegacyCbfCause | null {
  let best: LegacyCbfCause | null = null
  let score = 0
  for (const c of CBF_CAUSES) {
    let s = 0
    const nl = c.naam.toLowerCase()
    if (ql.includes(nl)) s += 10
    for (const part of nl.split(/\s+/)) {
      if (part.length >= 4 && ql.includes(part)) s += 3
    }
    const compact = nl.replace(/[^a-z0-9]/g, '')
    const qlc = ql.replace(/[^a-z0-9]/g, '')
    if (compact.length >= 4 && qlc.includes(compact.substring(0, Math.min(8, compact.length)))) s += 5
    for (const n of c.niches || []) {
      if (ql.includes(n.toLowerCase().substring(0, 6))) s += 1
    }
    if (s > score) {
      score = s
      best = c
    }
  }
  return score >= 3 ? best : null
}

function navToCause(nav: DonnieNav, id: number, delay = 1400): void {
  nav.schedule(delay, () => {
    nav.go(`/goede-doelen?causeId=${id}`)
  })
}

function navToPath(nav: DonnieNav, path: string, delay = 1200): void {
  nav.schedule(delay, () => {
    nav.go(path)
  })
}

function chipDefaults(type: DonnieUserType): string[] {
  if (type === 'gast') return ['Welke goede doelen?', 'Hoe doneer ik?', 'Hoe werken de punten?', 'CBF keurmerk']
  if (type === 'particulier')
    return ['Hoeveel heb ik gedoneerd?', 'Mijn punten', 'Actieve donaties', 'Goede doelen bekijken']
  if (type === 'bedrijf') return ['Community overzicht', 'Campagnes', 'Fiscaal rapport', 'Goede doelen']
  return ['Community leden', 'Campagnes', 'Totaal opgehaald', 'Donaties']
}

/** Port of legacy `donnieAnswer` — zelfde routes/intents, React-navigatie i.p.v. `showPage`. */
export function answerDonnieQuestion(q: string, ctx: DonnieContext, nav: DonnieNav): DonnieAnswer {
  const ql = q.toLowerCase().trim()
  const acc = ctx.acc || {}
  const naam = ctx.naam || 'je'
  const type = ctx.type

  if (type === 'particulier') {
    if (ql.match(/hoeveel.*doneer|totaal.*doneer|gedoneerd|doneer.*totaal|hoeveel.*geg/)) {
      const byDoel: Record<string, number> = {}
      accDonations(acc).forEach((d) => {
        const g = String(d.cause || d.org || 'Onbekend')
        byDoel[g] = (byDoel[g] || 0) + (parseFloat(String(d.amount)) || 0)
      })
      const top = Object.entries(byDoel)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([k, v]) => `• ${k}: <strong>${eur(v)}</strong>`)
        .join('\n')
      return {
        text: `💶 <strong>Donaties van ${naam}</strong>\n\n🔢 Totaal ooit: <strong>${eur(totalAll(acc))}</strong>\n📅 Dit jaar (${cy()}): <strong>${eur(ytotal(acc))}</strong>\n🗓️ Per maand: <strong>${eur(maandTot(acc))}</strong>\n\n${top}`,
        html: accDonations(acc).length ? pdfBtn('particulier') : '',
        chips: ['Mijn punten', 'Actieve donaties', 'Per goed doel'],
      }
    }
    if (ql.match(/punt|niveau|level/)) {
      const p = (acc.points as number) || 0
      const lvl = p >= 5000 ? '🥇 Platina' : p >= 1000 ? '🥈 Goud' : p >= 100 ? '🥉 Actief' : '🌱 Starter'
      return {
        text: `⭐ <strong>Punten van ${naam}</strong>\n\n${pts(p)} punten · ${lvl}\n\n€1 doneren = 10 pts · Maandelijks = 2× · Sticker = +50 · Uitnodiging = +100`,
        chips: ['Ranglijst positie', 'Mijn badges', 'Totaal gedoneerd'],
      }
    }
    if (ql.match(/actief|lopend|periodiek|maandelijk/)) {
      const md = accMonthly(acc)
      return {
        text: `📋 <strong>Actieve donaties ${naam}</strong>\n\n${
          md.length
            ? md.map((d) => `• ${String(d.org || d.cause || '?')}: <strong>${eur(d.amount)}/mnd</strong>`).join('\n')
            : 'Geen actieve periodieke donaties.'
        }\n\n💶 Totaal maandelijks: <strong>${eur(maandTot(acc))}</strong>`,
        chips: ['Totaal gedoneerd', 'PDF belastingen'],
      }
    }
    if (ql.match(/badge|prestatie|award/)) {
      const b = (acc.badges as string[]) || []
      return {
        text: `🏅 <strong>Badges van ${naam}</strong>\n\n${
          b.length
            ? b.map((x) => `• ${x}`).join('\n')
            : 'Nog geen badges. Doe een donatie om je eerste badge te verdienen!'
        }\n\nVerdien badges door te doneren, vrienden uit te nodigen en vrijwilligerswerk.`,
        chips: ['Mijn punten', 'Totaal gedoneerd'],
      }
    }
    if (ql.match(/rang|positie|leaderboard|lijst/)) {
      return {
        text: `🏆 <strong>Ranglijst</strong>\n\n⭐ Je hebt <strong>${pts(acc.points || 0)} punten</strong>.\n\nBekijk de live ranglijst via het menu "Ranglijst".`,
        chips: ['Mijn punten', 'Totaal gedoneerd'],
      }
    }
    if (ql.match(/pdf|rapport|belasting|aftrek|aangifte/)) {
      return {
        text: `📄 <strong>Belastingoverzicht voor ${naam}</strong>\n\n${eur(ytotal(acc))} gedoneerd in ${cy()} (${ydons(acc).length} donaties).\n\nGiften aan ANBI-erkende goede doelen zijn fiscaal aftrekbaar. Download hieronder je PDF-rapport.`,
        html: pdfBtn('particulier'),
        chips: ['Totaal gedoneerd', 'Actieve donaties'],
      }
    }
    if (ql.match(/sticker|deur|brievenbus/)) {
      const st = Boolean(acc.sticker)
      return {
        text: `🏷️ ${
          st
            ? `${naam} heeft al een deursticker! ✓ Collectanten zien dat je al digitaal bijdraagt.`
            : `${naam} heeft nog geen sticker. Bestel gratis via "Sticker bestellen" en verdien +50 punten!`
        }\n\nJe hebt nu <strong>${pts(acc.points || 0)} punten</strong>.`,
        chips: ['Mijn punten', 'Totaal gedoneerd'],
      }
    }
  }

  if (type === 'bedrijf') {
    const comms = (ctx.extra.comms || []) as { naam?: string; members?: unknown[] }[]
    const camps = (ctx.extra.camps || []) as { title?: string; raised?: number; goal?: number }[]
    const totMem = comms.reduce((s, c) => s + (c.members?.length || 0), 0)
    if (ql.match(/community|leden|aanmeld/)) {
      return {
        text: `🏘️ <strong>Communities van ${naam}</strong>\n\n${comms.length} communities · ${totMem} leden\n\n${
          comms.length ? comms.slice(0, 4).map((c) => `• ${c.naam || '?'}: ${c.members?.length || 0} leden`).join('\n') : 'Nog geen communities.'
        }`,
        chips: ['Campagnes', 'Team donaties', 'Fiscaal rapport'],
      }
    }
    if (ql.match(/campagne|project|actie/)) {
      return {
        text: `🚀 <strong>Campagnes van ${naam}</strong>\n\n${camps.length} campagnes\n\n${
          camps.length
            ? camps.slice(0, 3).map((c) => `• ${c.title || '?'}: €${(c.raised || 0).toFixed(2)} / €${c.goal || 0} doel`).join('\n')
            : 'Nog geen campagnes.'
        }`,
        chips: ['Community leden', 'Fiscaal rapport'],
      }
    }
    if (ql.match(/pdf|rapport|fiscaal|belasting/)) {
      return {
        text: `📄 <strong>Fiscaal rapport voor ${naam}</strong>\n\n${comms.length} communities · ${totMem} leden\n\nDownload het rapport hieronder.`,
        html: pdfBtn('bedrijf'),
        chips: ['Community leden', 'Campagnes'],
      }
    }
  }

  if (type === 'influencer') {
    const comms = (ctx.extra.comms || []) as { naam?: string; members?: unknown[] }[]
    const camps = (ctx.extra.camps || []) as { title?: string; raised?: number }[]
    const totMem = comms.reduce((s, c) => s + (c.members?.length || 0), 0)
    const totRsd = camps.reduce((s, c) => s + (c.raised || 0), 0)
    if (ql.match(/community|leden/)) {
      return {
        text: `🏘️ <strong>Communities van ${naam}</strong>\n\n${comms.length} communities · ${totMem} leden\n\n${
          comms.slice(0, 4).map((c) => `• ${c.naam || '?'}: ${c.members?.length || 0} leden`).join('\n') || 'Nog geen communities.'
        }`,
        chips: ['Campagnes', 'Totaal opgehaald'],
      }
    }
    if (ql.match(/campagne|opgehal|totaal|resultaat/)) {
      return {
        text: `🚀 <strong>Campagnes van ${naam}</strong>\n\n${camps.length} campagnes · €${totRsd.toFixed(2)} totaal opgehaald\n\n${camps
          .slice(0, 3)
          .map((c) => `• ${c.title || '?'}: €${(c.raised || 0).toFixed(2)}`)
          .join('\n')}`,
        html: pdfBtn('influencer'),
        chips: ['Community leden', 'Mijn punten'],
      }
    }
    if (ql.match(/punt/)) {
      return {
        text: `⭐ Je hebt <strong>${pts(acc.points || 0)} punten</strong>, ${naam}!`,
        chips: ['Campagnes', 'Community leden'],
      }
    }
    if (ql.match(/pdf|rapport/)) {
      return {
        text: '📄 Download je influencer-rapport.',
        html: pdfBtn('influencer'),
        chips: ['Campagnes', 'Community leden'],
      }
    }
  }

  if (
    ql.match(
      /punt|puntensysteem|hoe.*verdien|spar|beloning|level|niveau|badge|multiplier|streak|uitwissel|redeem|kortingsbon|weekendje|belon/,
    )
  ) {
    return {
      text:
        '⭐ <strong>Puntensysteem</strong>\n\n' +
        '💶 <strong>Punten verdienen:</strong>\n' +
        '• €1 doneren = 0,5 punt\n' +
        '• Terugkerende donatie = ×1,2 multiplier\n' +
        '• Campagnebonus = ×1,5 multiplier\n' +
        '• Sticker kopen = +50–100 punten\n' +
        '• 3 maanden streak = +5 bonus/maand\n' +
        '• Vriend uitnodigen = +25 punten\n\n' +
        '🎁 <strong>Punten inwisselen voor:</strong>\n' +
        '• Kortingsbonnen (Bol.com, HEMA, Coolblue)\n' +
        '• Weekendjes weg & uitjes\n' +
        '• Producten & loterijen\n' +
        '• Goede doelen donaties\n\n' +
        '🏆 <strong>Niveaus:</strong>\n' +
        'Starter (0) → Donateur → Elite → Legende (1500+)\n\n' +
        'Bekijk alle details op de Puntensysteem pagina!',
      chips: ['Hoe doneer ik?', 'Ranglijst bekijken', 'Beloningen bekijken', 'Start project'],
    }
  }
  if (ql.match(/ranglijst|rang|leaderboard|top.*donor/)) {
    navToPath(nav, '/ranglijst', 1200)
    return {
      text: '🏆 Ik open de ranglijst voor je! Zie wie er het meest heeft gedoneerd en vergelijk jouw punten. Een moment...',
      chips: ['Puntensysteem', 'Goede doelen bekijken'],
    }
  }
  if (ql.match(/cbf|keurmerk|betrouwbaar|erkend/)) {
    return {
      text: '✅ <strong>CBF-keurmerk</strong>\n\nHet CBF (Centraal Bureau Fondsenwerving) toetst goede doelen onafhankelijk op transparantie en bestedingen. Alle doelen op Donatie.eu hebben een officieel CBF-keurmerk — jij weet zeker dat jouw donatie goed terechtkomt.',
      chips: ['Welke goede doelen?', 'ANBI aftrek uitleg'],
    }
  }
  if (ql.match(/anbi|belasting|aftrek|aangifte|fiscaal/)) {
    return {
      text:
        '🏛️ <strong>Fiscale aftrek</strong>\n\nGiften aan ANBI-erkende goede doelen zijn fiscaal aftrekbaar in Nederland. De meeste CBF-erkende doelen hebben ook ANBI-status.\n\n' +
        (type === 'particulier' ? 'Jij kunt een PDF-overzicht downloaden voor je belastingaangifte.' : 'Log in voor een persoonlijk PDF-rapport.'),
      html: type === 'particulier' ? pdfBtn('particulier') : '',
      chips: ['CBF keurmerk', 'Goede doelen bekijken'],
    }
  }
  if (ql.match(/hoe.*doneer|doneer.*hoe|begin.*doneer|eerste.*donati/)) {
    return {
      text: '💳 <strong>Zo doneer je</strong>\n\n1. Kies een goed doel op de "Goede doelen" pagina\n2. Klik op "Doneer nu"\n3. Kies een bedrag (eenmalig of maandelijks)\n4. Betaal via iDEAL, creditcard of SEPA\n\nMaandelijkse donaties verdienen 2× zoveel punten!',
      chips: ['Goede doelen bekijken', 'Betaalmethoden'],
    }
  }
  if (ql.match(/betaal|ideal|creditcard|sepa|paypal|tikkie|applepay/)) {
    return {
      text: '💳 <strong>Betaalmethoden</strong>\n\nWe accepteren: iDEAL, creditcard (Visa/Mastercard), SEPA-incasso en meer.\n\nAlle betalingen zijn beveiligd via onze payment provider.',
      chips: ['Hoe doneer ik?', 'Kosten uitleg'],
    }
  }
  if (ql.match(/kost|gratis|prijs|kosten/)) {
    return {
      text: '💰 Donatie.eu is <strong>volledig gratis</strong> voor donateurs. Er worden geen administratiekosten ingehouden op jouw gift — het volledige bedrag gaat naar het goede doel.',
      chips: ['Hoe doneer ik?', 'CBF keurmerk'],
    }
  }
  if (ql.match(/sticker|deursticker|voordeur|fondsenwerver/)) {
    navToPath(nav, '/sticker-bestellen', 1200)
    return {
      text: '🏷️ De gratis Donatie.eu deursticker laat collectanten zien dat jij al digitaal geeft! Verdien ook +50 punten. Ik open de stickerpagina...',
      chips: ['Puntensysteem', 'Hoe doneer ik?'],
    }
  }
  if (ql.match(/goede.*doel|doel.*goede|welke.*org|organisaties/) && !ql.match(/doneer|geef|steun/)) {
    const n = CBF_CAUSES.length
    const voorb = CBF_CAUSES.slice(0, 5)
      .map((c) => c.naam)
      .join(', ')
    return {
      text: `🇳🇱 <strong>Goede doelen</strong>\n\n${n}+ CBF-erkende organisaties, zoals: ${voorb} en meer.\n\nFilter op categorie op de Goede doelen-pagina of zoek op naam.`,
      chips: ['Doneer aan Amnesty', 'Doneer aan KWF', 'Doneer aan Rode Kruis', 'Alle goede doelen overzicht'],
    }
  }
  if (ql.match(/account|aanmak|registr|inlog|aanmeld/)) {
    return {
      text: '👤 <strong>Account aanmaken</strong>\n\nKlik op "Inloggen" rechts boven en kies registreren. Je kunt aanmelden als donateur, bedrijf of influencer.\n\nRegistreren is gratis!',
      chips: ['Puntensysteem', 'Hoe doneer ik?'],
    }
  }
  if (ql.match(/influencer|creator/)) {
    return {
      text: '⭐ <strong>Influencer worden</strong>\n\nAls influencer kun je communities aanmaken en je volgers mobiliseren voor goede doelen.\n\nRegistreer via "Inloggen".',
      chips: ['Puntensysteem', 'Goede doelen bekijken'],
    }
  }
  if (ql.match(/bedrijf|csr|maatschappelijk|team.*donati|corporate/)) {
    return {
      text: '🏢 <strong>Bedrijven op Donatie.eu</strong>\n\nAls bedrijf kun je een community aanmaken en campagnes starten — ideaal voor MVO/CSR-rapportage.',
      chips: ['Community uitleg', 'Campagne starten'],
    }
  }

  const navIntentie = ql.match(/doneer|geef|steun|bijdrag|help|support|info|meer.*over|vertel.*over|bekijk|pagina|gaan naar/)
  const causeMatch = matchCbfCause(ql)
  if (causeMatch && navIntentie) {
    const isDoneer = ql.match(/doneer|geef|steun|bijdrag|help|schenk/)
    const isInfo = ql.match(/info|meer.*over|vertel|wat.*is|wie.*is|bekijk|pagina|open|gaan naar/)
    if (isDoneer || isInfo || ql.includes(causeMatch.naam.toLowerCase())) {
      navToCause(nav, causeMatch.id, 1400)
      return {
        text: `🎯 Ik stuur je door naar <strong>${causeMatch.naam}</strong>!\n\nDaar kun je direct je donatiebedrag kiezen. Een moment...`,
        chips: ['Andere goede doelen', 'Welke goede doelen?'],
      }
    }
  }

  const donationIntent = ql.match(/doneer|donatie|geven|bijdragen|steunen|schenken|helpen|storten|sponsoren|willen.*geven/)
  const infoIntent = ql.match(/wat is|wie is|vertel|meer over|info over|informatie|hoe werkt|what is|tell me/)

  let matchedCause: (typeof CAUSE_KEYWORDS)[0] | null = null
  for (const cEntry of CAUSE_KEYWORDS) {
    for (const k of cEntry.keys) {
      if (ql.includes(k)) {
        matchedCause = cEntry
        break
      }
    }
    if (matchedCause) break
  }

  if (matchedCause) {
    const cId = matchedCause.id
    const cNaam = matchedCause.naam
    if (donationIntent) {
      navToCause(nav, cId, 1400)
      return {
        text: `💝 Geweldig dat je <strong>${cNaam}</strong> wil steunen!\n\nIk open de pagina van ${cNaam} voor je. Daar zie je alle info en kun je direct doneren. Een moment...`,
        chips: ['Hoe doneer ik?', 'CBF keurmerk', 'Andere goede doelen'],
      }
    }
    if (infoIntent) {
      navToCause(nav, cId, 1400)
      return {
        text: `📋 Ik open de pagina van <strong>${cNaam}</strong> voor je met alle informatie en donatieoptie. Een moment...`,
        chips: ['Doneren', 'Andere goede doelen', 'CBF keurmerk'],
      }
    }
    navToCause(nav, cId, 1800)
    return {
      text: `🔍 <strong>${cNaam}</strong> is een CBF-erkend goed doel. Ik open nu de detailpagina voor je.`,
      chips: ['Doneer aan ' + cNaam.split(' ')[0], 'Andere goede doelen', 'Hoe doneer ik?'],
    }
  }

  if (donationIntent && !matchedCause) {
    navToPath(nav, '/goede-doelen', 1400)
    return {
      text: '💝 Super dat je wil doneren! Ik open het overzicht van alle CBF-erkende goede doelen.\n\nKies een doel dat bij jou past!',
      chips: ['Hoe doneer ik?', 'CBF keurmerk', 'Punten verdienen'],
    }
  }

  if (ql.match(/goede doel|goed doel|organisatie|stichting/) || (ql.match(/cbf|anbi/) && ql.match(/lijst|overzicht|alle/))) {
    navToPath(nav, '/goede-doelen', 1400)
    return {
      text: '📋 Ik open het overzicht van alle CBF-erkende goede doelen! Een moment...',
      chips: ['Hoe doneer ik?', 'CBF keurmerk', 'Punten verdienen'],
    }
  }

  if (ql.match(/puntenwinkel|winkel|inwisselen|cadeaubon/)) {
    navToPath(nav, '/account', 1400)
    return {
      text: '🛍️ <strong>Puntenwinkel</strong>\n\nWissel je spaarpunten in voor cadeaubonnen, merchandise en meer.\n\nIk open je dashboard (Puntenwinkel)…',
      chips: ['Puntensysteem', 'Mijn punten', 'Ranglijst'],
    }
  }

  if (ql.match(/dashboard|mijn.*profiel|mijn.*account|mijn.*pagina/)) {
    navToPath(nav, '/account', 1200)
    return {
      text: '👤 Ik open je dashboard! Daar zie je al je donaties, punten en badges. Even geduld...',
      chips: ['Mijn punten', 'Totaal gedoneerd'],
    }
  }

  if (ql.match(/^(hallo|hoi|hey|hi|dag|goedemorgen|goedemiddag|goedenavond|heey|heyy)[\s!.]*$/)) {
    const greet = naam && naam !== 'je' ? `Hoi ${naam.split(' ')[0]}!` : 'Hoi!'
    return {
      text: `${greet} 👋 Ik ben Donnie, jouw Donatie.eu assistent.\n\nIk help je met:\n💝 Doneren aan goede doelen\n⭐ Punten & beloningen\n📋 CBF-erkende organisaties\n💰 Fiscale aftrek\n\nWaar kan ik je mee helpen?`,
      chips:
        type === 'gast'
          ? ['Welke goede doelen?', 'Hoe doneer ik?', 'Hoe werken de punten?', 'CBF keurmerk']
          : ['Hoeveel heb ik gedoneerd?', 'Mijn punten', 'Goede doelen bekijken'],
    }
  }
  if (ql.match(/bedankt|dankjewel|dank je|dank u|thanks|thank you/)) {
    return {
      text: 'Graag gedaan! 😊 Is er nog iets anders waar ik je mee kan helpen?',
      chips: type === 'gast' ? ['Welke goede doelen?', 'Hoe doneer ik?'] : ['Hoeveel heb ik gedoneerd?', 'Mijn punten'],
    }
  }

  const fallbackTexts = [
    'Ik snap je vraag niet helemaal 😊 Maar ik help je graag met donaties, goede doelen, punten of fiscale aftrek!',
    'Hmm, dat begrijp ik nog niet goed. Probeer het anders te formuleren, of kies een onderwerp hieronder!',
    'Goede vraag, maar ik ben er niet helemaal uit 🤔 Ik kan je helpen met doneren, punten sparen, CBF-doelen en meer!',
  ]
  return {
    text: fallbackTexts[Math.floor(Math.random() * fallbackTexts.length)],
    chips: chipDefaults(type),
  }
}

export function donnieChipSet(type: DonnieUserType): string[] {
  if (type === 'gast') return ['Hoe werken de punten?', 'Welke goede doelen?', 'Hoe doneer ik?', 'CBF keurmerk uitleg', 'Is het gratis?', 'Sticker aanvragen']
  if (type === 'particulier')
    return ['Hoeveel heb ik gedoneerd?', 'Mijn punten & niveau', 'Ranglijst positie', 'Actieve donaties', 'PDF belastingoverzicht', 'Mijn badges']
  if (type === 'bedrijf')
    return ['Community overzicht', 'Team donaties', 'Campagnes', 'Teamleden uitnodigen', 'Fiscaal rapport PDF', 'Onze goede doelen']
  return ['Mijn communities', 'Campagne resultaten', 'Totaal opgehaald', 'Mijn punten', 'PDF rapport', 'Nieuwe leden werven']
}

export function donnieGreetingHtml(ctx: DonnieContext): string {
  const greet: Record<DonnieUserType, string> = {
    gast: '👋 Hoi! Ik ben <strong>Donnie</strong>, jouw gids op Donatie.eu!\n\nIk weet alles over ons platform: puntensysteem, goede doelen, ranglijsten en meer. Stel gerust een vraag!',
    particulier: `Hoi <strong>${ctx.naam}</strong>! 👋 Welkom terug.\n\nIk heb toegang tot jouw donaties, punten en ranglijstpositie. Stel gerust een vraag!`,
    bedrijf: `Goedemiddag <strong>${ctx.naam}</strong>! 👋\n\nIk kan jullie community-cijfers, team donaties en campagneresultaten ophalen. Wat wil je weten?`,
    influencer: `Hey <strong>${ctx.naam}</strong>! ⭐\n\nIk zie je communities en campagnes. Vraag maar raak!`,
  }
  return greet[ctx.type] || greet.gast
}
