export type FooterLinkType = 'page' | 'url' | 'pdf'

export type FooterLink = {
  label: string
  type: FooterLinkType
  target: string
}

export type FooterCol = {
  title: string
  links: FooterLink[]
}

export type FooterData = {
  desc: string
  copyright: string
  badges: string[]
  cols: FooterCol[]
}

export const FOOTER_STORAGE_KEY = 'dnl_footer'

/** Mirrors `DEFAULT_FOOTER_DATA` in legacy `index.html`. */
export const DEFAULT_FOOTER_DATA: FooterData = {
  desc: 'Het moderne, transparante donatieplatform voor Nederland. Verdien punten, bouw een community en geef met vertrouwen.',
  copyright: '© 2025 Donatie.eu · Alle geldstromen via Stichting Derdengelden',
  badges: ['✅ ANBI', '🔒 Stichting Derdengelden', '🇳🇱 Made in NL'],
  cols: [
    {
      title: 'Platform',
      links: [
        { label: 'Goede doelen', type: 'page', target: 'doelen' },
        { label: 'Ranglijst', type: 'page', target: 'ranglijst' },
        { label: 'Start project', type: 'page', target: 'start-project' },
        { label: 'Denk mee', type: 'page', target: 'blog' },
        { label: 'Nieuws', type: 'page', target: 'nieuws' },
        { label: 'Sticker bestellen', type: 'page', target: 'sticker' },
        { label: 'FAQ', type: 'page', target: 'hoe-het-werkt' },
      ],
    },
    {
      title: 'Account',
      links: [
        { label: 'Inloggen', type: 'page', target: 'auth' },
        { label: 'Aanmelden', type: 'page', target: 'auth' },
        { label: 'Dashboard', type: 'page', target: 'dashboard' },
        { label: 'Puntensysteem', type: 'page', target: 'puntensysteem' },
      ],
    },
    {
      title: 'Juridisch',
      links: [
        { label: 'Privacybeleid', type: 'pdf', target: '' },
        { label: 'Algemene voorwaarden', type: 'pdf', target: '' },
        { label: 'ANBI-info', type: 'pdf', target: '' },
        { label: 'Transparantie', type: 'pdf', target: '' },
        { label: 'Anti-fraude beleid', type: 'pdf', target: '' },
        { label: 'Contact', type: 'url', target: 'mailto:info@donatie.nl' },
      ],
    },
    {
      title: 'Privacy',
      links: [
        { label: 'Privacybeleid', type: 'pdf', target: '' },
        { label: 'Cookieverklaring', type: 'pdf', target: '' },
        { label: 'Gegevensverwerking', type: 'pdf', target: '' },
        { label: 'AVG / GDPR', type: 'pdf', target: '' },
        { label: 'Recht op inzage', type: 'pdf', target: '' },
        { label: 'Gegevens verwijderen', type: 'url', target: 'mailto:privacy@donatie.eu' },
      ],
    },
  ],
}

/**
 * Legacy `PAGE_HREF_MAP` in `renderFooter()` plus targets used in default columns
 * that were missing there (otherwise href became `#`).
 */
export const FOOTER_PAGE_HREF: Record<string, string> = {
  home: '/',
  sticker: '/sticker-bestellen',
  doelen: '/goede-doelen',
  blog: '/denk-mee',
  ranglijst: '/ranglijst',
  'start-project': '/start-project',
  puntensysteem: '/puntensysteem',
  'hoe-het-werkt': '/faq',
  nieuws: '/nieuws',
  auth: '/auth',
  dashboard: '/account',
}

function cloneDefault(): FooterData {
  return JSON.parse(JSON.stringify(DEFAULT_FOOTER_DATA)) as FooterData
}

export function getFooterData(): FooterData {
  try {
    const stored = localStorage.getItem(FOOTER_STORAGE_KEY)
    return stored ? (JSON.parse(stored) as FooterData) : cloneDefault()
  } catch {
    return cloneDefault()
  }
}
